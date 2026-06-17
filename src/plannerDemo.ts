import { loadLocalEnvFiles } from "./llm/env.js";
import { readJobs, readProfile } from "./utils/readData.js";
import { readProfileKnowledge } from "./rag/profileKnowledge.js";
import { parseCandidateProfile } from "./utils/profile.js";
import { defaultRubric } from "./config/rubric.js";
import { createLlmClient } from "./llm/createLlmClient.js";
import { runPlannerGoal } from "./agent/planner.js";
import { writeToolTrace } from "./agent/trace.js";

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const args = process.argv.slice(2);
  const argMap = new Map<string,string>();
  for (let i=0;i<args.length;i+=2){
    const k = args[i]; const v = args[i+1]; if(k?.startsWith("--")) argMap.set(k.replace(/^--/,'') , v);
  }

  const jobsPath = argMap.get('jobs') ?? 'data/sample_jobs.json';
  const profilePath = argMap.get('profile') ?? 'data/sample_profile.md';
  const profileKnowledgePath = argMap.get('profile-knowledge') ?? 'data/profile_knowledge.json';
  const outputDir = argMap.get('output') ?? 'exports';
  const llmProvider = argMap.get('llm');
  const goal = argMap.get('goal') ?? 'shortlist';

  const [jobs, rawProfile, profileKnowledge] = await Promise.all([
    readJobs(jobsPath),
    readProfile(profilePath),
    readProfileKnowledge(profileKnowledgePath)
  ]);
  const profile = parseCandidateProfile(rawProfile, defaultRubric);
  const llmClient = createLlmClient(llmProvider);

  const context = {
    rubric: defaultRubric,
    profile,
    profileKnowledge,
    outputDir,
    ...(llmClient ? { llmClient } : {})
  };

  const traceEntries: any[] = [];

  console.log(`Running planner demo (goal=${goal})`);

  const result = await runPlannerGoal(goal, jobs, context as any, traceEntries as any);

  const tracePath = await writeToolTrace(outputDir, traceEntries as any);

  console.log(`Planner demo completed. Analyses: ${Array.isArray(result.analyses) ? result.analyses.length : 0}`);
  console.log(`Tool trace: ${tracePath}`);
}

main().catch((e)=>{ console.error(String(e)); process.exitCode = 1; });
