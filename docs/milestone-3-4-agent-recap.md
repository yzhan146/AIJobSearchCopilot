# Milestone 3-4 Recap: From Workflow to Agent-Ready System

Milestones 3 and 4 upgraded AI Job Search Copilot from a fixed local workflow into an agent-ready architecture. The goal was not to make the LLM "do everything"; the goal was to let the LLM plan within strict engineering boundaries while deterministic code owns execution, validation, approval, and traceability.

## What Milestone 3 added

Milestone 3 introduced explicit tool calling:

| Component | File | Purpose |
|---|---|---|
| Tool registry | `src/agent/toolRegistry.ts` | Central list of available tools, descriptions, schemas, side-effect levels, approval policies, and typed implementations |
| Approval policy | `src/agent/approvalPolicy.ts` | Blocks external actions unless the user has approved them |
| Trace writer | `src/agent/trace.ts` | Writes `exports/tool-call-trace.json` for debugging and auditability |
| Workflow integration | `src/workflow/runLocalMvp.ts` | Runs the existing MVP through registered tools instead of hidden direct function calls |

The registered tools include:

| Tool | Role | Side effect |
|---|---|---|
| `extract_job_signals` | Convert raw job descriptions into structured signals | compute |
| `score_job` | Score jobs with deterministic rubric logic | compute |
| `retrieve_profile_evidence` | Retrieve RAG evidence from profile knowledge | compute |
| `generate_recommendation` | Generate resume focus points, outreach draft, and interview talking points | compute |
| `export_results` | Write local JSON and CSV outputs | local write |
| `apply_to_job` | Mock external job application | external action, human approval required |
| `send_message` | Mock outbound message | external action, human approval required |

## What Milestone 4 added

Milestone 4 added the first planner and approval demo:

| Component | File | Purpose |
|---|---|---|
| Planner | `src/agent/planner.ts` | Converts a user goal into a tool plan and executes validated steps |
| Planner CLI | `src/plannerDemo.ts` | Runs shortlist/apply planner demos with mock LLM support |
| Planner tests | `src/tests/runPlannerTests.ts` | Verifies shortlist output and approval-blocked apply behavior |
| Web UI | `exports/web/index.html` | Shows traces and supports simple approval actions |
| Web server | `web_server.js` | Serves exports, traces, and approval records |

The planner supports a mock LLM path for deterministic local runs. It asks the LLM for a JSON plan, validates that each tool exists in the registry, normalizes `jobIndex` into the job object expected by tools, and falls back to the deterministic workflow when the plan is not suitable.

## Safety and reliability model

The important engineering decision is:

```text
LLM proposes
 -> code validates
 -> tool registry executes
 -> approval policy blocks risky actions
 -> trace records what happened
```

This avoids giving the model unrestricted control. The LLM can generate or plan, but it cannot invent tools, bypass approval, or silently perform external actions.

## Validation model

The project treats LLM output as untrusted input:

1. The planner expects structured JSON.
2. The plan must be an array of tool steps.
3. Each tool name must exist in `toolRegistry`.
4. Per-job tools must include a usable job reference.
5. External actions still require human approval.
6. Invalid planner output falls back to the deterministic workflow instead of pretending to succeed.

This is different from simply telling the model "please return JSON" in a prompt. Prompting is a soft constraint; schema validation and registry checks are hard constraints.

## Approval model

High-risk actions are modeled as `external_action` and `human_required`:

```text
apply_to_job
send_message
submit_resume
contact_recruiter
```

The current demo blocks these actions unless an approval exists in `exports/approvals.json`. The web UI can record approvals, and the execution layer reads those approvals before allowing a human-approved external action.

## How to verify

```bash
npm run demo:planner:mock
npm run demo:planner:apply:mock
npm run test:planner
npm run web:serve
```

The most useful files to inspect are:

```text
exports/local-mvp-results.json
exports/tool-call-trace.json
exports/approvals.json
```

## Interview-ready explanation

> I started with a deterministic, auditable job-search workflow, then exposed each capability as a typed tool. The LLM planner can propose a sequence of tool calls, but the system validates the plan against the tool registry before executing anything. External actions such as applying to a job or sending a message are blocked by a human-in-the-loop approval policy, and every tool call is logged to a trace file for debugging and auditability.

Key points to emphasize:

- **Tool calling**: capabilities are registered tools, not arbitrary model text.
- **Planner**: the LLM plans which tool to call, but execution stays in code.
- **Schema validation**: raw LLM output is parsed and checked before use.
- **RAG**: recommendations are grounded in profile evidence rather than generic claims.
- **Human approval**: risky external actions require explicit user approval.
- **Traceability**: tool-call traces explain what happened and where errors occurred.

