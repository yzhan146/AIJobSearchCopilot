import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Minimal .env loader to keep the project dependency-light.
// Existing environment variables win, so shell-provided secrets are not replaced.
export function loadLocalEnvFiles(cwd = process.cwd()): void {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = resolve(cwd, fileName);
    if (existsSync(filePath)) {
      loadEnvFile(filePath);
    }
  }
}

function loadEnvFile(filePath: string): void {
  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid env line in ${filePath}: ${rawLine}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripQuotes(line.slice(separatorIndex + 1).trim());

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
