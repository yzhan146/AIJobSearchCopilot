import type { CandidateProfile, ScoringRubric } from "../schemas.js";
import { findKeywords } from "./text.js";

export function parseCandidateProfile(
  rawText: string,
  rubric: ScoringRubric
): CandidateProfile {
  return {
    rawText,
    targetLocation: rubric.targetLocation,
    targetAnnualCompensationRmb: rubric.targetAnnualCompensationRmb,
    targetKeywords: [
      ...findKeywords(rawText, rubric.aiKeywords),
      ...findKeywords(rawText, rubric.productKeywords)
    ],
    strengths: findKeywords(rawText, rubric.strengthKeywords),
    skillset: findKeywords(rawText, rubric.skillKeywords),
    language: findKeywords(rawText, rubric.languageKeywords)
  };
}
