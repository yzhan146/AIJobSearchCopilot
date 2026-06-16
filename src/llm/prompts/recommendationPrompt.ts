import type {
  CandidateProfile,
  JobRecommendation,
  JobSignals,
  RawJob,
  RetrievedProfileEvidence,
  ScoreResult
} from "../../schemas.js";

export function buildRecommendationPrompt(
  job: RawJob,
  profile: CandidateProfile,
  signals: JobSignals,
  score: ScoreResult,
  baseline: JobRecommendation,
  retrievedEvidence: RetrievedProfileEvidence[] = []
): { system: string; user: string; mockResponse: JobRecommendation } {
  return {
    system: [
      "You write concise job-search recommendations for an AI product role candidate.",
      "Return JSON only. Use only the provided profile, signals, score, and retrieved evidence.",
      "Do not invent citations. Evidence citations must use retrieved evidence ids.",
      "Do not change the score; deterministic code owns scoring."
    ].join(" "),
    user: JSON.stringify(
      {
        task: "generate_job_recommendation",
        output_schema: {
          resumeFocusPoints: "string[]",
          outreachMessage: "string",
          interviewTalkingPoints: "string[]",
          evidenceCitations: [
            {
              id: "string",
              title: "string",
              quote: "string",
              relevanceReason: "string"
            }
          ]
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
        score,
        retrievedEvidence: retrievedEvidence.map((evidence) => ({
          id: evidence.id,
          title: evidence.title,
          category: evidence.category,
          content: evidence.content,
          citation: evidence.citation,
          relevanceReason: evidence.relevanceReason
        }))
      },
      null,
      2
    ),
    mockResponse: baseline
  };
}
