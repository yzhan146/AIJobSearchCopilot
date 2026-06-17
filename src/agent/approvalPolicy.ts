import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ToolSideEffectLevel = "compute" | "local_write" | "external_action";

export type ToolApprovalPolicy = "not_required" | "human_required";

export type ApprovalRequiredAction = {
  name: string;
  description: string;
  reason: string;
};

export const approvalRequiredExternalActions: ApprovalRequiredAction[] = [
  {
    name: "send_message",
    description: "Send a message to a recruiter or hiring manager.",
    reason: "Outbound messages affect reputation and should be reviewed by the user."
  },
  {
    name: "submit_resume",
    description: "Upload or submit a resume to a job platform.",
    reason: "Resume submission exposes private career data and should require consent."
  },
  {
    name: "apply_to_job",
    description: "Submit a job application on behalf of the user.",
    reason: "Applications are irreversible external actions tied to the user's identity."
  },
  {
    name: "contact_recruiter",
    description: "Initiate recruiter contact outside the local demo.",
    reason: "External contact should stay human-in-the-loop until explicitly approved."
  }
];

export type ApprovalRecord = {
  actionId: string;
  tool: string;
  inputSummary: string;
  status: "pending" | "approved" | "rejected";
  createdAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
};

export class ApprovalRequiredError extends Error {
  constructor(
    message: string,
    readonly actionId: string,
    readonly toolName: string
  ) {
    super(message);
    this.name = "ApprovalRequiredError";
  }
}

export type ApprovalCheckOptions = {
  outputDir: string;
  inputSummary: string;
};

export function createApprovalActionId(toolName: string, inputSummary: string): string {
  return createHash("sha256").update(`${toolName}:${inputSummary}`).digest("hex").slice(0, 16);
}

export function assertToolApproval(
  policy: ToolApprovalPolicy,
  toolName: string,
  options: ApprovalCheckOptions
): void {
  if (policy !== "human_required") {
    return;
  }

  const actionId = createApprovalActionId(toolName, options.inputSummary);
  const decision = findApprovalDecision(options.outputDir, actionId, toolName, options.inputSummary);

  if (decision?.status === "rejected" || decision?.rejectedAt) {
    throw new ApprovalRequiredError(
      `Tool "${toolName}" was rejected by human approval.`,
      actionId,
      toolName
    );
  }

  if (decision?.status === "approved" || decision?.approvedAt) {
    return;
  }

  recordPendingApproval(options.outputDir, {
    actionId,
    tool: toolName,
    inputSummary: options.inputSummary,
    status: "pending",
    createdAt: new Date().toISOString()
  });

  throw new ApprovalRequiredError(
    `Tool "${toolName}" requires explicit human approval before execution. Pending action: ${actionId}.`,
    actionId,
    toolName
  );
}

function findApprovalDecision(
  outputDir: string,
  actionId: string,
  toolName: string,
  inputSummary: string
): Partial<ApprovalRecord> | undefined {
  const approvals = readJsonArray(join(outputDir, "approvals.json"));

  return approvals.find((record) => {
    if (!record || typeof record !== "object") {
      return false;
    }

    const candidate = record as Partial<ApprovalRecord> & { name?: string };
    const sameAction = candidate.actionId === actionId;
    const sameToolAndInput =
      (candidate.tool === toolName || candidate.name === toolName) &&
      candidate.inputSummary === inputSummary;
    const legacyToolApproval =
      (candidate.tool === toolName || candidate.name === toolName) &&
      candidate.inputSummary === undefined;

    return sameAction || sameToolAndInput || legacyToolApproval;
  }) as Partial<ApprovalRecord> | undefined;
}

function recordPendingApproval(outputDir: string, pending: ApprovalRecord): void {
  mkdirSync(outputDir, { recursive: true });
  const pendingPath = join(outputDir, "pending-approvals.json");
  const records = readJsonArray(pendingPath) as ApprovalRecord[];
  const exists = records.some((record) => record.actionId === pending.actionId);

  if (!exists) {
    records.push(pending);
    writeFileSync(pendingPath, JSON.stringify(records, null, 2), "utf8");
  }
}

function readJsonArray(filePath: string): unknown[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }

  return parsed;
}
