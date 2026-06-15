import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobAnalysis } from "../schemas.js";

export type ExportedFiles = {
  jsonPath: string;
  csvPath: string;
};

// Export is a side-effect boundary: the workflow passes in analysis objects,
// and this module is the only place that writes result files.
export async function exportResults(
  analyses: JobAnalysis[],
  outputDir: string
): Promise<ExportedFiles> {
  await mkdir(outputDir, { recursive: true });

  const jsonPath = join(outputDir, "local-mvp-results.json");
  const csvPath = join(outputDir, "local-mvp-results.csv");

  await writeFile(jsonPath, JSON.stringify(analyses, null, 2), "utf8");
  await writeFile(csvPath, toCsv(analyses), "utf8");

  return { jsonPath, csvPath };
}

function toCsv(analyses: JobAnalysis[]): string {
  const headers = [
    "title",
    "company",
    "location",
    "salary",
    "score",
    "level",
    "signalSource",
    "recommendationSource",
    "requiredSkillset",
    "skillMatches",
    "skillGaps",
    "languageRequirements",
    "languageMatches",
    "languageGaps",
    "aiReplacementRisk",
    "aiSignals",
    "productSignals",
    "riskSignals",
    "resumeFocusPoints",
    "outreachMessage"
  ];

  const rows = analyses.map((analysis) => [
    analysis.job.title,
    analysis.job.company,
    analysis.job.location,
    analysis.job.salary ?? "",
    String(analysis.score.total),
    analysis.score.level,
    analysis.metadata.signalSource,
    analysis.metadata.recommendationSource,
    analysis.signals.requiredSkillset.join("; "),
    analysis.signals.skillMatches.join("; "),
    analysis.signals.skillGaps.join("; "),
    analysis.signals.languageRequirements.join("; "),
    analysis.signals.languageMatches.join("; "),
    analysis.signals.languageGaps.join("; "),
    `${analysis.signals.aiReplacementRisk.level} (${analysis.signals.aiReplacementRisk.score}/5)`,
    analysis.signals.aiSignals.join("; "),
    analysis.signals.productSignals.join("; "),
    analysis.signals.riskSignals.join("; "),
    analysis.recommendation.resumeFocusPoints.join("; "),
    analysis.recommendation.outreachMessage
  ]);

  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
}

function escapeCsvCell(value: string): string {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}
