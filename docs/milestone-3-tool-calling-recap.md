# Milestone 3 Recap: Tool Calling and Agent Workflow

Milestone 3 turns the local MVP from hidden function calls into explicit tool calls. The product behavior is intentionally the same, but the architecture is now easier to explain as a Function Calling / Tool Calling system.

## What changed

The workflow now uses a local tool registry in `src/agent/toolRegistry.ts`:

| Tool | Purpose | Side effect | Approval |
|---|---|---|---|
| `extract_job_signals` | Parse a raw JD into validated `JobSignals` | compute | not required |
| `score_job` | Score the role with deterministic rubric logic | compute | not required |
| `retrieve_profile_evidence` | Retrieve RAG evidence from profile knowledge | compute | not required |
| `generate_recommendation` | Generate resume focus, outreach draft, and talking points | compute | not required |
| `export_results` | Write local JSON and CSV output files | local write | not required |

Every tool has:

```text
name
description
input schema
output schema
side-effect level
approval policy
input/output summaries
typed implementation
```

This is the practical Function Calling concept: the model or runner can choose a tool, but application code owns validation, execution, side effects, and logging.

## Tool-call trace

Each run now writes:

```text
exports/tool-call-trace.json
```

The trace records which tool ran, what input/output summary it produced, how long it took, whether it succeeded, and whether the tool had side effects.

Example shape:

```json
{
  "tool": "retrieve_profile_evidence",
  "inputSummary": "AI Product Manager at Example (Beijing)",
  "outputSummary": "3 evidence chunks retrieved",
  "durationMs": 1,
  "success": true,
  "sideEffectLevel": "compute",
  "approval": "not_required"
}
```

This is interview-relevant because it makes the AI workflow debuggable. If a final recommendation looks wrong, you can inspect whether extraction, scoring, retrieval, recommendation, or export was the weak link.

## Human approval boundary

`src/agent/approvalPolicy.ts` separates safe local tools from external actions that should require approval:

```text
send_message
submit_resume
apply_to_job
contact_recruiter
```

Milestone 3 does not implement auto-apply or recruiter messaging. It only implements the boundary concept, which is the right product and safety choice for a job-search assistant.

## Interview-ready explanation

> In this project, Function Calling is not just JSON output from an LLM. I model each capability as a typed tool with schemas, side-effect metadata, approval policy, execution code, and trace logging. The current runner still follows a fixed plan for reliability, but the architecture is ready for a future agent planner to choose tools dynamically.

> I kept external job-application actions behind human approval because they involve privacy and reputation. Local analysis and export are safe; messaging recruiters or submitting resumes should not happen autonomously.
