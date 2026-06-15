import type { JobAnalysis, JobSignals } from "../schemas.js";
import type { GoldJudgment, OneShotJudgment, PromptExperimentResult } from "./experimentSchemas.js";

export function compareExperimentResults(
  jobTitle: string,
  company: string,
  oneShot: OneShotJudgment,
  structuredSignals: JobSignals,
  hybridAnalysis: JobAnalysis,
  goldJudgment?: GoldJudgment
): PromptExperimentResult {
  const oneShotAgrees = goldJudgment?.expectedLevel === oneShot.recommendation;
  const hybridAgrees = goldJudgment?.expectedLevel === hybridAnalysis.score.level;

  return {
    jobTitle,
    company,
    oneShot: {
      output: oneShot,
      notes: [
        "Fastest to build, but score and reasoning are model-owned.",
        "Harder to audit because extraction, scoring, and recommendation are mixed together."
      ]
    },
    structuredExtraction: {
      output: structuredSignals,
      notes: [
        "The model is constrained to extract signals instead of making the final decision.",
        "Output can be validated against JobSignals before downstream tools trust it."
      ]
    },
    hybridWorkflow: {
      output: hybridAnalysis,
      notes: [
        "LLM can help extract or write, while deterministic code owns the score.",
        "This is the most interview-ready pattern because it is explainable and testable."
      ]
    },
    ...(goldJudgment
      ? {
          goldJudgment: {
            expectedLevel: goldJudgment.expectedLevel,
            notes: goldJudgment.notes,
            oneShotAgrees: Boolean(oneShotAgrees),
            hybridAgrees: Boolean(hybridAgrees)
          }
        }
      : {}),
    comparison: {
      scoreDeltaOneShotVsHybrid: oneShot.fitScore - hybridAnalysis.score.total,
      ...(goldJudgment
        ? {
            oneShotVsGold: oneShotAgrees ? "match" : "mismatch",
            hybridVsGold: hybridAgrees ? "match" : "mismatch"
          }
        : {}),
      learningPoints: buildLearningPoints(oneShot, structuredSignals, hybridAnalysis, goldJudgment)
    }
  };
}

function buildLearningPoints(
  oneShot: OneShotJudgment,
  structuredSignals: JobSignals,
  hybridAnalysis: JobAnalysis,
  goldJudgment?: GoldJudgment
): string[] {
  const learningPoints = [
    `One-shot score was ${oneShot.fitScore}; hybrid score was ${hybridAnalysis.score.total}.`,
    "Structured extraction exposes why a role was scored, instead of hiding judgment inside prose."
  ];

  if (structuredSignals.skillGaps.length > 0) {
    learningPoints.push(`Skill gaps became explicit: ${structuredSignals.skillGaps.join(", ")}.`);
  }

  if (structuredSignals.languageMatches.length > 0) {
    learningPoints.push(`Language advantage became explicit: ${structuredSignals.languageMatches.join(", ")}.`);
  }

  if (structuredSignals.aiReplacementRisk.level !== "medium") {
    learningPoints.push(
      `AI replacement risk became a separate signal: ${structuredSignals.aiReplacementRisk.level} (${structuredSignals.aiReplacementRisk.score}/5).`
    );
  }

  if (goldJudgment) {
    learningPoints.push(`Human gold judgment is ${goldJudgment.expectedLevel}: ${goldJudgment.notes}`);
    learningPoints.push(
      `One-shot ${oneShot.recommendation === goldJudgment.expectedLevel ? "matches" : "misses"} gold; hybrid ${
        hybridAnalysis.score.level === goldJudgment.expectedLevel ? "matches" : "misses"
      } gold.`
    );
  }

  return learningPoints;
}
