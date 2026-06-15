import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PromptExperimentResult, PromptExperimentSummary } from "./experimentSchemas.js";

export type PromptExperimentFiles = {
  jsonPath: string;
  markdownPath: string;
};

export async function exportPromptExperiment(
  summary: PromptExperimentSummary,
  outputDir: string
): Promise<PromptExperimentFiles> {
  await mkdir(outputDir, { recursive: true });

  const safeProviderName = summary.llm.provider.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const jsonPath = join(outputDir, `prompt-experiment-results-${safeProviderName}.json`);
  const markdownPath = join(outputDir, `prompt-experiment-summary-${safeProviderName}.md`);

  await writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(markdownPath, toMarkdown(summary), "utf8");

  return { jsonPath, markdownPath };
}

function toMarkdown(summary: PromptExperimentSummary): string {
  const lines = [
    "# Prompt Experiment Summary",
    "",
    `LLM provider: ${summary.llm.provider}`,
    `Model: ${summary.llm.model}`,
    "",
    "This experiment compares three prompt/application patterns:",
    "",
    "1. One-shot judgment: ask the model to score the job directly.",
    "2. Structured extraction: ask the model to extract `JobSignals` only.",
    "3. Hybrid workflow: use structured signals plus deterministic scoring.",
    ""
  ];

  for (const result of summary.results) {
    lines.push(
      `## ${result.jobTitle} - ${result.company}`,
      "",
      ...renderGoldJudgment(result),
      `One-shot score: ${result.oneShot.output.fitScore}`,
      `One-shot level: ${result.oneShot.output.recommendation}`,
      `Hybrid score: ${result.hybridWorkflow.output.score.total}`,
      `Hybrid level: ${result.hybridWorkflow.output.score.level}`,
      `Score delta: ${result.comparison.scoreDeltaOneShotVsHybrid}`,
      "",
      "Structured extraction:",
      `- AI signals: ${formatList(result.structuredExtraction.output.aiSignals)}`,
      `- Product signals: ${formatList(result.structuredExtraction.output.productSignals)}`,
      `- Required skillset: ${formatList(result.structuredExtraction.output.requiredSkillset)}`,
      `- Skill gaps: ${formatList(result.structuredExtraction.output.skillGaps)}`,
      `- Language matches: ${formatList(result.structuredExtraction.output.languageMatches)}`,
      `- AI replacement risk: ${result.structuredExtraction.output.aiReplacementRisk.level} (${result.structuredExtraction.output.aiReplacementRisk.score}/5)`,
      `- Responsibilities: ${formatList(result.structuredExtraction.output.responsibilities)}`,
      "",
      "Learning points:",
      ...result.comparison.learningPoints.map((point) => `- ${point}`),
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderGoldJudgment(result: PromptExperimentResult): string[] {
  if (!result.goldJudgment) {
    return [];
  }

  return [
    `Human gold judgment: ${result.goldJudgment.expectedLevel}`,
    `Gold notes: ${result.goldJudgment.notes}`,
    `One-shot vs gold: ${result.goldJudgment.oneShotAgrees ? "match" : "mismatch"}`,
    `Hybrid vs gold: ${result.goldJudgment.hybridAgrees ? "match" : "mismatch"}`,
    ""
  ];
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}
