// Core domain types for the local MVP.
// These types are the contract between workflow steps and future LLM/tool calls:
// model output should be validated into these shapes before the app trusts it.
export type RawJob = {
  title: string;
  company: string;
  location: string;
  description: string;
  salary?: string;
  url?: string;
  skillset?: string[];
  language?: string[];
};

export type CandidateProfile = {
  rawText: string;
  targetLocation?: string;
  targetAnnualCompensationRmb?: {
    min?: number;
    max?: number;
  };
  targetKeywords: string[];
  strengths: string[];
  skillset: string[];
  language: string[];
};

export type JobSignals = {
  title: string;
  company: string;
  location: string;
  salaryText: string;
  annualCompensationRmb?: {
    min?: number;
    max?: number;
    confidence: "high" | "medium" | "low";
  };
  aiSignals: string[];
  productSignals: string[];
  strengthMatches: string[];
  requiredSkillset: string[];
  skillMatches: string[];
  skillGaps: string[];
  languageRequirements: string[];
  languageMatches: string[];
  languageGaps: string[];
  riskSignals: string[];
  aiReplacementRisk: {
    // 1 means low replacement risk; 5 means high replacement risk.
    score: 1 | 2 | 3 | 4 | 5;
    level: "low" | "medium" | "high";
    reasons: string[];
  };
  seniority: "junior" | "mid" | "senior" | "lead" | "unknown";
  responsibilities: string[];
};

export type ScoreBreakdown = {
  location: number;
  aiFit: number;
  productFit: number;
  compensation: number;
  seniority: number;
  skillFit: number;
  languageFit: number;
  riskPenalty: number;
};

export type RecommendationLevel = "strong_match" | "possible_match" | "low_priority";

export type ScoreResult = {
  total: number;
  level: RecommendationLevel;
  breakdown: ScoreBreakdown;
  reasons: string[];
  concerns: string[];
};

export type JobRecommendation = {
  resumeFocusPoints: string[];
  outreachMessage: string;
  interviewTalkingPoints: string[];
};

export type JobAnalysis = {
  job: RawJob;
  signals: JobSignals;
  score: ScoreResult;
  recommendation: JobRecommendation;
  metadata: {
    signalSource: "deterministic" | "llm";
    recommendationSource: "template" | "llm";
    llmProvider?: string;
    llmModel?: string;
  };
};

export type ScoringRubric = {
  // The rubric keeps business judgment outside prompts so scoring remains
  // explainable, testable, and easy to tune without changing model behavior.
  targetLocation: string;
  targetAnnualCompensationRmb: {
    min: number;
    max: number;
  };
  weights: {
    location: number;
    aiFit: number;
    productFit: number;
    compensation: number;
    seniority: number;
    skillFit: number;
    languageFit: number;
    riskPenalty: number;
  };
  aiKeywords: string[];
  productKeywords: string[];
  riskKeywords: string[];
  strengthKeywords: string[];
  skillKeywords: string[];
  languageKeywords: string[];
};
