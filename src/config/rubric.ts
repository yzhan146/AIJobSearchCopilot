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
    "knowledge base",
    "copilot",
    "anomaly detection",
    "semantic analysis",
    "ai-assisted"
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
    "enterprise",
    "platform",
    "metrics"
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
    "observability",
    "scheduling",
    "cross-functional",
    "enterprise",
    "execution platform",
    "ai-assisted workflow"
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
    "observability",
    "scheduling",
    "enterprise product",
    "bi",
    "concurrency",
    "throttling"
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
