import type { JobAnalysis } from "../schemas.js";
import { executeRegisteredTool, toolRegistry, type ToolExecutionContext } from "../agent/toolRegistry.js";
import { writeToolTrace, type ToolCallTraceEntry } from "../agent/trace.js";
import { defaultRubric } from "../config/rubric.js";
import { createLlmClient } from "../llm/createLlmClient.js";
import { readProfileKnowledge } from "../rag/profileKnowledge.js";
import type { ExportedFiles } from "../tools/exportResults.js";
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
  traceFile: string;
  llm: {
    enabled: boolean;
    provider?: string;
    model?: string;
  };
};

// This is the local agent-style runner: the plan is still fixed for reliability,
// but every product capability now runs through a typed tool boundary.
export async function runLocalMvp(options: LocalMvpOptions): Promise<LocalMvpResult> {
  const [jobs, rawProfile, profileKnowledge] = await Promise.all([
    readJobs(options.jobsPath),
    readProfile(options.profilePath),
    readProfileKnowledge(options.profileKnowledgePath)
  ]);
  const profile = parseCandidateProfile(rawProfile, defaultRubric);
  const llmClient = createLlmClient(options.llmProvider);
  const context: ToolExecutionContext = {
    rubric: defaultRubric,
    profile,
    profileKnowledge,
    outputDir: options.outputDir,
    ...(llmClient ? { llmClient } : {})
  };
  const traceEntries: ToolCallTraceEntry[] = [];

  const analyses: JobAnalysis[] = [];

  for (const job of jobs) {
    const signalResult = await executeRegisteredTool(
      toolRegistry.extract_job_signals,
      { job },
      context,
      traceEntries
    );
    const signals = signalResult.signals;
    const score = await executeRegisteredTool(
      toolRegistry.score_job,
      { signals },
      context,
      traceEntries
    );
    const retrievedEvidence = await executeRegisteredTool(
      toolRegistry.retrieve_profile_evidence,
      { job, signals, limit: 3 },
      context,
      traceEntries
    );
    const recommendationResult = await executeRegisteredTool(
      toolRegistry.generate_recommendation,
      { job, signals, score, retrievedEvidence },
      context,
      traceEntries
    );

    analyses.push({
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
    });
  }

  analyses.sort((left, right) => right.score.total - left.score.total);

  const outputFiles = await executeRegisteredTool(
    toolRegistry.export_results,
    { analyses },
    context,
    traceEntries
  );
  const traceFile = await writeToolTrace(options.outputDir, traceEntries);

  return {
    analyses,
    outputFiles,
    traceFile,
    llm: {
      enabled: llmClient !== undefined,
      ...(llmClient ? { provider: llmClient.provider, model: llmClient.model } : {})
    }
  };
}
