import { resolve } from "node:path";
import { loadLocalEnvFiles } from "./llm/env.js";
import { runLocalMvp } from "./workflow/runLocalMvp.js";

// CLI entry point. Keep command-line parsing thin so the real product logic
// stays inside the workflow and tool modules.
type CliArgs = {
  jobsPath: string;
  profilePath: string;
  profileKnowledgePath: string;
  outputDir: string;
  llmProvider?: string;
};

function readArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key?.startsWith("--")) {
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${key}`);
      }
      args.set(key, value);
      index += 1;
    }
  }

  return {
    jobsPath: resolve(args.get("--jobs") ?? "data/sample_jobs.json"),
    profilePath: resolve(args.get("--profile") ?? "data/sample_profile.md"),
    profileKnowledgePath: resolve(args.get("--profile-knowledge") ?? "data/profile_knowledge.json"),
    outputDir: resolve(args.get("--output") ?? "exports"),
    ...(args.get("--llm") ? { llmProvider: args.get("--llm") } : {})
  };
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const options = readArgs(process.argv.slice(2));
  const result = await runLocalMvp(options);

  // Console output is intentionally short; detailed results are written to files
  // so they can be inspected, compared, or used later by a UI.
  console.log("AI Job Search Copilot local MVP completed.");
  console.log(`Jobs analyzed: ${result.analyses.length}`);
  console.log(
    result.llm.enabled
      ? `LLM mode: ${result.llm.provider} (${result.llm.model})`
      : "LLM mode: disabled"
  );
  console.log("RAG mode: local keyword retrieval");
  console.log("Tool workflow: enabled");
  console.log(`JSON output: ${result.outputFiles.jsonPath}`);
  console.log(`CSV output: ${result.outputFiles.csvPath}`);
  console.log(`Tool trace: ${result.traceFile}`);

  const topMatch = result.analyses[0];
  if (topMatch) {
    console.log(
      `Top match: ${topMatch.job.title} at ${topMatch.job.company} (${topMatch.score.total}/100)`
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Local MVP failed: ${message}`);
  process.exitCode = 1;
});
