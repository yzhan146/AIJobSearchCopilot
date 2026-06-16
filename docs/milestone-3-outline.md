# Milestone 3 Outline: Function Calling, Tool Calling, and Agent Workflow

Milestone 3 will turn the current fixed workflow into a tool-oriented workflow that is easier to explain as an agent system.

## Goal

Build an explicit tool-calling layer around the current local MVP functions:

```text
extract job signals
score job
retrieve profile evidence
generate recommendation
export results
```

The goal is not to create an uncontrolled autonomous job-application bot. The goal is to understand how LLM apps expose typed tools, log tool calls, and keep human approval before external actions.

## Why this milestone matters

Milestone 1 proved the hybrid workflow:

```text
LLM extraction -> validation -> deterministic scoring -> recommendation
```

Milestone 2 added RAG:

```text
profile evidence retrieval -> citations -> retrieval eval
```

Milestone 3 adds the agent/tool layer:

```text
LLM / workflow planner
 -> typed tool calls
 -> tool results
 -> trace log
 -> human approval gate
```

Interview focus:

> Function Calling is not just "the model writes JSON." It is a contract between the model and the application: tools have typed inputs, validated outputs, side-effect boundaries, and approval rules.

## Proposed scope

### 1. Define tool schemas

Create tool wrappers for the current functions:

| Tool | Existing implementation | Purpose |
|---|---|---|
| `extract_job_signals` | `extractJobSignalsWithLlm()` | Parse messy JD into validated `JobSignals` |
| `score_job` | `scoreJob()` | Deterministically score fit |
| `retrieve_profile_evidence` | `retrieveProfileEvidence()` | Retrieve top-k RAG evidence |
| `generate_recommendation` | `generateRecommendationsWithLlm()` | Generate advice with citations |
| `export_results` | `exportResults()` | Write JSON/CSV outputs |

### 2. Add a tool registry

Create a small local registry:

```text
tool name
description
input schema
output schema
implementation
side-effect level
```

This lets the project explain tools as first-class capabilities rather than hidden function calls.

### 3. Add tool-call trace logs

Every workflow run should produce a trace like:

```json
{
  "tool": "retrieve_profile_evidence",
  "inputSummary": "AI Product Manager at Apple",
  "outputSummary": "3 evidence chunks retrieved",
  "durationMs": 12,
  "success": true
}
```

This is important for debugging and interviews.

### 4. Add human approval boundaries

For this project, external actions should stay behind approval:

```text
safe:
  read sample jobs
  score jobs
  retrieve evidence
  generate draft messages
  export local files

requires approval:
  send message
  submit resume
  apply to job
  contact recruiter
  upload private data
```

Milestone 3 should implement the boundary concept, not actual auto-apply behavior.

### 5. Add a local agent-style runner

Add a runner that can execute a planned sequence:

```text
plan:
  1. read jobs
  2. extract signals
  3. retrieve evidence
  4. score
  5. generate recommendation
  6. export
```

This can still be deterministic at first. The learning goal is to make the tool orchestration explicit.

## Out of scope for Milestone 3

Do not build these yet:

```text
auto-apply
browser automation
real recruiter messaging
resume upload
production web UI
multi-user auth
embedding/vector database
ingestion pipeline
```

Those can come later if product value is clear.

## Acceptance criteria

Milestone 3 is complete when:

1. Core workflow functions are exposed through typed tool wrappers.
2. A local tool registry exists.
3. Tool calls are logged in a trace file.
4. The workflow still produces the same job analysis outputs.
5. The code clearly separates safe local actions from approval-required external actions.
6. Documentation explains Function Calling, Tool Calling, and Agent Workflow in interview-ready language.

## Interview answers to prepare

### What is Function Calling?

> Function Calling is a pattern where the model selects a tool and provides structured arguments, but application code validates the arguments, executes the tool, and returns the result. The model does not directly perform side effects.

### What is the difference between a workflow and an agent?

> A workflow follows a fixed path. An agent can decide which tool to call next based on goal, state, and observations. For reliability, I started with a fixed workflow and only add agentic behavior where tool choice or next-step decision actually matters.

### Why do we need tool logs?

> Tool logs make the system debuggable. If output is wrong, I can inspect whether extraction, scoring, retrieval, recommendation, or export failed.

### Why keep human approval?

> Job application actions affect user reputation and privacy. Drafting advice is safe; submitting resumes or messaging recruiters should require explicit human approval.

## Recommended implementation order

1. Create tool types and registry.
2. Wrap existing functions as tools.
3. Add trace logging.
4. Add a local tool-runner workflow.
5. Update docs with learning recap.
6. Validate with `npm run check`, `npm run demo:llm:mock`, and `npm run eval:rag`.
