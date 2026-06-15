import type { LlmClient } from "../llm/client.js";
import { buildRecommendationPrompt } from "../llm/prompts/recommendationPrompt.js";
import type {
  CandidateProfile,
  JobRecommendation,
  JobSignals,
  RawJob,
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
  llmClient?: LlmClient
): Promise<RecommendationGenerationResult> {
  const baseline = generateRecommendations(job, profile, signals, score);

  if (!llmClient) {
    return {
      recommendation: baseline,
      source: "template"
    };
  }

  const prompt = buildRecommendationPrompt(job, profile, signals, score, baseline);
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
    interviewTalkingPoints: readStringArray(output.interviewTalkingPoints, "interviewTalkingPoints")
  };
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
