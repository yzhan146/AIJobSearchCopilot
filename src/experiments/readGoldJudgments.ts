import { readFile } from "node:fs/promises";
import type { ScoreResult } from "../schemas.js";
import type { GoldJudgment } from "./experimentSchemas.js";

export async function readGoldJudgments(path: string): Promise<GoldJudgment[]> {
  const content = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed)) {
    throw new Error(`Gold judgments file must contain an array: ${path}`);
  }

  return parsed.map(validateGoldJudgment);
}

export function findGoldJudgment(
  judgments: GoldJudgment[],
  title: string,
  company: string
): GoldJudgment | undefined {
  return judgments.find(
    (judgment) =>
      normalize(judgment.title) === normalize(title) &&
      normalize(judgment.company) === normalize(company)
  );
}

function validateGoldJudgment(value: unknown, index: number): GoldJudgment {
  if (!isRecord(value)) {
    throw new Error(`Gold judgment at index ${index} must be an object.`);
  }

  return {
    title: readRequiredString(value.title, `gold[${index}].title`),
    company: readRequiredString(value.company, `gold[${index}].company`),
    expectedLevel: readExpectedLevel(value.expectedLevel, `gold[${index}].expectedLevel`),
    notes: readRequiredString(value.notes, `gold[${index}].notes`)
  };
}

function readExpectedLevel(value: unknown, fieldName: string): ScoreResult["level"] {
  if (value === "strong_match" || value === "possible_match" || value === "low_priority") {
    return value;
  }
  throw new Error(`${fieldName} must be strong_match, possible_match, or low_priority.`);
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
