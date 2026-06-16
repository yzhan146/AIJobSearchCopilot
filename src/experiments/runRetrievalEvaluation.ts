import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { defaultRubric } from "../config/rubric.js";
import { readProfileKnowledge } from "../rag/profileKnowledge.js";
import { retrieveProfileEvidence } from "../rag/retrieveProfileEvidence.js";
import type { RawJob, RetrievedProfileEvidence } from "../schemas.js";
import { extractJobSignals } from "../tools/extractJobSignals.js";
import { parseCandidateProfile } from "../utils/profile.js";
import { readJobs, readProfile } from "../utils/readData.js";

type RetrievalEvalCase = {
  jobTitle: string;
  company: string;
  expectedEvidenceIds: string[];
  notes: string;
};

type RetrievalEvalResult = {
  jobTitle: string;
  company: string;
  expectedEvidenceIds: string[];
  retrievedEvidenceIds: string[];
  hitCount: number;
  recallAtK: number;
  matchedExpectedIds: string[];
  missedExpectedIds: string[];
  retrievedEvidence: RetrievedProfileEvidence[];
  notes: string;
};

type RetrievalEvalSummary = {
  k: number;
  averageRecallAtK: number;
  results: RetrievalEvalResult[];
};

type RetrievalEvalOptions = {
  jobsPath: string;
  profilePath: string;
  profileKnowledgePath: string;
  evalPath: string;
  outputDir: string;
  k: number;
};

function readArgs(argv: string[]): RetrievalEvalOptions {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key?.startsWith("--")) {
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${key}`);
      }
      args.set(key, value);
      index += 1;
    }
  }

  return {
    jobsPath: resolve(args.get("--jobs") ?? "data/sample_jobs.json"),
    profilePath: resolve(args.get("--profile") ?? "data/sample_profile.md"),
    profileKnowledgePath: resolve(args.get("--profile-knowledge") ?? "data/profile_knowledge.json"),
    evalPath: resolve(args.get("--eval") ?? "data/rag_eval_set.json"),
    outputDir: resolve(args.get("--output") ?? "exports"),
    k: Number(args.get("--k") ?? 3)
  };
}

async function main(): Promise<void> {
  const options = readArgs(process.argv.slice(2));
  const [jobs, rawProfile, knowledgeBase, evalCases] = await Promise.all([
    readJobs(options.jobsPath),
    readProfile(options.profilePath),
    readProfileKnowledge(options.profileKnowledgePath),
    readRetrievalEvalCases(options.evalPath)
  ]);
  const profile = parseCandidateProfile(rawProfile, defaultRubric);

  const results = evalCases.map((evalCase) => {
    const job = findJob(jobs, evalCase);
    const signals = extractJobSignals(job, defaultRubric, profile);
    const retrievedEvidence = retrieveProfileEvidence({
      job,
      profile,
      signals,
      knowledgeBase,
      limit: options.k
    });
    const retrievedEvidenceIds = retrievedEvidence.map((evidence) => evidence.id);
    const matchedExpectedIds = evalCase.expectedEvidenceIds.filter((id) =>
      retrievedEvidenceIds.includes(id)
    );
    const missedExpectedIds = evalCase.expectedEvidenceIds.filter(
      (id) => !retrievedEvidenceIds.includes(id)
    );

    return {
      jobTitle: evalCase.jobTitle,
      company: evalCase.company,
      expectedEvidenceIds: evalCase.expectedEvidenceIds,
      retrievedEvidenceIds,
      hitCount: matchedExpectedIds.length,
      recallAtK: matchedExpectedIds.length / evalCase.expectedEvidenceIds.length,
      matchedExpectedIds,
      missedExpectedIds,
      retrievedEvidence,
      notes: evalCase.notes
    };
  });

  const summary: RetrievalEvalSummary = {
    k: options.k,
    averageRecallAtK: average(results.map((result) => result.recallAtK)),
    results
  };
  const files = await exportRetrievalEvaluation(summary, options.outputDir);

  console.log("RAG retrieval evaluation completed.");
  console.log(`Cases evaluated: ${results.length}`);
  console.log(`Average recall@${options.k}: ${summary.averageRecallAtK.toFixed(2)}`);
  console.log(`JSON output: ${files.jsonPath}`);
  console.log(`Markdown summary: ${files.markdownPath}`);
}

async function readRetrievalEvalCases(evalPath: string): Promise<RetrievalEvalCase[]> {
  const content = await readFile(evalPath, "utf8");
  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected RAG eval file to contain an array: ${evalPath}`);
  }

  return parsed.map(validateRetrievalEvalCase);
}

function validateRetrievalEvalCase(value: unknown, index: number): RetrievalEvalCase {
  if (!isRecord(value)) {
    throw new Error(`RAG eval case at index ${index} must be an object.`);
  }

  return {
    jobTitle: readRequiredString(value.jobTitle, `ragEval[${index}].jobTitle`),
    company: readRequiredString(value.company, `ragEval[${index}].company`),
    expectedEvidenceIds: readStringArray(
      value.expectedEvidenceIds,
      `ragEval[${index}].expectedEvidenceIds`
    ),
    notes: readRequiredString(value.notes, `ragEval[${index}].notes`)
  };
}

function findJob(jobs: RawJob[], evalCase: RetrievalEvalCase): RawJob {
  const job = jobs.find(
    (candidate) =>
      candidate.title === evalCase.jobTitle && candidate.company === evalCase.company
  );

  if (!job) {
    throw new Error(`No sample job found for RAG eval case: ${evalCase.jobTitle} / ${evalCase.company}`);
  }

  return job;
}

async function exportRetrievalEvaluation(
  summary: RetrievalEvalSummary,
  outputDir: string
): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(outputDir, { recursive: true });

  const jsonPath = join(outputDir, "rag-retrieval-evaluation.json");
  const markdownPath = join(outputDir, "rag-retrieval-evaluation.md");

  await writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(markdownPath, toMarkdown(summary), "utf8");

  return { jsonPath, markdownPath };
}

function toMarkdown(summary: RetrievalEvalSummary): string {
  const lines = [
    "# RAG Retrieval Evaluation",
    "",
    `Metric: recall@${summary.k}`,
    `Average recall@${summary.k}: ${summary.averageRecallAtK.toFixed(2)}`,
    "",
    "This evaluates retrieval quality separately from recommendation generation.",
    ""
  ];

  for (const result of summary.results) {
    lines.push(
      `## ${result.jobTitle} - ${result.company}`,
      "",
      `Expected evidence: ${formatList(result.expectedEvidenceIds)}`,
      `Retrieved evidence: ${formatList(result.retrievedEvidenceIds)}`,
      `Recall@${summary.k}: ${result.recallAtK.toFixed(2)}`,
      `Matched: ${formatList(result.matchedExpectedIds)}`,
      `Missed: ${formatList(result.missedExpectedIds)}`,
      "",
      "Top retrieved evidence:",
      ...result.retrievedEvidence.map(
        (evidence) =>
          `- ${evidence.id} (${evidence.score}): ${evidence.relevanceReason}`
      ),
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be a string array.`);
  }

  return value.map((item, index) => readRequiredString(item, `${fieldName}[${index}]`));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`RAG retrieval evaluation failed: ${message}`);
  process.exitCode = 1;
});
