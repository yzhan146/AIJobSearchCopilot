import type { CandidateProfile, JobSignals, RawJob, ScoringRubric } from "../schemas.js";
import { containsAny, findKeywords, splitSentences } from "../utils/text.js";

// Extract structured job signals from raw JD text.
// This is deliberately rule-based for now; it creates a stable baseline that a
// future LLM extractor can replace or be evaluated against.
export function extractJobSignals(
  job: RawJob,
  rubric: ScoringRubric,
  profile?: CandidateProfile
): JobSignals {
  const searchableText = [
    job.title,
    job.company,
    job.location,
    job.salary ?? "",
    job.description,
    ...(job.skillset ?? []),
    ...(job.language ?? [])
  ].join(" ");
  const aiSignals = findKeywords(searchableText, rubric.aiKeywords);
  const productSignals = findKeywords(searchableText, rubric.productKeywords);
  const riskSignals = findKeywords(searchableText, rubric.riskKeywords);
  const strengthMatches = findKeywords(searchableText, rubric.strengthKeywords);
  const requiredSkillset = uniqueEquivalentKeywords([
    ...(job.skillset ?? []),
    ...findKeywords(searchableText, rubric.skillKeywords)
  ]);
  const languageRequirements = uniqueEquivalentKeywords([
    ...(job.language ?? []),
    ...findKeywords(searchableText, rubric.languageKeywords)
  ]);
  const candidateSkillset = profile?.skillset ?? [];
  const candidateLanguage = profile?.language ?? [];

  return {
    title: job.title,
    company: job.company,
    location: job.location,
    salaryText: job.salary ?? "Not specified",
    annualCompensationRmb: parseAnnualCompensation(job.salary),
    aiSignals,
    productSignals,
    strengthMatches,
    requiredSkillset,
    skillMatches: intersectKeywords(requiredSkillset, candidateSkillset),
    skillGaps: differenceKeywords(requiredSkillset, candidateSkillset),
    languageRequirements,
    languageMatches: intersectKeywords(languageRequirements, candidateLanguage),
    languageGaps: differenceKeywords(languageRequirements, candidateLanguage),
    riskSignals,
    aiReplacementRisk: inferAiReplacementRisk(searchableText),
    seniority: inferSeniority(searchableText),
    responsibilities: inferResponsibilities(job.description)
  };
}

function intersectKeywords(required: string[], available: string[]): string[] {
  return required.filter((item) => containsEquivalent(available, item));
}

function differenceKeywords(required: string[], available: string[]): string[] {
  return required.filter((item) => !containsEquivalent(available, item));
}

function containsEquivalent(values: string[], candidate: string): boolean {
  const normalizedCandidate = candidate.toLowerCase();
  return values.some((value) => {
    const normalizedValue = value.toLowerCase();
    return normalizedValue.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedValue);
  });
}

function uniqueEquivalentKeywords(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (!containsEquivalent(result, value)) {
      result.push(value);
    }
  }
  return result;
}

function inferSeniority(text: string): JobSignals["seniority"] {
  if (containsAny(text, ["head", "director", "principal", "expert", "负责人"])) {
    return "lead";
  }

  if (containsAny(text, ["senior", "高级", "资深", "lead"])) {
    return "senior";
  }

  if (containsAny(text, ["junior", "entry", "assistant", "初级", "助理"])) {
    return "junior";
  }

  if (containsAny(text, ["manager", "product manager", "3-5 years", "3+ years", "经理"])) {
    return "mid";
  }

  return "unknown";
}

function inferResponsibilities(description: string): string[] {
  return splitSentences(description)
    .filter((sentence) =>
      containsAny(sentence, [
        "build",
        "launch",
        "work with",
        "design",
        "define",
        "manage",
        "collaborate",
        "负责",
        "设计",
        "推动"
      ])
    )
    .slice(0, 5);
}

function inferAiReplacementRisk(text: string): JobSignals["aiReplacementRisk"] {
  const highRiskSignals = findKeywords(text, [
    "daily operations",
    "sales quota",
    "content writing",
    "data entry",
    "routine",
    "repetitive",
    "support",
    "客服",
    "运营支持"
  ]);
  const lowRiskSignals = findKeywords(text, [
    "roadmap",
    "strategy",
    "stakeholder",
    "enterprise",
    "cross-functional",
    "engineering",
    "launch",
    "复杂",
    "战略"
  ]);

  const rawScore = 3 + Math.min(highRiskSignals.length, 2) - Math.min(lowRiskSignals.length, 2);
  const score = Math.max(1, Math.min(5, rawScore)) as 1 | 2 | 3 | 4 | 5;

  return {
    score,
    level: score >= 4 ? "high" : score <= 2 ? "low" : "medium",
    reasons: [
      ...highRiskSignals.map((signal) => `Routine/repetitive signal: ${signal}`),
      ...lowRiskSignals.map((signal) => `Harder-to-automate product signal: ${signal}`)
    ]
  };
}

function parseAnnualCompensation(
  salaryText?: string
): JobSignals["annualCompensationRmb"] {
  if (!salaryText) {
    return undefined;
  }

  const text = salaryText.toLowerCase();

  // Handles portfolio-demo examples such as "60-100w RMB annual package".
  const annualWanMatch = text.match(/(\d+(?:\.\d+)?)\s*[-~到]\s*(\d+(?:\.\d+)?)\s*w/);
  if (annualWanMatch) {
    return {
      min: Number(annualWanMatch[1]) * 10_000,
      max: Number(annualWanMatch[2]) * 10_000,
      confidence: "high"
    };
  }

  // Handles Chinese monthly salary formats such as "2-4万" or "2-4万 14薪".
  const monthlyWanMatch = text.match(/(\d+(?:\.\d+)?)\s*[-~到]\s*(\d+(?:\.\d+)?)\s*万/);
  if (monthlyWanMatch) {
    const months = text.match(/(\d+)\s*薪/);
    const multiplier = months ? Number(months[1]) : 12;
    return {
      min: Number(monthlyWanMatch[1]) * 10_000 * multiplier,
      max: Number(monthlyWanMatch[2]) * 10_000 * multiplier,
      confidence: months ? "high" : "medium"
    };
  }

  if (containsAny(text, ["negotiable", "面议"])) {
    return {
      confidence: "low"
    };
  }

  return undefined;
}
