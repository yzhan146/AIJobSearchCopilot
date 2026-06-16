import type { JobAnalysis } from "../schemas.js";
import { defaultRubric } from "../config/rubric.js";
import { createLlmClient } from "../llm/createLlmClient.js";
import { readProfileKnowledge } from "../rag/profileKnowledge.js";
import { retrieveProfileEvidence } from "../rag/retrieveProfileEvidence.js";
import { exportResults, type ExportedFiles } from "../tools/exportResults.js";
import { extractJobSignalsWithLlm } from "../tools/extractJobSignalsWithLlm.js";
import { generateRecommendationsWithLlm } from "../tools/generateRecommendationsWithLlm.js";
import { scoreJob } from "../tools/scoreJob.js";
import { parseCandidateProfile } from "../utils/profile.js";
import { readJobs, readProfile } from "../utils/readData.js";

export type LocalMvpOptions = {
  jobsPath: string;
  profilePath: string;
  profileKnowledgePath: string;
  outputDir: string;
  llmProvider?: string;
};

export type LocalMvpResult = {
  analyses: JobAnalysis[];
  outputFiles: ExportedFiles;
  llm: {
    enabled: boolean;
    provider?: string;
    model?: string;
  };
};

// This is the local "harness": it wires data loading, extraction, scoring,
// recommendation generation, and export into one repeatable workflow.
// In later milestones, individual steps can become LLM calls, RAG retrieval,
// or function-calling tools without changing the overall product flow.
export async function runLocalMvp(options: LocalMvpOptions): Promise<LocalMvpResult> {
  const [jobs, rawProfile, profileKnowledge] = await Promise.all([
    readJobs(options.jobsPath),
    readProfile(options.profilePath),
    readProfileKnowledge(options.profileKnowledgePath)
  ]);
  const profile = parseCandidateProfile(rawProfile, defaultRubric);
  const llmClient = createLlmClient(options.llmProvider);

  const analyses = await Promise.all(
    jobs.map(async (job): Promise<JobAnalysis> => {
      // Each AI-facing step has a deterministic baseline and an optional LLM
      // implementation. This is the core interview point: LLMs improve
      // understanding/generation, while code keeps validation and scoring stable.
      const signalResult = await extractJobSignalsWithLlm(job, defaultRubric, profile, llmClient);
      const signals = signalResult.signals;
      const score = scoreJob(signals, defaultRubric);
      const retrievedEvidence = retrieveProfileEvidence({
        job,
        profile,
        signals,
        knowledgeBase: profileKnowledge,
        limit: 3
      });
      const recommendationResult = await generateRecommendationsWithLlm(
        job,
        profile,
        signals,
        score,
        retrievedEvidence,
        llmClient
      );

      return {
        job,
        signals,
        score,
        recommendation: recommendationResult.recommendation,
        retrievedEvidence,
        metadata: {
          signalSource: signalResult.source,
          recommendationSource: recommendationResult.source,
          retrievalSource: "local_keyword",
          ...(llmClient ? { llmProvider: llmClient.provider, llmModel: llmClient.model } : {})
        }
      };
    })
  );

  analyses.sort((left, right) => right.score.total - left.score.total);

  const outputFiles = await exportResults(analyses, options.outputDir);

  return {
    analyses,
    outputFiles,
    llm: {
      enabled: llmClient !== undefined,
      ...(llmClient ? { provider: llmClient.provider, model: llmClient.model } : {})
    }
  };
}
