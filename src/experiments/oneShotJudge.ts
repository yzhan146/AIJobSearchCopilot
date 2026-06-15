import type { LlmClient } from "../llm/client.js";
import type { CandidateProfile, RawJob } from "../schemas.js";
import { mapScoreToRecommendation, type OneShotJudgment } from "./experimentSchemas.js";

export async function runOneShotJudgment(
  llmClient: LlmClient,
  job: RawJob,
  profile: CandidateProfile,
  mockScore: number
): Promise<OneShotJudgment> {
  const prompt = buildOneShotPrompt(job, profile, mockScore);
  const output = await llmClient.generateJson({
    system: prompt.system,
    user: prompt.user,
    temperature: 0.4,
    mockResponse: prompt.mockResponse
  });

  return normalizeOneShotJudgment(output);
}

function buildOneShotPrompt(
  job: RawJob,
  profile: CandidateProfile,
  mockScore: number
): { system: string; user: string; mockResponse: OneShotJudgment } {
  return {
    system: [
      "You are a job-search assistant.",
      "Judge whether the job matches the candidate profile.",
      "Return JSON only."
    ].join(" "),
    user: JSON.stringify(
      {
        task: "one_shot_job_fit_judgment",
        candidateProfile: {
          targetLocation: profile.targetLocation,
          targetAnnualCompensationRmb: profile.targetAnnualCompensationRmb,
          targetKeywords: profile.targetKeywords,
          strengths: profile.strengths,
          skillset: profile.skillset,
          language: profile.language
        },
        job,
        output_schema: {
          fitScore: "number from 0 to 100",
          recommendation: "strong_match | possible_match | low_priority",
          reasons: "string[]",
          concerns: "string[]"
        }
      },
      null,
      2
    ),
    // The mock intentionally imitates a plausible one-shot answer, not the
    // exact hybrid result. This makes the comparison useful without an API key.
    mockResponse: {
      fitScore: mockScore,
      recommendation: mapScoreToRecommendation(mockScore),
      reasons: [
        "The role appears related to AI/product work.",
        "The candidate has engineering and product experience."
      ],
      concerns: [
        "One-shot judgment may miss strict skill, language, or location constraints."
      ]
    }
  };
}

function normalizeOneShotJudgment(output: unknown): OneShotJudgment {
  if (!isRecord(output)) {
    throw new Error("One-shot judgment output must be an object.");
  }

  const fitScore = output.fitScore;
  if (typeof fitScore !== "number" || fitScore < 0 || fitScore > 100) {
    throw new Error("fitScore must be a number from 0 to 100.");
  }

  const recommendation = output.recommendation;
  if (
    recommendation !== "strong_match" &&
    recommendation !== "possible_match" &&
    recommendation !== "low_priority"
  ) {
    throw new Error("recommendation must be strong_match, possible_match, or low_priority.");
  }

  return {
    fitScore,
    recommendation,
    reasons: readStringArray(output.reasons, "reasons"),
    concerns: readStringArray(output.concerns, "concerns")
  };
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(`${fieldName}[${index}] must be a string.`);
    }
    return item;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
