import type { ToolExecutionContext } from "./toolRegistry.js";
import { toolRegistry, executeRegisteredTool, listRegisteredTools } from "./toolRegistry.js";
import type { ToolCallTraceEntry } from "./trace.js";
import type { JobSignals, RawJob, RetrievedProfileEvidence, ScoreResult } from "../schemas.js";
import { validateLlmPlan, type LlmPlan, type LlmPlanStep } from "./plannerValidation.js";

// Planner for Milestone 5 agent-hardening demo.
// Behavior:
// - If an llmClient is available in context, ask it to produce a JSON plan (safe schema), validate the plan, and execute step-by-step.
// - Otherwise, fall back to the previous heuristic planner implemented below.

type PlannerJobState = {
  signals?: JobSignals;
  score?: ScoreResult;
  retrievedEvidence?: RetrievedProfileEvidence[];
};

function getMockPlan(goal: string): LlmPlan {
  const g = goal.toLowerCase();
  if (g.includes("explain")) {
    return {
      plan: [
        { tool: "extract_job_signals", args: { jobIndex: 0 } },
        { tool: "score_job", args: { jobIndex: 0 } },
        { tool: "retrieve_profile_evidence", args: { jobIndex: 0, limit: 3 } },
        { tool: "generate_recommendation", args: { jobIndex: 0, useEvidence: true } }
      ],
      maxSteps: 4,
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
      const initialValidation = validateLlmPlan(llmOutput, jobs);
      const validation = initialValidation.ok
        ? initialValidation
        : validateLlmPlan(
            await llmClient.generateJson({
              system,
              user: `${user}\n\nPrevious plan validation failed:\n${initialValidation.errors.join("\n")}\nReturn a corrected JSON plan only.`,
              temperature: 0,
              mockResponse
            }),
            jobs
          );

      if (validation.ok) {
        return executeLlmPlan(validation.plan, jobs, context, traceEntries);
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
    await executeRegisteredTool(toolRegistry.extract_job_signals, { job }, context, traceEntries);
    try {
      const applyResult = await executeRegisteredTool(
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

async function executeLlmPlan(
  plan: LlmPlan,
  jobs: RawJob[],
  context: ToolExecutionContext,
  traceEntries: ToolCallTraceEntry[]
): Promise<{ analyses: unknown[] }> {
  const analyses: unknown[] = [];
  const stateByJobIndex = new Map<number, PlannerJobState>();
  let steps = 0;

  for (const step of plan.plan) {
    if (plan.maxSteps && steps >= plan.maxSteps) {
      break;
    }

    steps += 1;
    const regTool = listRegisteredTools().find((tool) => tool.name === step.tool);
    if (!regTool) {
      traceEntries.push({
        tool: step.tool,
        inputSummary: JSON.stringify(step.args ?? {}),
        outputSummary: "skipped: unknown tool",
        durationMs: 0,
        success: false,
        sideEffectLevel: "compute",
        approval: "not_required"
      });
      continue;
    }

    try {
      const input = resolvePlanStepInput(step, jobs, stateByJobIndex);
      const output = await executeRegisteredTool(regTool as any, input as any, context, traceEntries);
      updatePlannerState(step, output, stateByJobIndex);

      if (step.tool === "generate_recommendation") {
        const jobIndex = readJobIndex(step);
        analyses.push({
          job: jobs[jobIndex],
          recommendation: (output as any).recommendation
        });
      }

      if (step.tool === "apply_to_job") {
        const jobIndex = readJobIndex(step);
        return {
          analyses: [
            {
              job: jobs[jobIndex],
              applied: true,
              applyResult: output
            }
          ]
        };
      }
    } catch (err) {
      if (step.tool === "apply_to_job") {
        const jobIndex = readJobIndex(step);
        return { analyses: [{ job: jobs[jobIndex], applied: false, error: String(err) }] };
      }

      throw err;
    }
  }

  return { analyses };
}

function resolvePlanStepInput(
  step: LlmPlanStep,
  jobs: RawJob[],
  stateByJobIndex: Map<number, PlannerJobState>
): Record<string, unknown> {
  const args = step.args ?? {};

  if (step.tool === "send_message") {
    return args;
  }

  const jobIndex = readJobIndex(step);
  const job = jobs[jobIndex];
  const state = stateByJobIndex.get(jobIndex) ?? {};

  if (step.tool === "extract_job_signals") {
    return { job };
  }

  if (step.tool === "score_job") {
    if (!state.signals) {
      throw new Error(`score_job requires prior extract_job_signals for jobIndex ${jobIndex}.`);
    }
    return { signals: state.signals };
  }

  if (step.tool === "retrieve_profile_evidence") {
    if (!state.signals) {
      throw new Error(`retrieve_profile_evidence requires prior extract_job_signals for jobIndex ${jobIndex}.`);
    }
    return { job, signals: state.signals, limit: args.limit };
  }

  if (step.tool === "generate_recommendation") {
    if (!state.signals || !state.score || !state.retrievedEvidence) {
      throw new Error(`generate_recommendation requires signals, score, and evidence for jobIndex ${jobIndex}.`);
    }
    return { job, signals: state.signals, score: state.score, retrievedEvidence: state.retrievedEvidence };
  }

  if (step.tool === "apply_to_job") {
    return { job, resumePath: args.resumePath };
  }

  return args;
}

function updatePlannerState(
  step: LlmPlanStep,
  output: unknown,
  stateByJobIndex: Map<number, PlannerJobState>
): void {
  if (!["extract_job_signals", "score_job", "retrieve_profile_evidence"].includes(step.tool)) {
    return;
  }

  const jobIndex = readJobIndex(step);
  const state = stateByJobIndex.get(jobIndex) ?? {};

  if (step.tool === "extract_job_signals") {
    state.signals = (output as { signals: JobSignals }).signals;
  } else if (step.tool === "score_job") {
    state.score = output as ScoreResult;
  } else if (step.tool === "retrieve_profile_evidence") {
    state.retrievedEvidence = output as RetrievedProfileEvidence[];
  }

  stateByJobIndex.set(jobIndex, state);
}

function readJobIndex(step: LlmPlanStep): number {
  return Number(step.args?.jobIndex ?? 0);
}
