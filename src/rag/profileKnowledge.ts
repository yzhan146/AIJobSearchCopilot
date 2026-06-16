import { readFile } from "node:fs/promises";
import type { ProfileEvidence, ProfileEvidenceCategory } from "../schemas.js";

const validCategories = new Set<ProfileEvidenceCategory>([
  "resume",
  "project",
  "role_criteria",
  "strength",
  "learning"
]);

export async function readProfileKnowledge(knowledgePath: string): Promise<ProfileEvidence[]> {
  const content = await readFile(knowledgePath, "utf8");
  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected profile knowledge file to contain an array: ${knowledgePath}`);
  }

  const evidence = parsed.map(validateProfileEvidence);
  ensureUniqueIds(evidence, knowledgePath);
  return evidence;
}

function validateProfileEvidence(value: unknown, index: number): ProfileEvidence {
  if (!isRecord(value)) {
    throw new Error(`Profile evidence at index ${index} must be an object.`);
  }

  const category = readRequiredString(value, "category", index);
  if (!validCategories.has(category as ProfileEvidenceCategory)) {
    throw new Error(`Profile evidence at index ${index} has invalid category: ${category}`);
  }

  return {
    id: readRequiredString(value, "id", index),
    title: readRequiredString(value, "title", index),
    category: category as ProfileEvidenceCategory,
    content: readRequiredString(value, "content", index),
    keywords: readStringArray(value, "keywords", index),
    citation: readRequiredString(value, "citation", index)
  };
}

function ensureUniqueIds(evidence: ProfileEvidence[], knowledgePath: string): void {
  const seen = new Set<string>();

  for (const item of evidence) {
    if (seen.has(item.id)) {
      throw new Error(`Duplicate profile evidence id "${item.id}" in ${knowledgePath}`);
    }
    seen.add(item.id);
  }
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  index: number
): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    throw new Error(`Profile evidence at index ${index} is missing string field: ${key}`);
  }
  return field.trim();
}

function readStringArray(
  value: Record<string, unknown>,
  key: string,
  index: number
): string[] {
  const field = value[key];
  if (!Array.isArray(field)) {
    throw new Error(`Profile evidence at index ${index} field ${key} must be a string array.`);
  }

  return field.map((item, itemIndex) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(
        `Profile evidence at index ${index} field ${key}[${itemIndex}] must be a non-empty string.`
      );
    }
    return item.trim();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
