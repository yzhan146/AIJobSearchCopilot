import type {
  CandidateProfile,
  JobRecommendation,
  JobSignals,
  RawJob,
  ScoreResult
} from "../../schemas.js";

export function buildRecommendationPrompt(
  job: RawJob,
  profile: CandidateProfile,
  signals: JobSignals,
  score: ScoreResult,
  baseline: JobRecommendation
): { system: string; user: string; mockResponse: JobRecommendation } {
  return {
    system: [
      "You write concise job-search recommendations for an AI product role candidate.",
      "Return JSON only. Use only the provided profile, signals, and score.",
      "Do not change the score; deterministic code owns scoring."
    ].join(" "),
    user: JSON.stringify(
      {
        task: "generate_job_recommendation",
        output_schema: {
          resumeFocusPoints: "string[]",
          outreachMessage: "string",
          interviewTalkingPoints: "string[]"
        },
        candidateProfile: {
          targetLocation: profile.targetLocation,
          targetAnnualCompensationRmb: profile.targetAnnualCompensationRmb,
          targetKeywords: profile.targetKeywords,
          strengths: profile.strengths,
          skillset: profile.skillset,
          language: profile.language
        },
        job,
        signals,
        score
      },
      null,
      2
    ),
    mockResponse: baseline
  };
}
