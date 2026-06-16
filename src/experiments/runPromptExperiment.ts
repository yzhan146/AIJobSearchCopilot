import { resolve } from "node:path";
import { defaultRubric } from "../config/rubric.js";
import { createLlmClient } from "../llm/createLlmClient.js";
import { loadLocalEnvFiles } from "../llm/env.js";
import type { JobAnalysis } from "../schemas.js";
import { extractJobSignalsWithLlm } from "../tools/extractJobSignalsWithLlm.js";
import { generateRecommendationsWithLlm } from "../tools/generateRecommendationsWithLlm.js";
import { scoreJob } from "../tools/scoreJob.js";
import { parseCandidateProfile } from "../utils/profile.js";
import { readJobs, readProfile } from "../utils/readData.js";
import { compareExperimentResults } from "./compareExperimentResults.js";
import { exportPromptExperiment } from "./exportPromptExperiment.js";
import type { PromptExperimentSummary } from "./experimentSchemas.js";
import { runOneShotJudgment } from "./oneShotJudge.js";
import { findGoldJudgment, readGoldJudgments } from "./readGoldJudgments.js";

type PromptExperimentOptions = {
  jobsPath: string;
  profilePath: string;
  goldPath: string;
  outputDir: string;
  llmProvider?: string;
};

function readArgs(argv: string[]): PromptExperimentOptions {
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
    goldPath: resolve(args.get("--gold") ?? "data/gold_judgments.json"),
    outputDir: resolve(args.get("--output") ?? "exports"),
    llmProvider: args.get("--llm") ?? "mock"
  };
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const options = readArgs(process.argv.slice(2));
  const llmClient = createLlmClient(options.llmProvider);

  if (!llmClient) {
    throw new Error("Prompt experiment requires an LLM provider. Use --llm mock or --llm openai.");
  }

  const [jobs, rawProfile, goldJudgments] = await Promise.all([
    readJobs(options.jobsPath),
    readProfile(options.profilePath),
    readGoldJudgments(options.goldPath)
  ]);
  const profile = parseCandidateProfile(rawProfile, defaultRubric);

  const results = [];
  for (const job of jobs) {
    // Run experiments sequentially because free-tier model APIs often have
    // tight token-per-minute limits. This keeps the experiment reliable and
    // makes provider rate limits visible instead of hiding them behind retries.
    const structuredResult = await withRateLimitRetry(() =>
      extractJobSignalsWithLlm(job, defaultRubric, profile, llmClient)
    );
    const score = scoreJob(structuredResult.signals, defaultRubric);
    const recommendationResult = await withRateLimitRetry(() =>
      generateRecommendationsWithLlm(job, profile, structuredResult.signals, score, [], llmClient)
    );
    const hybridAnalysis: JobAnalysis = {
      job,
      signals: structuredResult.signals,
      score,
      recommendation: recommendationResult.recommendation,
      retrievedEvidence: [],
      metadata: {
        signalSource: structuredResult.source,
        recommendationSource: recommendationResult.source,
        retrievalSource: "local_keyword",
        llmProvider: llmClient.provider,
        llmModel: llmClient.model
      }
    };
    const oneShot = await withRateLimitRetry(() =>
      runOneShotJudgment(llmClient, job, profile, estimateOneShotMockScore(hybridAnalysis))
    );

    results.push(
      compareExperimentResults(
        job.title,
        job.company,
        oneShot,
        structuredResult.signals,
        hybridAnalysis,
        findGoldJudgment(goldJudgments, job.title, job.company)
      )
    );
  }

  const summary: PromptExperimentSummary = {
    llm: {
      provider: llmClient.provider,
      model: llmClient.model
    },
    results
  };
  const files = await exportPromptExperiment(summary, options.outputDir);

  console.log("Prompt experiment completed.");
  console.log(`Jobs compared: ${results.length}`);
  console.log(`JSON output: ${files.jsonPath}`);
  console.log(`Markdown summary: ${files.markdownPath}`);
}

// One-shot prompts often sound plausible but miss different hard constraints.
// The mock intentionally varies by job signals so the experiment demonstrates
// realistic failure modes without needing a paid model call.
function estimateOneShotMockScore(analysis: JobAnalysis): number {
  let bias = 4;

  if (analysis.signals.aiSignals.length > 0) {
    bias += 5;
  }

  if (analysis.signals.productSignals.length > 2) {
    bias += 3;
  }

  if (analysis.signals.skillGaps.length > 0) {
    bias += Math.min(analysis.signals.skillGaps.length * 4, 10);
  }

  if (analysis.signals.languageGaps.length > 0) {
    bias += 6;
  }

  if (!analysis.signals.location.toLowerCase().includes(defaultRubric.targetLocation.toLowerCase())) {
    bias += 12;
  }

  if (analysis.signals.aiReplacementRisk.level === "high") {
    bias += 8;
  }

  const oneShotLikeScore = analysis.score.total + bias;
  return Math.max(0, Math.min(100, oneShotLikeScore));
}

async function withRateLimitRetry<T>(operation: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === maxAttempts || !isRateLimitError(message)) {
        throw error;
      }

      const retryMs = readRetryDelayMs(message) ?? 15_000;
      await sleep(retryMs);
    }
  }

  throw new Error("Retry loop exhausted unexpectedly.");
}

function isRateLimitError(message: string): boolean {
  return message.includes("429") || message.toLowerCase().includes("rate limit");
}

function readRetryDelayMs(message: string): number | undefined {
  const match = message.match(/try again in ([\d.]+)s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) + 1000 : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Prompt experiment failed: ${message}`);
  process.exitCode = 1;
});
