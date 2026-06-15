import type {
  CandidateProfile,
  JobRecommendation,
  JobSignals,
  RawJob,
  ScoreResult
} from "../schemas.js";

// Generate user-facing advice from structured signals.
// This is currently templated; later it is a natural place to add an LLM call
// because wording quality matters more here than deterministic scoring.
export function generateRecommendations(
  job: RawJob,
  profile: CandidateProfile,
  signals: JobSignals,
  score: ScoreResult
): JobRecommendation {
  const resumeFocusPoints = buildResumeFocusPoints(profile, signals);

  return {
    resumeFocusPoints,
    outreachMessage: buildOutreachMessage(job, signals, score),
    interviewTalkingPoints: [
      `Explain why ${signals.aiSignals.join(", ") || "AI application work"} matters for this role.`,
      "Connect engineering-product experience to cross-functional AI product delivery.",
      "Describe how deterministic scoring and LLM generation are separated in this demo."
    ]
  };
}

function buildResumeFocusPoints(
  profile: CandidateProfile,
  signals: JobSignals
): string[] {
  const focusPoints = [
    "Engineering + product background for translating technical AI capabilities into product requirements.",
    "Cross-functional execution with engineering, design, business, and operations stakeholders."
  ];

  if (signals.aiSignals.length > 0) {
    focusPoints.push(`AI application keywords to mirror: ${signals.aiSignals.join(", ")}.`);
  }

  if (signals.strengthMatches.length > 0) {
    focusPoints.push(`Relevant profile strengths: ${signals.strengthMatches.join(", ")}.`);
  }

  if (profile.strengths.length > 0) {
    focusPoints.push(`Candidate strengths to emphasize: ${profile.strengths.slice(0, 3).join(", ")}.`);
  }
  if (signals.skillMatches.length > 0) {
    focusPoints.push(`Matched skill requirements: ${signals.skillMatches.join(", ")}.`);
  }
  if (signals.skillGaps.length > 0) {
    focusPoints.push(`Skill gaps to address honestly: ${signals.skillGaps.join(", ")}.`);
  }
  if (signals.languageMatches.length > 0) {
    focusPoints.push(`Language advantage to highlight: ${signals.languageMatches.join(", ")}.`);
  }

  return focusPoints;
}

function buildOutreachMessage(
  job: RawJob,
  signals: JobSignals,
  score: ScoreResult
): string {
  // Keep outreach short and safe for the demo. Real personalization can be added
  // after RAG provides cited evidence from the candidate profile.
  const aiContext = signals.aiSignals.length > 0
    ? `especially the ${signals.aiSignals.slice(0, 3).join(", ")} direction`
    : "especially the AI product direction";

  return [
    `Hi, I am interested in the ${job.title} role at ${job.company}, ${aiContext}.`,
    "My background combines engineering and product experience, so I can work with technical teams while keeping user and business outcomes clear.",
    `Based on the role signals, this looks like a ${score.level.replace("_", " ")} for my target direction.`
  ].join(" ");
}
