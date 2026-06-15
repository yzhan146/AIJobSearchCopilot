import { readFile } from "node:fs/promises";
import type { RawJob } from "../schemas.js";

// Input validation is intentionally strict. LLM-generated or user-provided data
// should fail clearly if required fields are missing.
export async function readJobs(jobsPath: string): Promise<RawJob[]> {
  const content = await readFile(jobsPath, "utf8");
  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected jobs file to contain an array: ${jobsPath}`);
  }

  return parsed.map(validateRawJob);
}

export async function readProfile(profilePath: string): Promise<string> {
  return readFile(profilePath, "utf8");
}

function validateRawJob(value: unknown, index: number): RawJob {
  if (!isObject(value)) {
    throw new Error(`Job at index ${index} must be an object`);
  }

  const title = readRequiredString(value, "title", index);
  const company = readRequiredString(value, "company", index);
  const location = readRequiredString(value, "location", index);
  const description = readRequiredString(value, "description", index);
  const salary = readOptionalString(value, "salary");
  const url = readOptionalString(value, "url");
  const skillset = readOptionalStringArray(value, "skillset", index);
  const language = readOptionalStringArray(value, "language", index);

  return {
    title,
    company,
    location,
    description,
    ...(salary ? { salary } : {}),
    ...(url ? { url } : {}),
    ...(skillset ? { skillset } : {}),
    ...(language ? { language } : {})
  };
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  index: number
): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    throw new Error(`Job at index ${index} is missing string field: ${key}`);
  }
  return field;
}

function readOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim().length > 0 ? field : undefined;
}

function readOptionalStringArray(
  value: Record<string, unknown>,
  key: string,
  index: number
): string[] | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }

  if (!Array.isArray(field)) {
    throw new Error(`Job at index ${index} field ${key} must be a string array when provided`);
  }

  return field.map((item, itemIndex) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`Job at index ${index} field ${key}[${itemIndex}] must be a non-empty string`);
    }
    return item;
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
