import type { JobAnalysis, JobSignals, ScoreResult } from "../schemas.js";

export type GoldJudgment = {
  title: string;
  company: string;
  expectedLevel: ScoreResult["level"];
  notes: string;
};

export type OneShotJudgment = {
  fitScore: number;
  recommendation: "strong_match" | "possible_match" | "low_priority";
  reasons: string[];
  concerns: string[];
};

export type PromptExperimentResult = {
  jobTitle: string;
  company: string;
  oneShot: {
    output: OneShotJudgment;
    notes: string[];
  };
  structuredExtraction: {
    output: JobSignals;
    notes: string[];
  };
  hybridWorkflow: {
    output: JobAnalysis;
    notes: string[];
  };
  goldJudgment?: {
    expectedLevel: ScoreResult["level"];
    notes: string;
    oneShotAgrees: boolean;
    hybridAgrees: boolean;
  };
  comparison: {
    scoreDeltaOneShotVsHybrid: number;
    oneShotVsGold?: "match" | "mismatch";
    hybridVsGold?: "match" | "mismatch";
    learningPoints: string[];
  };
};

export type PromptExperimentSummary = {
  llm: {
    provider: string;
    model: string;
  };
  results: PromptExperimentResult[];
};

export function mapScoreToRecommendation(score: number): ScoreResult["level"] {
  if (score >= 75) {
    return "strong_match";
  }
  if (score >= 55) {
    return "possible_match";
  }
  return "low_priority";
}
