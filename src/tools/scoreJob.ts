import type { JobSignals, ScoreResult, ScoringRubric } from "../schemas.js";

// Keep final scoring deterministic. LLMs can extract and explain, but the score
// should remain auditable because it affects user decisions.
export function scoreJob(signals: JobSignals, rubric: ScoringRubric): ScoreResult {
  const breakdown = {
    location: scoreLocation(signals, rubric),
    aiFit: scoreBySignalCount(signals.aiSignals.length, rubric.weights.aiFit),
    productFit: scoreBySignalCount(signals.productSignals.length, rubric.weights.productFit),
    compensation: scoreCompensation(signals, rubric),
    seniority: scoreSeniority(signals, rubric),
    skillFit: scoreRequirementFit(
      signals.requiredSkillset.length,
      signals.skillGaps.length,
      rubric.weights.skillFit
    ),
    languageFit: scoreRequirementFit(
      signals.languageRequirements.length,
      signals.languageGaps.length,
      rubric.weights.languageFit
    ),
    riskPenalty: scoreRiskPenalty(signals, rubric)
  };

  const total = clamp(
    breakdown.location +
      breakdown.aiFit +
      breakdown.productFit +
      breakdown.compensation +
      breakdown.seniority -
      breakdown.skillFit +
      breakdown.languageFit -
      breakdown.riskPenalty,
    0,
    100
  );

  const hasCriticalRequirementGap =
    (signals.requiredSkillset.length > 0 && signals.skillGaps.length === signals.requiredSkillset.length) ||
    (signals.languageRequirements.length > 0 &&
      signals.languageGaps.length === signals.languageRequirements.length);
  const adjustedTotal = hasCriticalRequirementGap ? Math.min(total, 54) : total;

  return {
    total: adjustedTotal,
    level: adjustedTotal >= 75 ? "strong_match" : adjustedTotal >= 55 ? "possible_match" : "low_priority",
    breakdown,
    reasons: buildReasons(signals, breakdown),
    concerns: buildConcerns(signals, breakdown)
  };
}

function scoreLocation(signals: JobSignals, rubric: ScoringRubric): number {
  return signals.location.toLowerCase().includes(rubric.targetLocation.toLowerCase())
    ? rubric.weights.location
    : 0;
}

function scoreBySignalCount(count: number, maxScore: number): number {
  if (count <= 0) {
    return 0;
  }
  if (count === 1) {
    return Math.round(maxScore * 0.55);
  }
  if (count === 2) {
    return Math.round(maxScore * 0.8);
  }
  return maxScore;
}

function scoreCompensation(signals: JobSignals, rubric: ScoringRubric): number {
  const range = signals.annualCompensationRmb;
  if (!range) {
    return 0;
  }

  if (!range.min || !range.max) {
    // "Negotiable" or unclear salary can still be worth a follow-up, but should
    // not receive full compensation confidence.
    return Math.round(rubric.weights.compensation * 0.5);
  }

  const overlapsTarget =
    range.max >= rubric.targetAnnualCompensationRmb.min &&
    range.min <= rubric.targetAnnualCompensationRmb.max;

  if (overlapsTarget) {
    return rubric.weights.compensation;
  }

  if (range.max >= rubric.targetAnnualCompensationRmb.min * 0.8) {
    return Math.round(rubric.weights.compensation * 0.6);
  }

  return 0;
}

function scoreSeniority(signals: JobSignals, rubric: ScoringRubric): number {
  if (signals.seniority === "mid" || signals.seniority === "senior") {
    return rubric.weights.seniority;
  }

  if (signals.seniority === "lead" || signals.seniority === "unknown") {
    return Math.round(rubric.weights.seniority * 0.6);
  }

  return Math.round(rubric.weights.seniority * 0.3);
}

function scoreRequirementFit(requirementCount: number, gapCount: number, maxScore: number): number {
  if (requirementCount === 0) {
    return Math.round(maxScore * 0.5);
  }

  const matchRatio = (requirementCount - gapCount) / requirementCount;
  return Math.round(maxScore * matchRatio);
}

function scoreRiskPenalty(signals: JobSignals, rubric: ScoringRubric): number {
  const replacementRiskPenalty = Math.max(0, signals.aiReplacementRisk.score - 3) * 3;
  return Math.min(
    signals.riskSignals.length * 5 + replacementRiskPenalty,
    rubric.weights.riskPenalty
  );
}

function buildReasons(
  signals: JobSignals,
  breakdown: ScoreResult["breakdown"]
): string[] {
  const reasons: string[] = [];

  if (breakdown.location > 0) {
    reasons.push(`Location matches target: ${signals.location}.`);
  }
  if (signals.aiSignals.length > 0) {
    reasons.push(`AI signals found: ${signals.aiSignals.join(", ")}.`);
  }
  if (signals.productSignals.length > 0) {
    reasons.push(`Product signals found: ${signals.productSignals.join(", ")}.`);
  }
  if (breakdown.compensation > 0) {
    reasons.push(`Compensation appears compatible or worth clarifying: ${signals.salaryText}.`);
  }
  if (signals.skillMatches.length > 0) {
    reasons.push(`Skill requirements matched: ${signals.skillMatches.join(", ")}.`);
  }
  if (signals.languageMatches.length > 0) {
    reasons.push(`Language requirements matched: ${signals.languageMatches.join(", ")}.`);
  }
  if (signals.aiReplacementRisk.level === "low") {
    reasons.push("Role has relatively low AI replacement risk based on current signals.");
  }

  return reasons;
}

function buildConcerns(
  signals: JobSignals,
  breakdown: ScoreResult["breakdown"]
): string[] {
  const concerns: string[] = [];

  if (breakdown.location === 0) {
    concerns.push(`Location does not clearly match target: ${signals.location}.`);
  }
  if (breakdown.compensation === 0) {
    concerns.push(`Compensation is missing or below target: ${signals.salaryText}.`);
  }
  if (signals.riskSignals.length > 0) {
    concerns.push(`Potential workload or role risk signals: ${signals.riskSignals.join(", ")}.`);
  }
  if (signals.skillGaps.length > 0) {
    concerns.push(`Skill gaps to validate before applying: ${signals.skillGaps.join(", ")}.`);
  }
  if (signals.languageGaps.length > 0) {
    concerns.push(`Language requirement gaps to validate: ${signals.languageGaps.join(", ")}.`);
  }
  if (signals.aiReplacementRisk.level === "high") {
    concerns.push(
      `AI replacement risk is high (${signals.aiReplacementRisk.score}/5): ${signals.aiReplacementRisk.reasons.join("; ")}.`
    );
  }

  return concerns;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
