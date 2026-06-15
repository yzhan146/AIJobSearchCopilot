import type { JobSignals, RawJob, ScoringRubric } from "../../schemas.js";

export function buildExtractJobSignalsPrompt(
  job: RawJob,
  rubric: ScoringRubric,
  baseline: JobSignals
): { system: string; user: string; mockResponse: JobSignals } {
  return {
    system: [
      "You extract structured job signals for an AI job-search assistant.",
      "Return JSON only. Do not invent facts that are not present in the job description.",
      "Keep scoring out of this step; scoring is handled by deterministic code."
    ].join(" "),
    user: JSON.stringify(
      {
        task: "extract_job_signals",
        output_schema: {
          title: "string",
          company: "string",
          location: "string",
          salaryText: "string",
          annualCompensationRmb: {
            min: "number | omitted",
            max: "number | omitted",
            confidence: "high | medium | low"
          },
          aiSignals: "string[]",
          productSignals: "string[]",
          strengthMatches: "string[]",
          requiredSkillset: "string[]",
          skillMatches: "string[]",
          skillGaps: "string[]",
          languageRequirements: "string[]",
          languageMatches: "string[]",
          languageGaps: "string[]",
          riskSignals: "string[]",
          aiReplacementRisk: {
            score: "1 | 2 | 3 | 4 | 5",
            level: "low | medium | high",
            reasons: "string[]"
          },
          seniority: "junior | mid | senior | lead | unknown",
          responsibilities: "string[]"
        },
        rubric_hints: {
          aiKeywords: rubric.aiKeywords,
          productKeywords: rubric.productKeywords,
          riskKeywords: rubric.riskKeywords,
          strengthKeywords: rubric.strengthKeywords,
          skillKeywords: rubric.skillKeywords,
          languageKeywords: rubric.languageKeywords
        },
        job
      },
      null,
      2
    ),
    // The mock response mirrors the deterministic baseline. This lets us test
    // the LLM path without pretending a fake model made new judgments.
    mockResponse: baseline
  };
}
