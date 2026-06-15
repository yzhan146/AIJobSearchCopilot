import type { ScoringRubric } from "../schemas.js";

// Deterministic baseline for Milestone 1.
// Later milestones can compare LLM-generated judgments against this stable rubric.
export const defaultRubric: ScoringRubric = {
  targetLocation: "Beijing",
  targetAnnualCompensationRmb: {
    min: 600_000,
    max: 1_500_000
  },
  weights: {
    location: 35,
    aiFit: 25,
    productFit: 10,
    compensation: 15,
    seniority: 10,
    skillFit: 10,
    languageFit: 10,
    riskPenalty: 5
  },
  aiKeywords: [
    "ai",
    "llm",
    "large language model",
    "agent",
    "rag",
    "aigc",
    "nlp",
    "machine learning",
    "data intelligence",
    "workflow automation",
    "knowledge base"
  ],
  productKeywords: [
    "product",
    "roadmap",
    "requirements",
    "user",
    "launch",
    "go-to-market",
    "stakeholder",
    "business",
    "enterprise"
  ],
  riskKeywords: [
    "996",
    "high pressure",
    "overtime",
    "on call",
    "fast-paced",
    "aggressive deadline",
    "sales quota"
  ],
  strengthKeywords: [
    "engineering",
    "product",
    "data workflow",
    "monitoring",
    "scheduling",
    "cross-functional",
    "enterprise"
  ],
  skillKeywords: [
    "llm",
    "rag",
    "agent",
    "aigc",
    "nlp",
    "prompt engineering",
    "workflow",
    "data analysis",
    "sql",
    "python",
    "typescript",
    "api",
    "monitoring",
    "scheduling",
    "enterprise product"
  ],
  languageKeywords: [
    "english",
    "mandarin",
    "chinese",
    "bilingual",
    "cross-border",
    "global"
  ]
};
