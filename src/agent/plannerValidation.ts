import type { RawJob } from "../schemas.js";
import { listRegisteredTools, type ToolName } from "./toolRegistry.js";

export type LlmPlanStep = {
  tool: string;
  args?: Record<string, unknown>;
};

export type LlmPlan = {
  plan: LlmPlanStep[];
  maxSteps?: number;
  stopCondition?: string;
};

export type PlanValidationResult =
  | { ok: true; plan: LlmPlan }
  | { ok: false; errors: string[] };

const MAX_PLAN_STEPS = 8;
const toolsRequiringJobIndex = new Set<ToolName>([
  "extract_job_signals",
  "score_job",
  "retrieve_profile_evidence",
  "generate_recommendation",
  "apply_to_job"
]);

export function validateLlmPlan(plan: unknown, jobs: RawJob[]): PlanValidationResult {
  const errors: string[] = [];

  if (!plan || typeof plan !== "object") {
    return { ok: false, errors: ["Plan must be a JSON object."] };
  }

  const candidate = plan as Partial<LlmPlan>;
  if (!Array.isArray(candidate.plan)) {
    return { ok: false, errors: ["Plan must include a plan array."] };
  }

  if (candidate.plan.length === 0) {
    errors.push("Plan must include at least one step.");
  }

  const maxSteps = candidate.maxSteps ?? candidate.plan.length;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_PLAN_STEPS) {
    errors.push(`maxSteps must be an integer between 1 and ${MAX_PLAN_STEPS}.`);
  }

  if (candidate.plan.length > MAX_PLAN_STEPS) {
    errors.push(`Plan has ${candidate.plan.length} steps, but the limit is ${MAX_PLAN_STEPS}.`);
  }

  const toolNames = new Set(listRegisteredTools().map((tool) => tool.name));
  for (const [index, step] of candidate.plan.entries()) {
    if (!step || typeof step !== "object") {
      errors.push(`Step ${index} must be an object.`);
      continue;
    }

    if (typeof step.tool !== "string") {
      errors.push(`Step ${index} must include a string tool name.`);
      continue;
    }

    if (!toolNames.has(step.tool as ToolName)) {
      errors.push(`Step ${index} uses unknown tool "${step.tool}".`);
      continue;
    }

    const args = step.args ?? {};
    if (typeof args !== "object" || Array.isArray(args)) {
      errors.push(`Step ${index} args must be an object when provided.`);
      continue;
    }

    validateToolArgs(step.tool as ToolName, args as Record<string, unknown>, jobs.length, index, errors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    plan: {
      plan: candidate.plan,
      maxSteps,
      stopCondition: candidate.stopCondition
    }
  };
}

function validateToolArgs(
  tool: ToolName,
  args: Record<string, unknown>,
  jobCount: number,
  stepIndex: number,
  errors: string[]
): void {
  if (toolsRequiringJobIndex.has(tool)) {
    const jobIndex = args.jobIndex;
    if (!Number.isInteger(jobIndex)) {
      errors.push(`Step ${stepIndex} (${tool}) requires integer args.jobIndex.`);
      return;
    }

    if ((jobIndex as number) < 0 || (jobIndex as number) >= jobCount) {
      errors.push(`Step ${stepIndex} (${tool}) has out-of-range jobIndex ${jobIndex}.`);
    }
  }

  if (tool === "send_message") {
    for (const key of ["recipient", "subject", "body"]) {
      if (typeof args[key] !== "string" || String(args[key]).trim().length === 0) {
        errors.push(`Step ${stepIndex} (send_message) requires non-empty string args.${key}.`);
      }
    }
  }

  if (tool === "retrieve_profile_evidence" && args.limit !== undefined) {
    if (!Number.isInteger(args.limit) || (args.limit as number) < 1 || (args.limit as number) > 10) {
      errors.push(`Step ${stepIndex} (retrieve_profile_evidence) limit must be an integer from 1 to 10.`);
    }
  }
}
