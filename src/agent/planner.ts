import type { ToolExecutionContext } from "./toolRegistry.js";
import { toolRegistry, executeRegisteredTool, listRegisteredTools } from "./toolRegistry.js";
import type { ToolCallTraceEntry } from "./trace.js";
import type { RawJob } from "../schemas.js";

// Planner for Milestone 4 demo.
// Behavior:
// - If an llmClient is available in context, ask it to produce a JSON plan (safe schema), validate the plan, and execute step-by-step.
// - Otherwise, fall back to the previous heuristic planner implemented below.

type LlmPlanStep = { tool: string; args?: Record<string, unknown> };
type LlmPlan = { plan: LlmPlanStep[]; maxSteps?: number; stopCondition?: string };

function getMockPlan(goal: string): LlmPlan {
  const g = goal.toLowerCase();
  if (g.includes("explain")) {
    return {
      plan: [
        { tool: "extract_job_signals", args: { jobIndex: 0 } },
        { tool: "retrieve_profile_evidence", args: { jobIndex: 0, limit: 3 } },
        { tool: "generate_recommendation", args: { jobIndex: 0, useEvidence: true } }
      ],
      maxSteps: 3,
      stopCondition: "returned_recommendation"
    };
  }
  if (g.includes("apply")) {
    return {
      plan: [
        { tool: "extract_job_signals", args: { jobIndex: 0 } },
        { tool: "apply_to_job", args: { jobIndex: 0 } }
      ],
      maxSteps: 2
    };
  }
  // default shortlist
  return {
    plan: [ { tool: "extract_job_signals" }, { tool: "score_job" }, { tool: "retrieve_profile_evidence" }, { tool: "generate_recommendation" } ],
    maxSteps: 6
  };
}

function summarizeJobs(jobs: RawJob[], limit = 3): string {
  return jobs.slice(0, limit).map((j, i) => `${i}: ${j.title} at ${j.company}`).join("\n");
}

function validatePlan(plan: unknown): plan is LlmPlan {
  if (!plan || typeof plan !== 'object') return false;
  const p = plan as LlmPlan;
  if (!Array.isArray(p.plan)) return false;
  const names = new Set(listRegisteredTools().map((t) => t.name));
  for (const step of p.plan) {
    if (!step || typeof step !== 'object' || typeof (step as any).tool !== 'string') return false;
    if (!names.has((step as any).tool)) return false;
  }
  if (p.maxSteps !== undefined && typeof p.maxSteps !== 'number') return false;
  return true;
}

export async function runPlannerGoal(
  goal: string,
  jobs: RawJob[],
  context: ToolExecutionContext,
  traceEntries: ToolCallTraceEntry[]
): Promise<{ analyses: unknown[] }> {
  const llmClient = context.llmClient;

  if (llmClient) {
    // Build a compact prompt
    const system = `You are a planner that outputs a JSON object matching schema: { plan: [{tool:string,args:object}], maxSteps?:number }.`;
    const toolsDesc = listRegisteredTools().map((t) => `${t.name}: ${t.description}`).join("\n");
    const user = `Goal: ${goal}\nJobs:\n${summarizeJobs(jobs, 5)}\nAvailable tools:\n${toolsDesc}\nReturn only JSON matching the schema.`;

    // For local mock provider, pass a deterministic mockResponse.
    const mockResponse = getMockPlan(goal);

    try {
      const llmOutput = await llmClient.generateJson({ system, user, temperature: 0, mockResponse });
      if (validatePlan(llmOutput)) {
        const plan = llmOutput as LlmPlan;
        const analyses: unknown[] = [];
        let steps = 0;
        for (const step of plan.plan) {
          if (plan.maxSteps && steps >= plan.maxSteps) break;
          steps += 1;
          const toolName = step.tool;
          const regTool = (listRegisteredTools() as any).find((t: any) => t.name === toolName);
          if (!regTool) {
            // unknown tool - skip
            traceEntries.push({ tool: toolName, inputSummary: JSON.stringify(step.args || {}), outputSummary: 'skipped: unknown tool', durationMs: 0, success: false, sideEffectLevel: 'compute', approval: 'not_required' });
            continue;
          }
          try {
            const input = (step.args ?? {}) as any;
            const output = await executeRegisteredTool(regTool, input, context as any, traceEntries as any);
            // if this step produced analysis-like data, collect it conservatively
            if (toolName === 'generate_recommendation') {
              analyses.push({ job: jobs[(input.jobIndex ?? 0)], recommendation: (output as any).recommendation });
            }
          } catch (err) {
            // Continue executing, but record failure in trace (executeRegisteredTool already did)
            if ((step as any).tool === 'apply_to_job') {
              // external action blocked — return that result for demo
              const idx = Number((step as any).args?.jobIndex ?? 0) || 0;
              return { analyses: [{ job: jobs[idx], applied: false, error: String(err) }] };
            }
          }
        }
        return { analyses };
      }
    } catch (e) {
      // Fall through to heuristic on LLM failure
    }
  }

  // Fallback heuristic planner (existing deterministic flow)
  const lowered = goal.toLowerCase();

  if (lowered.includes("explain")) {
    const job = jobs[0];
    const signalResult = await executeRegisteredTool(toolRegistry.extract_job_signals, { job }, context, traceEntries);
    const retrievedEvidence = await executeRegisteredTool(
      toolRegistry.retrieve_profile_evidence,
      { job, signals: signalResult.signals, limit: 3 },
      context,
      traceEntries
    );
    const recommendation = await executeRegisteredTool(
      toolRegistry.generate_recommendation,
      { job, signals: signalResult.signals, score: { total: 0, level: "low", breakdown: {} } as any, retrievedEvidence },
      context,
      traceEntries
    );

    return {
      analyses: [
        {
          job: job,
          signals: signalResult.signals,
          retrievedEvidence,
          recommendation: recommendation.recommendation
        }
      ]
    };
  }

  if (lowered.includes("apply")) {
    // Demo applying to first job -> should be intercepted by approval policy
    const job = jobs[0];
    const signalResult = await executeRegisteredTool(toolRegistry.extract_job_signals, { job }, context, traceEntries);
    try {
      const applyResult = await executeRegisteredTool(
        // @ts-ignore
        toolRegistry.apply_to_job,
        { job },
        context,
        traceEntries
      );
      return { analyses: [{ job, applied: true, applyResult }] };
    } catch (err) {
      return { analyses: [{ job, applied: false, error: String(err) }] };
    }
  }

  // default to shortlist: run core pipeline for each job (without export)
  const analyses: unknown[] = [];
  for (const job of jobs) {
    const signalResult = await executeRegisteredTool(toolRegistry.extract_job_signals, { job }, context, traceEntries);
    const score = await executeRegisteredTool(toolRegistry.score_job, { signals: signalResult.signals }, context, traceEntries);
    const retrievedEvidence = await executeRegisteredTool(
      toolRegistry.retrieve_profile_evidence,
      { job, signals: signalResult.signals, limit: 3 },
      context,
      traceEntries
    );
    const recommendation = await executeRegisteredTool(
      toolRegistry.generate_recommendation,
      { job, signals: signalResult.signals, score, retrievedEvidence },
      context,
      traceEntries
    );

    analyses.push({ job, signals: signalResult.signals, score, retrievedEvidence, recommendation: recommendation.recommendation });
  }

  return { analyses };
}
