import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type RoleKnowledge = {
  id: string;
  title: string;
  family: string;
  content: string;
  resumeSignals: string[];
  interviewFocus: string[];
  keywords: string[];
  citation: string;
};

type RetrievedRoleKnowledge = RoleKnowledge & {
  score: number;
  matchedTerms: string[];
  relevanceReason: string;
};

type RoleEvalCase = {
  jobTitle: string;
  description: string;
  expectedRoleIds: string[];
  notes: string;
};

type RoleEvalResult = RoleEvalCase & {
  retrievedRoleIds: string[];
  hitCount: number;
  recallAtK: number;
  matchedExpectedIds: string[];
  missedExpectedIds: string[];
  retrievedRoles: RetrievedRoleKnowledge[];
};

type RoleEvalOptions = {
  knowledgePath: string;
  evalPath: string;
  outputDir: string;
  k: number;
};

const stopWords = new Set([
  "and",
  "or",
  "the",
  "for",
  "to",
  "of",
  "in",
  "a",
  "an",
  "with",
  "role",
  "job",
  "work",
  "team",
  "teams",
  "user",
  "users",
  "负责",
  "岗位",
  "团队",
  "工作"
]);

function readArgs(argv: string[]): RoleEvalOptions {
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
    knowledgePath: resolve(args.get("--knowledge") ?? "data/internet_role_knowledge.json"),
    evalPath: resolve(args.get("--eval") ?? "data/internet_role_eval_set.json"),
    outputDir: resolve(args.get("--output") ?? "exports"),
    k: Number(args.get("--k") ?? 3)
  };
}

async function main(): Promise<void> {
  const options = readArgs(process.argv.slice(2));
  const [knowledgeBase, evalCases] = await Promise.all([
    readRoleKnowledge(options.knowledgePath),
    readEvalCases(options.evalPath)
  ]);

  const results = evalCases.map((evalCase) => {
    const retrievedRoles = retrieveRoleKnowledge(evalCase, knowledgeBase, options.k);
    const retrievedRoleIds = retrievedRoles.map((role) => role.id);
    const matchedExpectedIds = evalCase.expectedRoleIds.filter((id) =>
      retrievedRoleIds.includes(id)
    );
    const missedExpectedIds = evalCase.expectedRoleIds.filter(
      (id) => !retrievedRoleIds.includes(id)
    );

    return {
      ...evalCase,
      retrievedRoleIds,
      hitCount: matchedExpectedIds.length,
      recallAtK: matchedExpectedIds.length / evalCase.expectedRoleIds.length,
      matchedExpectedIds,
      missedExpectedIds,
      retrievedRoles
    };
  });

  const averageRecallAtK = average(results.map((result) => result.recallAtK));
  const files = await exportEvaluation(results, options.outputDir, options.k, averageRecallAtK);

  console.log("Internet role RAG retrieval evaluation completed.");
  console.log(`Cases evaluated: ${results.length}`);
  console.log(`Average recall@${options.k}: ${averageRecallAtK.toFixed(2)}`);
  console.log(`JSON output: ${files.jsonPath}`);
  console.log(`Markdown summary: ${files.markdownPath}`);
}

function retrieveRoleKnowledge(
  evalCase: RoleEvalCase,
  knowledgeBase: RoleKnowledge[],
  limit: number
): RetrievedRoleKnowledge[] {
  const queryTerms = tokenize(`${evalCase.jobTitle} ${evalCase.description}`);

  return knowledgeBase
    .map((role) => scoreRole(role, queryTerms))
    .filter((role) => role.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}

function scoreRole(role: RoleKnowledge, queryTerms: string[]): RetrievedRoleKnowledge {
  const searchable = normalize([
    role.id,
    role.title,
    role.family,
    role.content,
    ...role.resumeSignals,
    ...role.interviewFocus,
    ...role.keywords
  ].join(" "));
  const matchedTerms = queryTerms.filter((term) => searchable.includes(term));
  const keywordMatches = role.keywords
    .map(normalize)
    .filter((keyword) => keywordMatchesQuery(keyword, queryTerms));
  const uniqueMatches = [...new Set([...keywordMatches, ...matchedTerms])].slice(0, 10);
  const score = uniqueMatches.reduce((sum, term) => sum + Math.max(2, term.length > 8 ? 5 : 3), 0);

  return {
    ...role,
    score,
    matchedTerms: uniqueMatches,
    relevanceReason: uniqueMatches.length
      ? `Retrieved because ${role.title} matches: ${uniqueMatches.slice(0, 5).join(", ")}.`
      : `No direct match found for ${role.title}.`
  };
}

async function readRoleKnowledge(filePath: string): Promise<RoleKnowledge[]> {
  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected role knowledge file to contain an array: ${filePath}`);
  }
  return parsed.map(validateRoleKnowledge);
}

function validateRoleKnowledge(value: unknown, index: number): RoleKnowledge {
  if (!isRecord(value)) {
    throw new Error(`Role knowledge at index ${index} must be an object.`);
  }
  return {
    id: readRequiredString(value.id, `roleKnowledge[${index}].id`),
    title: readRequiredString(value.title, `roleKnowledge[${index}].title`),
    family: readRequiredString(value.family, `roleKnowledge[${index}].family`),
    content: readRequiredString(value.content, `roleKnowledge[${index}].content`),
    resumeSignals: readStringArray(value.resumeSignals, `roleKnowledge[${index}].resumeSignals`),
    interviewFocus: readStringArray(value.interviewFocus, `roleKnowledge[${index}].interviewFocus`),
    keywords: readStringArray(value.keywords, `roleKnowledge[${index}].keywords`),
    citation: readRequiredString(value.citation, `roleKnowledge[${index}].citation`)
  };
}

async function readEvalCases(filePath: string): Promise<RoleEvalCase[]> {
  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected role eval file to contain an array: ${filePath}`);
  }
  return parsed.map(validateEvalCase);
}

function validateEvalCase(value: unknown, index: number): RoleEvalCase {
  if (!isRecord(value)) {
    throw new Error(`Role eval case at index ${index} must be an object.`);
  }
  return {
    jobTitle: readRequiredString(value.jobTitle, `roleEval[${index}].jobTitle`),
    description: readRequiredString(value.description, `roleEval[${index}].description`),
    expectedRoleIds: readStringArray(value.expectedRoleIds, `roleEval[${index}].expectedRoleIds`),
    notes: readRequiredString(value.notes, `roleEval[${index}].notes`)
  };
}

async function exportEvaluation(
  results: RoleEvalResult[],
  outputDir: string,
  k: number,
  averageRecallAtK: number
): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(outputDir, { recursive: true });

  const jsonPath = join(outputDir, "internet-role-rag-evaluation.json");
  const markdownPath = join(outputDir, "internet-role-rag-evaluation.md");
  const summary = { k, averageRecallAtK, results };

  await writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(markdownPath, toMarkdown(results, k, averageRecallAtK), "utf8");

  return { jsonPath, markdownPath };
}

function toMarkdown(results: RoleEvalResult[], k: number, averageRecallAtK: number): string {
  const lines = [
    "# Internet Role RAG Retrieval Evaluation",
    "",
    `Metric: recall@${k}`,
    `Average recall@${k}: ${averageRecallAtK.toFixed(2)}`,
    "",
    "This evaluates whether a JD retrieves the correct internet role playbook.",
    ""
  ];

  for (const result of results) {
    lines.push(
      `## ${result.jobTitle}`,
      "",
      `Expected roles: ${formatList(result.expectedRoleIds)}`,
      `Retrieved roles: ${formatList(result.retrievedRoleIds)}`,
      `Recall@${k}: ${result.recallAtK.toFixed(2)}`,
      `Matched: ${formatList(result.matchedExpectedIds)}`,
      `Missed: ${formatList(result.missedExpectedIds)}`,
      "",
      "Top retrieved roles:",
      ...result.retrievedRoles.map((role) => `- ${role.id} (${role.score}): ${role.relevanceReason}`),
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}

function keywordMatchesQuery(keyword: string, queryTerms: string[]): boolean {
  if (queryTerms.includes(keyword)) return true;
  const parts = keyword
    .split(/[^a-z0-9\u4e00-\u9fff+#.]+/iu)
    .filter((part) => part.length >= 2 && !stopWords.has(part));
  if (parts.length > 1) {
    return parts.every((part) => queryTerms.includes(part));
  }
  return queryTerms.some((term) => keyword.includes(term) || term.includes(keyword));
}

function tokenize(text: string): string[] {
  return [...new Set(normalize(text)
    .split(/[^a-z0-9\u4e00-\u9fff+#.]+/iu)
    .filter((term) => term.length >= 2 && !stopWords.has(term)))];
}

function normalize(text: string): string {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
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
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Internet role RAG retrieval evaluation failed: ${message}`);
  process.exitCode = 1;
});
