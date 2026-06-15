export function findKeywords(text: string, keywords: string[]): string[] {
  const normalizedText = normalize(text);
  return unique(
    keywords.filter((keyword) => normalizedText.includes(normalize(keyword)))
  );
}

export function containsAny(text: string, candidates: string[]): boolean {
  const normalizedText = normalize(text);
  return candidates.some((candidate) => normalizedText.includes(normalize(candidate)));
}

export function splitSentences(text: string): string[] {
  return text
    .split(/[.!?。！？]\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
