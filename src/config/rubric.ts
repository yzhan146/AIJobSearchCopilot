import type { ScoringRubric } from "../schemas.js";

// Deterministic baseline for the learning/demo workflow.
// The production UI now treats location and compensation as user-supplied context,
// not as hard-coded default preferences.
export const defaultRubric: ScoringRubric = {
  targetLocation: "",
  targetAnnualCompensationRmb: {
    min: 0,
    max: 0
  },
  weights: {
    location: 0,
    aiFit: 30,
    productFit: 15,
    compensation: 0,
    seniority: 10,
    skillFit: 20,
    languageFit: 10,
    riskPenalty: 10
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
