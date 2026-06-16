import type {
  CandidateProfile,
  JobRecommendation,
  JobSignals,
  ProfileEvidenceCitation,
  RawJob,
  RetrievedProfileEvidence,
  ScoreResult
} from "../schemas.js";

// Generate user-facing advice from structured signals.
// This is currently templated; later it is a natural place to add an LLM call
// because wording quality matters more here than deterministic scoring.
export function generateRecommendations(
  job: RawJob,
  profile: CandidateProfile,
  signals: JobSignals,
  score: ScoreResult,
  retrievedEvidence: RetrievedProfileEvidence[] = []
): JobRecommendation {
  const resumeFocusPoints = buildResumeFocusPoints(profile, signals);
  const evidenceCitations = buildEvidenceCitations(retrievedEvidence);

  if (evidenceCitations.length > 0) {
    resumeFocusPoints.push(
      `Cited evidence to use: ${evidenceCitations
        .map((citation) => `${citation.title} [${citation.id}]`)
        .join("; ")}.`
    );
  }

  return {
    resumeFocusPoints,
    outreachMessage: buildOutreachMessage(job, signals, score, evidenceCitations),
    interviewTalkingPoints: [
      `Explain why ${signals.aiSignals.join(", ") || "AI application work"} matters for this role.`,
      "Connect engineering-product experience to cross-functional AI product delivery.",
      ...buildEvidenceTalkingPoints(evidenceCitations),
      "Describe how deterministic scoring and LLM generation are separated in this demo."
    ],
    evidenceCitations
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
  score: ScoreResult,
  evidenceCitations: ProfileEvidenceCitation[]
): string {
  // Keep outreach short and safe for the demo while still grounding one sentence
  // in retrieved profile evidence.
  const aiContext = signals.aiSignals.length > 0
    ? `especially the ${signals.aiSignals.slice(0, 3).join(", ")} direction`
    : "especially the AI product direction";
  const evidenceContext = evidenceCitations[0]
    ? ` One relevant background point is ${evidenceCitations[0].title.toLowerCase()}.`
    : "";

  return [
    `Hi, I am interested in the ${job.title} role at ${job.company}, ${aiContext}.`,
    `My background combines engineering and product experience, so I can work with technical teams while keeping user and business outcomes clear.${evidenceContext}`,
    `Based on the role signals, this looks like a ${score.level.replace("_", " ")} for my target direction.`
  ].join(" ");
}

function buildEvidenceCitations(
  retrievedEvidence: RetrievedProfileEvidence[]
): ProfileEvidenceCitation[] {
  return retrievedEvidence.map((evidence) => ({
    id: evidence.id,
    title: evidence.title,
    quote: evidence.content,
    relevanceReason: evidence.relevanceReason
  }));
}

function buildEvidenceTalkingPoints(
  evidenceCitations: ProfileEvidenceCitation[]
): string[] {
  return evidenceCitations
    .slice(0, 2)
    .map(
      (citation) =>
        `Use ${citation.title} [${citation.id}] as cited proof: ${citation.relevanceReason}`
    );
}
