import type { LlmClient } from "../llm/client.js";
import { buildExtractJobSignalsPrompt } from "../llm/prompts/extractJobSignalsPrompt.js";
import type { CandidateProfile, JobSignals, RawJob, ScoringRubric } from "../schemas.js";
import { extractJobSignals } from "./extractJobSignals.js";

export type SignalExtractionResult = {
  signals: JobSignals;
  source: "deterministic" | "llm";
};

export async function extractJobSignalsWithLlm(
  job: RawJob,
  rubric: ScoringRubric,
  profile?: CandidateProfile,
  llmClient?: LlmClient
): Promise<SignalExtractionResult> {
  const baseline = extractJobSignals(job, rubric, profile);

  if (!llmClient) {
    return {
      signals: baseline,
      source: "deterministic"
    };
  }

  const prompt = buildExtractJobSignalsPrompt(job, rubric, baseline);
  const llmOutput = await llmClient.generateJson({
    system: prompt.system,
    user: prompt.user,
    temperature: 0,
    mockResponse: prompt.mockResponse
  });

  return {
    signals: normalizeLlmSignals(llmOutput, baseline),
    source: "llm"
  };
}

function normalizeLlmSignals(output: unknown, baseline: JobSignals): JobSignals {
  if (!isRecord(output)) {
    throw new Error("LLM job signal output must be an object.");
  }

  // Preserve source-of-truth fields from the original job to avoid model
  // hallucination changing identity fields such as company or location.
  return {
    title: baseline.title,
    company: baseline.company,
    location: baseline.location,
    salaryText: baseline.salaryText,
    annualCompensationRmb: readCompensation(output.annualCompensationRmb, baseline),
    aiSignals: readStringArray(output.aiSignals, "aiSignals"),
    productSignals: readStringArray(output.productSignals, "productSignals"),
    strengthMatches: readStringArray(output.strengthMatches, "strengthMatches"),
    requiredSkillset: readStringArray(output.requiredSkillset, "requiredSkillset"),
    skillMatches: readStringArray(output.skillMatches, "skillMatches"),
    skillGaps: readStringArray(output.skillGaps, "skillGaps"),
    languageRequirements: readStringArray(output.languageRequirements, "languageRequirements"),
    languageMatches: readStringArray(output.languageMatches, "languageMatches"),
    languageGaps: readStringArray(output.languageGaps, "languageGaps"),
    riskSignals: readStringArray(output.riskSignals, "riskSignals"),
    aiReplacementRisk: readAiReplacementRisk(output.aiReplacementRisk),
    seniority: readSeniority(output.seniority),
    responsibilities: readStringArray(output.responsibilities, "responsibilities")
  };
}

function readAiReplacementRisk(value: unknown): JobSignals["aiReplacementRisk"] {
  if (!isRecord(value)) {
    throw new Error("aiReplacementRisk must be an object.");
  }

  const score = value.score;
  if (score !== 1 && score !== 2 && score !== 3 && score !== 4 && score !== 5) {
    throw new Error("aiReplacementRisk.score must be an integer from 1 to 5.");
  }

  const level = value.level;
  if (level !== "low" && level !== "medium" && level !== "high") {
    throw new Error("aiReplacementRisk.level must be low, medium, or high.");
  }

  return {
    score,
    level,
    reasons: readStringArray(value.reasons, "aiReplacementRisk.reasons")
  };
}

function readCompensation(value: unknown, baseline: JobSignals): JobSignals["annualCompensationRmb"] {
  if (value === undefined || value === null) {
    return baseline.annualCompensationRmb;
  }

  if (!isRecord(value)) {
    throw new Error("annualCompensationRmb must be an object when provided.");
  }

  const confidence = value.confidence;
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") {
    throw new Error("annualCompensationRmb.confidence must be high, medium, or low.");
  }

  const min = readOptionalNumber(value.min, "annualCompensationRmb.min");
  const max = readOptionalNumber(value.max, "annualCompensationRmb.max");

  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    confidence
  };
}

function readOptionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${fieldName} must be a number when provided.`);
  }

  return value;
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

function readSeniority(value: unknown): JobSignals["seniority"] {
  if (
    value === "junior" ||
    value === "mid" ||
    value === "senior" ||
    value === "lead" ||
    value === "unknown"
  ) {
    return value;
  }

  throw new Error("seniority must be junior, mid, senior, lead, or unknown.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
