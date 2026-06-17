import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JsonGenerationRequest, LlmClient, LlmProviderName, TextGenerationRequest } from "../llm/client.js";
import { createLlmClient } from "../llm/createLlmClient.js";
import { defaultRubric } from "../config/rubric.js";
import { runPlannerGoal } from "../agent/planner.js";
import { writeToolTrace } from "../agent/trace.js";
import { readProfileKnowledge } from "../rag/profileKnowledge.js";
import { parseCandidateProfile } from "../utils/profile.js";
import { readJobs, readProfile } from "../utils/readData.js";

class SequenceLlmClient implements LlmClient {
  provider: LlmProviderName = "mock";
  model = "sequence-test";
  calls = 0;

  constructor(private readonly jsonResponses: unknown[]) {}

  async generateJson(request: JsonGenerationRequest): Promise<unknown> {
    const response = this.jsonResponses[this.calls];
    this.calls += 1;
    return response ?? request.mockResponse;
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    return request.mockResponse ?? "";
  }
}

async function runTests(): Promise<void> {
  const outputDir = "exports/test-planner";
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const jobs = await readJobs("data/sample_jobs.json");
  const rawProfile = await readProfile("data/sample_profile.md");
  const profileKnowledge = await readProfileKnowledge("data/profile_knowledge.json");
  const profile = parseCandidateProfile(rawProfile, defaultRubric);
  const llmClient = createLlmClient("mock");

  const context = { rubric: defaultRubric, profile, profileKnowledge, outputDir, llmClient } as any;
  const traceEntries: any[] = [];

  console.log("[test] Running shortlist goal...");
  const resultShort = await runPlannerGoal("shortlist", jobs, context, traceEntries);
  if (!Array.isArray(resultShort.analyses) || resultShort.analyses.length !== jobs.length) {
    console.error(`[test][shortlist] Expected analyses length ${jobs.length}, got ${Array.isArray(resultShort.analyses)? resultShort.analyses.length : 'not-array'}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[test][shortlist] OK: analyses ${resultShort.analyses.length}`);

  console.log("[test] Running invalid plan fallback...");
  const invalidPlanClient = new SequenceLlmClient([
    { plan: [{ tool: "invented_tool", args: {} }], maxSteps: 1 },
    { plan: [{ tool: "invented_tool", args: {} }], maxSteps: 1 }
  ]);
  const invalidContext = { ...context, llmClient: invalidPlanClient };
  const invalidTrace: any[] = [];
  const invalidResult = await runPlannerGoal("shortlist", jobs, invalidContext, invalidTrace);
  if (!Array.isArray(invalidResult.analyses) || invalidResult.analyses.length !== jobs.length) {
    console.error("[test][invalid-plan] Expected deterministic fallback to produce all job analyses.");
    process.exitCode = 1;
    return;
  }
  console.log("[test][invalid-plan] OK: invalid LLM plan fell back safely");

  console.log("[test] Running one-shot plan repair...");
  const repairClient = new SequenceLlmClient([
    { plan: [{ tool: "extract_job_signals", args: { jobIndex: 999 } }], maxSteps: 1 },
    {
      plan: [
        { tool: "extract_job_signals", args: { jobIndex: 0 } },
        { tool: "score_job", args: { jobIndex: 0 } },
        { tool: "retrieve_profile_evidence", args: { jobIndex: 0, limit: 3 } },
        { tool: "generate_recommendation", args: { jobIndex: 0 } }
      ],
      maxSteps: 4
    }
  ]);
  const repairContext = { ...context, llmClient: repairClient };
  const repairResult = await runPlannerGoal("explain", jobs, repairContext, []);
  if (!Array.isArray(repairResult.analyses) || repairResult.analyses.length !== 1 || repairClient.calls < 2) {
    console.error("[test][repair] Expected one repaired explanation analysis after validation failure.");
    process.exitCode = 1;
    return;
  }
  console.log("[test][repair] OK: invalid plan repaired once and executed");

  console.log("[test] Running apply goal (should be blocked by approval)...");
  const traceApply: any[] = [];
  const resultApply = await runPlannerGoal("apply", jobs, context, traceApply);
  if (!Array.isArray(resultApply.analyses) || resultApply.analyses.length !== 1) {
    console.error(`[test][apply] Expected 1 analysis for apply demo, got ${Array.isArray(resultApply.analyses)? resultApply.analyses.length : 'not-array'}`);
    process.exitCode = 1;
    return;
  }

  const applyRecord = resultApply.analyses[0] as any;
  const blockedApplyTrace = traceApply.find((entry) => entry.tool === "apply_to_job");
  if (applyRecord.applied !== false || !applyRecord.error || !blockedApplyTrace?.actionId) {
    console.error(`[test][apply] Expected apply to be blocked with actionId; got ${JSON.stringify({ applyRecord, blockedApplyTrace })}`);
    process.exitCode = 1;
    return;
  }

  console.log("[test][apply] OK: apply blocked and pending action recorded");

  console.log("[test] Running approved apply goal...");
  await writeFile(
    join(outputDir, "approvals.json"),
    JSON.stringify(
      [
        {
          actionId: blockedApplyTrace.actionId,
          tool: "apply_to_job",
          inputSummary: blockedApplyTrace.inputSummary,
          status: "approved",
          approvedAt: new Date().toISOString()
        }
      ],
      null,
      2
    ),
    "utf8"
  );

  const traceApprovedApply: any[] = [];
  const resultApprovedApply = await runPlannerGoal("apply", jobs, context, traceApprovedApply);
  const approvedRecord = resultApprovedApply.analyses[0] as any;
  const approvedTrace = traceApprovedApply.find((entry) => entry.tool === "apply_to_job");
  if (approvedRecord?.applied !== true || approvedTrace?.success !== true) {
    console.error(`[test][approved-apply] Expected approved apply to execute as queued mock action; got ${JSON.stringify({ approvedRecord, approvedTrace })}`);
    process.exitCode = 1;
    return;
  }

  console.log("[test][approved-apply] OK: approved external action executed");

  await writeToolTrace(outputDir, traceEntries.concat(invalidTrace, traceApply, traceApprovedApply));

  console.log("All planner tests passed.");
}

runTests().catch((e)=>{
  console.error("Test runner error:", e);
  process.exitCode = 1;
});
