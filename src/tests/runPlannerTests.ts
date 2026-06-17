import { readJobs } from "../utils/readData.js";
import { readProfile } from "../utils/readData.js";
import { readProfileKnowledge } from "../rag/profileKnowledge.js";
import { parseCandidateProfile } from "../utils/profile.js";
import { defaultRubric } from "../config/rubric.js";
import { createLlmClient } from "../llm/createLlmClient.js";
import { runPlannerGoal } from "../agent/planner.js";
import { writeToolTrace } from "../agent/trace.js";

async function runTests(): Promise<void> {
  const jobs = await readJobs("data/sample_jobs.json");
  const rawProfile = await readProfile("data/sample_profile.md");
  const profileKnowledge = await readProfileKnowledge("data/profile_knowledge.json");
  const profile = parseCandidateProfile(rawProfile, defaultRubric);
  const llmClient = createLlmClient("mock");

  const context = { rubric: defaultRubric, profile, profileKnowledge, outputDir: "exports", llmClient } as any;
  const traceEntries: any[] = [];

  console.log("[test] Running shortlist goal...");
  const resultShort = await runPlannerGoal("shortlist", jobs, context, traceEntries);
  if (!Array.isArray(resultShort.analyses) || resultShort.analyses.length !== jobs.length) {
    console.error(`[test][shortlist] Expected analyses length ${jobs.length}, got ${Array.isArray(resultShort.analyses)? resultShort.analyses.length : 'not-array'}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[test][shortlist] OK: analyses ${resultShort.analyses.length}`);

  console.log("[test] Running apply goal (should be blocked by approval)...");
  const traceApply: any[] = [];
  const resultApply = await runPlannerGoal("apply", jobs, context, traceApply);
  if (!Array.isArray(resultApply.analyses) || resultApply.analyses.length !== 1) {
    console.error(`[test][apply] Expected 1 analysis for apply demo, got ${Array.isArray(resultApply.analyses)? resultApply.analyses.length : 'not-array'}`);
    process.exitCode = 1;
    return;
  }

  const applyRecord = resultApply.analyses[0] as any;
  if (applyRecord.applied !== false || !applyRecord.error) {
    console.error(`[test][apply] Expected apply to be blocked with applied=false and an error; got ${JSON.stringify(applyRecord)}`);
    process.exitCode = 1;
    return;
  }

  console.log("[test][apply] OK: apply blocked and error recorded");

  // write a trace file for manual inspection
  await writeToolTrace("exports", traceEntries.concat(traceApply));

  console.log("All planner tests passed.");
}

runTests().catch((e)=>{
  console.error('Test runner error:', e);
  process.exitCode = 1;
});
