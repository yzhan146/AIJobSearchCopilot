# Milestone 4 Recap: LLM Planner, Approval Gate, Web UI, Tests

Milestone 4 is complete as a local prototype. It extends the Milestone 3 tool registry with a planner layer, approval-gated external actions, a small web UI, and planner tests.

## Completed scope

| Area | Implementation | Result |
|---|---|---|
| LLM planner prototype | `src/agent/planner.ts` | Converts goals like `shortlist`, `explain`, and `apply` into tool plans |
| Planner CLI | `src/plannerDemo.ts` | Runs planner demos with deterministic mock LLM support |
| Approval gate | `src/agent/approvalPolicy.ts` and external-action tools | Blocks `apply_to_job` and `send_message` unless approved |
| Trace output | `src/agent/trace.ts` | Writes tool execution entries to `exports/tool-call-trace.json` |
| Web UI | `web/index.html` and `web_server.js` | Lets the user inspect traces and record approvals |
| Tests | `src/tests/runPlannerTests.ts` | Verifies shortlist behavior and approval-blocked apply behavior |

## Planner behavior

The planner follows this model:

```text
user goal
 -> LLM/mock LLM proposes JSON plan
 -> validate plan against registered tools
 -> normalize planner args such as jobIndex
 -> execute through executeRegisteredTool()
 -> write trace entries
```

If the LLM plan is not executable, the code does not blindly continue. It falls back to the deterministic workflow for safe analysis goals, and external actions still require human approval.

## Approval behavior

External actions are intentionally separated from local analysis:

| Tool | Why approval is required |
|---|---|
| `apply_to_job` | Submitting an application is an irreversible action tied to identity and reputation |
| `send_message` | Outbound communication affects reputation and should be reviewed |

The demo records approvals in:

```text
exports/approvals.json
```

The execution layer checks this file before allowing a human-approved external action to proceed.

## How to run

```bash
npm run demo:planner:mock
npm run demo:planner:apply:mock
npm run test:planner
npm run web:serve
```

## Interview talking points

> Milestone 4 adds an LLM planner on top of the tool registry. The model can propose a plan, but the application validates the plan, executes only registered tools, blocks risky external actions behind approval, and logs every step for observability.

Important engineering points:

- Planner output is treated as untrusted input.
- Tool names are validated against a whitelist.
- External side effects fail closed without approval.
- Mock LLM tests keep local validation deterministic.
- Trace files make agent behavior explainable and debuggable.

## Next milestone direction

Milestone 5 should focus on hardening rather than more demo surface:

1. Stronger per-tool argument schema validation.
2. One retry or repair path for malformed LLM planner output.
3. A fuller approval queue that can resume approved pending actions.
4. Real provider testing with OpenAI/Gemini/Groq while keeping mock tests in CI.
5. Push the repository to GitHub for interview visibility and cross-device use.
