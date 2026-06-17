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

export function assertToolApproval(policy: ToolApprovalPolicy, toolName: string): void {
  if (policy === "human_required") {
    throw new Error(`Tool "${toolName}" requires explicit human approval before execution.`);
  }
}
