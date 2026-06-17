# Milestone 4 Plan: LLM Planner, Approval Gate, Web UI, Tests

Goals
- Demonstrate an LLM planner that chooses tools (heuristic prototype now, LLM-based later).
- Show human approval interception for external actions.
- Provide a minimal web UI for demo and tests/docs for verification.

Completed (prototypes)
- m4-llm-planner: src/agent/planner.ts (heuristic planner). CLI: src/plannerDemo.ts, script: npm run demo:planner:mock
- m4-approval-gate: mock tools apply_to_job and send_message that require human approval; planner apply demo: npm run demo:planner:apply:mock

Next (recommended)
1. m4-tests-docs (now implemented): src/tests/runPlannerTests.ts — run with `npm run test:planner` (builds and runs tests uses mock LLM). Verifies shortlist and apply behaviors and writes trace.
2. m4-web-ui: minimal SPA that reads exports/tool-call-trace.json and shows entries; add an Approval button to simulate approving queued external actions.
3. polish: add CI test, commit/push checkpoint, update README with demo instructions and interview talking points.

How to run
- Shortlist demo (mock): npm run demo:planner:mock
- Apply demo (mock, should be blocked): npm run demo:planner:apply:mock
- Tests: npm run test:planner

Interview talking points
- Start with deterministic, auditable workflow; expose tools; add planner later.
- Show approval gate reduces risk for external actions.
- Trace logs make debugging and accountability straightforward.
