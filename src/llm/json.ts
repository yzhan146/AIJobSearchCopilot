export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed) as unknown;
  }

  // Some models still wrap JSON in markdown fences. Keep this parser strict
  // enough to reveal malformed output instead of silently accepting prose.
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1]) as unknown;
  }

  throw new Error("LLM response did not contain a JSON object.");
}
