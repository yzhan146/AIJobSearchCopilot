# Milestone 5 Recap: Agent Hardening

Milestone 5 turns the planner prototype into a more reliable agent workflow. The focus is not adding more demo features; it is reducing failure modes around malformed LLM output, unsafe tool execution, and approval handling.

## What changed

| Area | Implementation | Why it matters |
|---|---|---|
| Per-tool planner validation | `src/agent/plannerValidation.ts` | Rejects malformed plans before execution |
| One-shot repair attempt | `src/agent/planner.ts` | Gives the LLM one bounded chance to fix invalid JSON plans |
| Safe fallback | `src/agent/planner.ts` | Falls back to deterministic workflow when planner output remains invalid |
| Planner execution state | `src/agent/planner.ts` | Carries signals, score, and RAG evidence between planned tool steps |
| Approval action IDs | `src/agent/approvalPolicy.ts` | Approves a specific pending action instead of loosely approving a tool name |
| Pending approvals | `exports/pending-approvals.json` | Records blocked external actions for review |
| Approved external mock actions | `src/agent/toolRegistry.ts` | Approved `apply_to_job` and `send_message` return queued mock results |
| Web approval update | `web_server.js`, `web/index.html` | Approval UI/server now use action IDs |
| Hardening tests | `src/tests/runPlannerTests.ts` | Covers invalid fallback, repair, blocked approval, and approved execution |

## Validation flow

The planner treats LLM output as untrusted input:

```text
LLM plan
 -> parse/receive JSON
 -> validate plan shape
 -> validate tool names against registry
 -> validate per-tool args
 -> reject out-of-range jobIndex
 -> cap maxSteps
 -> execute only if valid
```

If the first plan is invalid, the system makes one repair request:

```text
invalid plan
 -> send validation errors back to LLM
 -> receive corrected plan
 -> validate again
 -> execute or fall back
```

This keeps reliability bounded. The system does not retry indefinitely, because retries add token cost and latency.

## Approval flow

High-risk actions now produce action-specific approvals:

```text
planner requests apply_to_job
 -> approval policy computes actionId
 -> pending action is written to exports/pending-approvals.json
 -> trace records failed external action with actionId
 -> user approves actionId through web UI or approvals.json
 -> rerun can execute approved mock action
```

This is safer than approving a tool globally. The user approves a specific action with a specific input summary.

## How to verify

```bash
npm run test:planner
npm run web:serve
```

Open the local demo console:

```text
http://localhost:8080/
```

Recommended manual test:

1. Click **Reset demo state**.
2. Click **Run apply demo**. The trace should show `apply_to_job` blocked, and a pending approval should appear.
3. Click **Approve pending action**.
4. Click **Run apply demo** again. The approved `apply_to_job` action should now succeed as a queued mock result.

The test covers:

1. Shortlist still returns all job analyses.
2. Invalid planner output falls back to deterministic workflow.
3. One invalid plan can be repaired once and then executed.
4. `apply_to_job` is blocked without approval and records an action ID.
5. The same `apply_to_job` action executes as a queued mock action after approval.

## Interview-ready explanation

> I hardened the agent by treating LLM planner output as untrusted input. The planner now validates tool names, tool arguments, job indexes, and max step limits before execution. If validation fails, it allows one repair attempt and then falls back safely. External actions are approved by action ID, so approval applies to one concrete pending action rather than granting broad permission to a tool.

Important terms to explain:

- **Schema validation**: deterministic checks on LLM output structure and fields.
- **Repair attempt**: one bounded retry that gives the model validation errors.
- **Fail closed**: unsafe actions remain blocked unless explicitly approved.
- **Action ID**: stable identifier for a specific pending external action.
- **Execution state**: planner memory for intermediate tool outputs such as signals, score, and RAG evidence.

## Engineering takeaway

The final architecture is:

```text
deterministic workflow baseline
 -> typed tool registry
 -> LLM planner
 -> schema validation and one-shot repair
 -> human approval for external actions
 -> trace and pending approval files
```

The LLM helps plan and generate, but production-sensitive control stays in deterministic code.
