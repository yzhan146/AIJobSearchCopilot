import type {
  CandidateProfile,
  JobSignals,
  ProfileEvidence,
  RawJob,
  RetrievedProfileEvidence
} from "../schemas.js";
import { unique } from "../utils/text.js";

export type RetrievalInput = {
  job: RawJob;
  profile: CandidateProfile;
  signals: JobSignals;
  knowledgeBase: ProfileEvidence[];
  limit?: number;
};

type WeightedTerm = {
  term: string;
  weight: number;
};

const stopWords = new Set([
  "and",
  "or",
  "the",
  "for",
  "to",
  "of",
  "in",
  "a",
  "an",
  "with",
  "this",
  "that",
  "role",
  "job",
  "work",
  "on",
  "into",
  "from",
  "across",
  "ai",
  "product",
  "enterprise",
  "data",
  "team",
  "teams",
  "user",
  "users",
  "产品",
  "岗位",
  "负责",
  "团队"
]);

export function retrieveProfileEvidence(input: RetrievalInput): RetrievedProfileEvidence[] {
  const queryTerms = buildQueryTerms(input.job, input.profile, input.signals);

  return input.knowledgeBase
    .map((evidence) => scoreEvidence(evidence, queryTerms))
    .filter((evidence) => evidence.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, input.limit ?? 3);
}

function buildQueryTerms(
  job: RawJob,
  _profile: CandidateProfile,
  signals: JobSignals
): WeightedTerm[] {
  return mergeWeightedTerms([
    ...weightedTokenize(job.title, 2),
    ...weightedTokenize(job.company, 1),
    ...weightedTokenize(job.location, 3),
    ...weightedTokenize(job.description, 1),
    ...(job.skillset ?? []).flatMap((item) => weightedTokenize(item, 5)),
    ...(job.language ?? []).flatMap((item) => weightedTokenize(item, 3)),
    ...signals.aiSignals.flatMap((item) => weightedTokenize(item, 6)),
    ...signals.productSignals.flatMap((item) => weightedTokenize(item, 5)),
    ...signals.requiredSkillset.flatMap((item) => weightedTokenize(item, 6)),
    ...signals.skillMatches.flatMap((item) => weightedTokenize(item, 7)),
    ...signals.languageRequirements.flatMap((item) => weightedTokenize(item, 3)),
    ...signals.languageMatches.flatMap((item) => weightedTokenize(item, 4)),
    ...signals.responsibilities.flatMap((item) => weightedTokenize(item, 1))
  ]);
}

function scoreEvidence(
  evidence: ProfileEvidence,
  queryTerms: WeightedTerm[]
): RetrievedProfileEvidence {
  const searchableEvidence = normalize(
    [
      evidence.id,
      evidence.title,
      evidence.category,
      evidence.content,
      ...evidence.keywords
    ].join(" ")
  );
  const matchedTerms = queryTerms.filter(({ term }) => searchableEvidence.includes(term));
  const keywordMatches = evidence.keywords
    .map(normalize)
    .filter((keyword) => keywordMatchesQuery(keyword, queryTerms));

  const rawScore =
    matchedTerms.reduce((sum, { weight }) => sum + weight, 0) +
    keywordMatches.reduce((sum, keyword) => sum + keywordWeight(keyword, queryTerms), 0);
  const score = Math.round(rawScore * categoryWeight(evidence.category));

  return {
    ...evidence,
    score,
    matchedTerms: unique([...keywordMatches, ...matchedTerms.map(({ term }) => term)]).slice(0, 10),
    relevanceReason: buildRelevanceReason(
      evidence,
      unique([...keywordMatches, ...matchedTerms.map(({ term }) => term)])
    )
  };
}

function categoryWeight(category: ProfileEvidence["category"]): number {
  if (category === "resume" || category === "strength") {
    return 1;
  }
  if (category === "role_criteria") {
    return 0.75;
  }
  if (category === "project") {
    return 0.7;
  }
  return 0.6;
}

function keywordMatchesQuery(keyword: string, queryTerms: WeightedTerm[]): boolean {
  const terms = queryTerms.map(({ term }) => term);
  if (terms.includes(keyword)) {
    return true;
  }

  const keywordParts = keyword
    .split(/[^a-z0-9\u4e00-\u9fff+#.]+/iu)
    .filter((part) => part.length >= 2 && !stopWords.has(part));

  if (keywordParts.length > 1) {
    return keywordParts.every((part) => terms.includes(part));
  }

  return terms.some((term) => keyword.includes(term) || term.includes(keyword));
}

function keywordWeight(keyword: string, queryTerms: WeightedTerm[]): number {
  const parts = tokenize(keyword);
  const matchedWeights = queryTerms
    .filter(({ term }) => parts.includes(term) || term.includes(keyword) || keyword.includes(term))
    .map(({ weight }) => weight);

  if (matchedWeights.length === 0) {
    return 0;
  }

  return Math.max(...matchedWeights) * 3;
}

function buildRelevanceReason(evidence: ProfileEvidence, matchedTerms: string[]): string {
  if (matchedTerms.length === 0) {
    return `No direct match found for ${evidence.title}.`;
  }

  return `Retrieved because ${evidence.title} matches: ${matchedTerms.slice(0, 5).join(", ")}.`;
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9\u4e00-\u9fff+#.]+/iu)
    .filter(Boolean);
}

function weightedTokenize(text: string, weight: number): WeightedTerm[] {
  const normalized = normalize(text);
  const phraseTerm = normalized.includes(" ") && normalized.length >= 3
    ? [{ term: normalized, weight: weight + 2 }]
    : [];

  return [
    ...phraseTerm,
    ...tokenize(text)
    .filter((term) => term.length >= 2 && !stopWords.has(term))
    .map((term) => ({ term, weight }))
  ];
}

function mergeWeightedTerms(terms: WeightedTerm[]): WeightedTerm[] {
  const weights = new Map<string, number>();

  for (const { term, weight } of terms) {
    weights.set(term, Math.max(weights.get(term) ?? 0, weight));
  }

  return Array.from(weights.entries()).map(([term, weight]) => ({ term, weight }));
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
