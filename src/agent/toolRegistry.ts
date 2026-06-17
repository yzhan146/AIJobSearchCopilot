import type { LlmClient } from "../llm/client.js";
import { retrieveProfileEvidence } from "../rag/retrieveProfileEvidence.js";
import type {
  CandidateProfile,
  JobAnalysis,
  JobSignals,
  ProfileEvidence,
  RawJob,
  RetrievedProfileEvidence,
  ScoreResult,
  ScoringRubric
} from "../schemas.js";
import { exportResults, type ExportedFiles } from "../tools/exportResults.js";
import {
  extractJobSignalsWithLlm,
  type SignalExtractionResult
} from "../tools/extractJobSignalsWithLlm.js";
import {
  generateRecommendationsWithLlm,
  type RecommendationGenerationResult
} from "../tools/generateRecommendationsWithLlm.js";
import { scoreJob } from "../tools/scoreJob.js";
import { assertToolApproval, type ToolApprovalPolicy, type ToolSideEffectLevel } from "./approvalPolicy.js";
import type { ToolCallTraceEntry } from "./trace.js";

type JsonSchema = {
  type: string;
  description?: string;
  properties?: Record<string, unknown>;
  required?: string[];
};

export type ToolExecutionContext = {
  rubric: ScoringRubric;
  profile: CandidateProfile;
  profileKnowledge: ProfileEvidence[];
  outputDir: string;
  llmClient?: LlmClient;
};

type ExtractJobSignalsToolInput = {
  job: RawJob;
};

type ScoreJobToolInput = {
  signals: JobSignals;
};

type RetrieveProfileEvidenceToolInput = {
  job: RawJob;
  signals: JobSignals;
  limit?: number;
};

type GenerateRecommendationToolInput = {
  job: RawJob;
  signals: JobSignals;
  score: ScoreResult;
  retrievedEvidence: RetrievedProfileEvidence[];
};

type ExportResultsToolInput = {
  analyses: JobAnalysis[];
};

type ToolInputMap = {
  extract_job_signals: ExtractJobSignalsToolInput;
  score_job: ScoreJobToolInput;
  retrieve_profile_evidence: RetrieveProfileEvidenceToolInput;
  generate_recommendation: GenerateRecommendationToolInput;
  export_results: ExportResultsToolInput;
  apply_to_job: { job: RawJob; resumePath?: string };
  send_message: { recipient: string; subject: string; body: string };
};

type ToolOutputMap = {
  extract_job_signals: SignalExtractionResult;
  score_job: ScoreResult;
  retrieve_profile_evidence: RetrievedProfileEvidence[];
  generate_recommendation: RecommendationGenerationResult;
  export_results: ExportedFiles;
  apply_to_job: { queued: boolean; message?: string };
  send_message: { queued: boolean; message?: string };
};

export type ToolName = keyof ToolInputMap;

export type RegisteredTool<Name extends ToolName> = {
  name: Name;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  sideEffectLevel: ToolSideEffectLevel;
  approval: ToolApprovalPolicy;
  execute: (
    input: ToolInputMap[Name],
    context: ToolExecutionContext
  ) => Promise<ToolOutputMap[Name]> | ToolOutputMap[Name];
  summarizeInput: (input: ToolInputMap[Name]) => string;
  summarizeOutput: (output: ToolOutputMap[Name]) => string;
};

type ToolRegistry = {
  [Name in ToolName]: RegisteredTool<Name>;
};

export type RegisteredToolUnion = {
  [Name in ToolName]: RegisteredTool<Name>;
}[ToolName];

export const toolRegistry: ToolRegistry = {
  extract_job_signals: {
    name: "extract_job_signals",
    description: "Parse one raw job description into validated JobSignals.",
    inputSchema: objectSchema("Raw job to analyze.", ["job"]),
    outputSchema: objectSchema("Validated signal extraction result.", ["signals", "source"]),
    sideEffectLevel: "compute",
    approval: "not_required",
    execute: (input, context) =>
      extractJobSignalsWithLlm(input.job, context.rubric, context.profile, context.llmClient),
    summarizeInput: ({ job }) => summarizeJob(job),
    summarizeOutput: ({ source, signals }) =>
      `${source}; ${signals.aiSignals.length} AI signals, ${signals.skillGaps.length} skill gaps`
  },
  score_job: {
    name: "score_job",
    description: "Score validated job signals with the deterministic rubric.",
    inputSchema: objectSchema("Validated job signals.", ["signals"]),
    outputSchema: objectSchema("Score result with breakdown, reasons, and concerns.", [
      "total",
      "level",
      "breakdown"
    ]),
    sideEffectLevel: "compute",
    approval: "not_required",
    execute: (input, context) => scoreJob(input.signals, context.rubric),
    summarizeInput: ({ signals }) => `${signals.title} at ${signals.company}`,
    summarizeOutput: (score) => `${score.total}/100 (${score.level})`
  },
  retrieve_profile_evidence: {
    name: "retrieve_profile_evidence",
    description: "Retrieve profile evidence chunks that support the job analysis.",
    inputSchema: objectSchema("Job, signals, and optional retrieval limit.", ["job", "signals"]),
    outputSchema: objectSchema("Ranked profile evidence chunks.", ["items"]),
    sideEffectLevel: "compute",
    approval: "not_required",
    execute: (input, context) =>
      retrieveProfileEvidence({
        job: input.job,
        profile: context.profile,
        signals: input.signals,
        knowledgeBase: context.profileKnowledge,
        limit: input.limit ?? 3
      }),
    summarizeInput: ({ job }) => summarizeJob(job),
    summarizeOutput: (evidence) => `${evidence.length} evidence chunks retrieved`
  },
  generate_recommendation: {
    name: "generate_recommendation",
    description: "Generate resume focus points, outreach draft, and interview talking points.",
    inputSchema: objectSchema("Job analysis inputs plus retrieved evidence.", [
      "job",
      "signals",
      "score",
      "retrievedEvidence"
    ]),
    outputSchema: objectSchema("Recommendation generation result.", ["recommendation", "source"]),
    sideEffectLevel: "compute",
    approval: "not_required",
    execute: (input, context) =>
      generateRecommendationsWithLlm(
        input.job,
        context.profile,
        input.signals,
        input.score,
        input.retrievedEvidence,
        context.llmClient
      ),
    summarizeInput: ({ job, score }) => `${summarizeJob(job)}; score ${score.total}/100`,
    summarizeOutput: ({ source, recommendation }) =>
      `${source}; ${recommendation.resumeFocusPoints.length} resume points, ${recommendation.evidenceCitations.length} citations`
  },
  export_results: {
    name: "export_results",
    description: "Write local JSON and CSV analysis outputs for human review.",
    inputSchema: objectSchema("Sorted job analyses to export.", ["analyses"]),
    outputSchema: objectSchema("Paths to generated JSON and CSV files.", ["jsonPath", "csvPath"]),
    sideEffectLevel: "local_write",
    approval: "not_required",
    execute: (input, context) => exportResults(input.analyses, context.outputDir),
    summarizeInput: ({ analyses }) => `${analyses.length} analyses`,
    summarizeOutput: ({ jsonPath, csvPath }) => `JSON: ${jsonPath}; CSV: ${csvPath}`
  },
  apply_to_job: {
    name: "apply_to_job",
    description: "Mock applying to a job on user's behalf (requires approval).",
    inputSchema: objectSchema("Job and optional resume path.", ["job"]),
    outputSchema: objectSchema("Application request status.", ["queued"]),
    sideEffectLevel: "external_action",
    approval: "human_required",
    execute: (_input, _context) => {
      // In demo, external actions are blocked by policy and should not run automatically.
      throw new Error("Human approval required for apply_to_job.");
    },
    summarizeInput: ({ job }) => summarizeJob(job),
    summarizeOutput: (output) => `queued: ${ (output as any)?.queued ?? false }`
  },
  send_message: {
    name: "send_message",
    description: "Mock sending an outbound message (requires approval).",
    inputSchema: objectSchema("Recipient, subject, and body.", ["recipient", "subject", "body"]),
    outputSchema: objectSchema("Message enqueue status.", ["queued"]),
    sideEffectLevel: "external_action",
    approval: "human_required",
    execute: (_input, _context) => {
      throw new Error("Human approval required for send_message.");
    },
    summarizeInput: ({ recipient, subject }) => `to ${recipient}: ${subject}`,
    summarizeOutput: (output) => `queued: ${ (output as any)?.queued ?? false }`
  }
};

export async function executeRegisteredTool<Name extends ToolName>(
  tool: RegisteredTool<Name>,
  input: ToolInputMap[Name],
  context: ToolExecutionContext,
  traceEntries: ToolCallTraceEntry[]
): Promise<ToolOutputMap[Name]> {
  const startedAt = Date.now();
  try {
    assertToolApproval(tool.approval, tool.name);
    const output = await tool.execute(input, context);
    traceEntries.push({
      tool: tool.name,
      inputSummary: tool.summarizeInput(input),
      outputSummary: tool.summarizeOutput(output),
      durationMs: Date.now() - startedAt,
      success: true,
      sideEffectLevel: tool.sideEffectLevel,
      approval: tool.approval
    });
    return output;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    traceEntries.push({
      tool: tool.name,
      inputSummary: tool.summarizeInput(input),
      outputSummary: "failed",
      durationMs: Date.now() - startedAt,
      success: false,
      sideEffectLevel: tool.sideEffectLevel,
      approval: tool.approval,
      error: message
    });
    throw error;
  }
}

export function listRegisteredTools(): RegisteredToolUnion[] {
  return Object.values(toolRegistry);
}

function objectSchema(description: string, required: string[]): JsonSchema {
  return {
    type: "object",
    description,
    required
  };
}

function summarizeJob(job: RawJob): string {
  return `${job.title} at ${job.company} (${job.location})`;
}
