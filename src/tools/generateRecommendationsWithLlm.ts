import type { LlmClient } from "../llm/client.js";
import { buildRecommendationPrompt } from "../llm/prompts/recommendationPrompt.js";
import type {
  CandidateProfile,
  JobRecommendation,
  JobSignals,
  RawJob,
  RetrievedProfileEvidence,
  ScoreResult
} from "../schemas.js";
import { generateRecommendations } from "./generateRecommendations.js";

export type RecommendationGenerationResult = {
  recommendation: JobRecommendation;
  source: "template" | "llm";
};

export async function generateRecommendationsWithLlm(
  job: RawJob,
  profile: CandidateProfile,
  signals: JobSignals,
  score: ScoreResult,
  retrievedEvidence: RetrievedProfileEvidence[] = [],
  llmClient?: LlmClient
): Promise<RecommendationGenerationResult> {
  const baseline = generateRecommendations(job, profile, signals, score, retrievedEvidence);

  if (!llmClient) {
    return {
      recommendation: baseline,
      source: "template"
    };
  }

  const prompt = buildRecommendationPrompt(job, profile, signals, score, baseline, retrievedEvidence);
  const llmOutput = await llmClient.generateJson({
    system: prompt.system,
    user: prompt.user,
    temperature: 0.4,
    mockResponse: prompt.mockResponse
  });

  return {
    recommendation: normalizeRecommendation(llmOutput),
    source: "llm"
  };
}

function normalizeRecommendation(output: unknown): JobRecommendation {
  if (!isRecord(output)) {
    throw new Error("LLM recommendation output must be an object.");
  }

  return {
    resumeFocusPoints: readStringArray(output.resumeFocusPoints, "resumeFocusPoints"),
    outreachMessage: readRequiredString(output.outreachMessage, "outreachMessage"),
    interviewTalkingPoints: readStringArray(output.interviewTalkingPoints, "interviewTalkingPoints"),
    evidenceCitations: readEvidenceCitations(output.evidenceCitations)
  };
}

function readEvidenceCitations(value: unknown): JobRecommendation["evidenceCitations"] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("evidenceCitations must be an array when provided.");
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`evidenceCitations[${index}] must be an object.`);
    }

    return {
      id: readRequiredString(item.id, `evidenceCitations[${index}].id`),
      title: readRequiredString(item.title, `evidenceCitations[${index}].title`),
      quote: readRequiredString(item.quote, `evidenceCitations[${index}].quote`),
      relevanceReason: readRequiredString(
        item.relevanceReason,
        `evidenceCitations[${index}].relevanceReason`
      )
    };
  });
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${fieldName}[${index}] must be a non-empty string.`);
    }
    return item;
  });
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
