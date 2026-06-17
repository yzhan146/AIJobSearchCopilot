# AI Job Search Copilot

An agentic workflow demo for matching AI product roles with an engineering-product candidate profile.

## Goal

This project turns an ambiguous job-search process into a repeatable AI-powered workflow:

1. Parse job descriptions into structured signals.
2. Compare roles against a target profile and scoring rubric.
3. Identify compensation, location, AI-application fit, and workload risk.
4. Generate resume focus points and recruiter outreach messages.
5. Export shortlists for human review before applying.

## Why this project

The demo is designed to explore practical AI application patterns:

- LLM structured extraction
- Prompt experiments
- RAG over resume and project context
- Function calling / tool calling
- Agent workflow orchestration
- Human-in-the-loop approval

## Status

Milestones 1-5 are implemented as a local TypeScript AI workflow and agent prototype. The main product workflow is now **hybrid**: LLM structured extraction, schema validation, deterministic scoring, RAG-backed profile evidence, LLM recommendation generation, tool-call tracing, and human approval boundaries for external actions.

Milestone 3 introduced the explicit tool registry and traceable tool execution. Milestone 4 added an LLM planner prototype, approval-gated external action demos, planner tests, and a minimal web UI for reviewing traces and approvals. Milestone 5 hardens the agent with per-tool planner validation, one-shot plan repair, action-specific approval IDs, pending approval records, and broader planner tests.

See the Milestone 1 recap:

```text
docs/milestone-1-local-mvp-recap.md
```

See the learning docs:

```text
docs/milestone-2-rag-profile-matching.md
docs/milestone-2-final-recap.md
docs/milestone-2-learning-guide.md
docs/rag-chinese-primer.md
docs/rag-interview-question-bank.md
docs/non-coder-code-walkthrough.md
docs/milestone-3-outline.md
docs/milestone-3-tool-calling-recap.md
docs/milestone-4-plan.md
docs/milestone-3-4-agent-recap.md
docs/milestone-5-agent-hardening.md
docs/ui-improvement-prd.md
```

## Quick start

```bash
npm install
npm run demo
```

Run the same workflow through the LLM-enabled path without an API key:

```bash
npm run demo:llm:mock
```

Run the prompt experiment:

```bash
npm run experiment:prompt
```

Run the RAG retrieval evaluation:

```bash
npm run eval:rag
```

Run the planner prototype with a deterministic mock LLM:

```bash
npm run demo:planner:mock
npm run demo:planner:apply:mock
npm run test:planner
```

View the local trace and approval demo UI:

```bash
npm run web:serve
```

Then open:

```text
http://localhost:8080/
```

The demo console can run the mock planner locally, reset demo files, show trace entries, list pending approvals, approve a specific `actionId`, and rerun the apply demo to verify that the approved action executes as a queued mock result.

The main UI now follows `docs/ui-improvement-prd.md`: users provide only resume text/file, personal website, or GitHub as background sources, submit 1-10 JDs, then receive a success-probability ranking, ranking reasons, and per-JD resume improvement suggestions. Agent trace and approval demos remain available as a secondary section.

The local UI analysis endpoint uses deterministic keyword/rubric logic so it works without a user-provided API key. A production deployment should keep model calls server-side and use LLMs for structured profile/JD extraction and high-quality resume rewriting, while retaining deterministic ranking validation and safety checks.

Run with OpenAI:

```bash
copy .env.example .env.local
```

Fill in `OPENAI_API_KEY`, then set:

```text
LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
```

Then run:

```bash
npm run demo
```

Run with Gemini:

```bash
copy .env.example .env.local
```

Fill in `GEMINI_API_KEY`, then set:

```text
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.0-flash-lite
```

Then run:

```bash
npm run demo:llm:gemini
npm run experiment:prompt:gemini
```

Run with Groq:

```text
LLM_PROVIDER=groq
GROQ_MODEL=llama-3.1-8b-instant
GROQ_API_KEY=your-key
```

Then run:

```bash
npm run demo:llm:groq
npm run experiment:prompt:groq
```

The demo reads:

- `data/sample_jobs.json`
- `data/sample_profile.md`
- `data/profile_knowledge.json` for RAG-backed profile evidence
- `data/gold_judgments.json` for prompt experiment evaluation
- `data/rag_eval_set.json` for retrieval evaluation

`data/sample_jobs.json` currently uses a sanitized conversion of the Beijing AI product jobs top-20 spreadsheet, with fields normalized into the local `RawJob` schema.

It writes local generated files to `exports/`:

- `local-mvp-results.json`
- `local-mvp-results.csv`
- `tool-call-trace.json`
- `approvals.json` when using the approval UI
- `pending-approvals.json` when external actions are blocked
- `rag-retrieval-evaluation.json`
- `rag-retrieval-evaluation.md`

## Local MVP workflow

```text
sample jobs + candidate profile
 -> tool: extract_job_signals
 -> tool: score_job
 -> tool: retrieve_profile_evidence
 -> tool: generate_recommendation
 -> tool: export_results
 -> tool-call-trace.json
```

This workflow intentionally separates deterministic code from LLM/tool-facing boundaries:

| Concept | Current implementation | Interview point |
|---|---|---|
| LLM structured extraction | `extractJobSignalsWithLlm()` can call an LLM, but validates output into `JobSignals` | Do not trust raw model text; force structured JSON and validate it |
| Deterministic scoring | `scoreJob()` remains code-owned | LLMs can extract/explain, but business scoring should be auditable |
| Prompt experiments | Prompt builders live under `src/llm/prompts/` | Compare prompt strategies against the deterministic baseline |
| Gold set evaluation | `data/gold_judgments.json` defines human expected labels | Do not judge prompt quality without a target answer |
| RAG | `retrieveProfileEvidence()` retrieves cited chunks from `data/profile_knowledge.json` | Keep retrieval inspectable and evaluate recall before improving embeddings |
| Function calling | Core capabilities are exposed through `src/agent/toolRegistry.ts` | Tools have typed inputs, schemas, output summaries, and side-effect metadata |
| Agent workflow | `runLocalMvp()` executes a fixed plan; `runPlannerGoal()` can execute an LLM-generated plan | Start reliable and auditable, then add dynamic planning under validation |
| Planner validation | `src/agent/plannerValidation.ts` validates LLM plans before execution | Treat LLM output as untrusted input; validate and repair once before falling back |
| Human approval | External actions are listed in `src/agent/approvalPolicy.ts` and approved by action ID through `exports/approvals.json` | Applying, messaging, or resume upload should require explicit user approval |

## Learning checkpoint: Milestone 1.1

This step is interview-relevant because it shows a practical LLM application pattern:

```text
LLM extracts or writes
 -> TypeScript validates
 -> deterministic code scores
 -> workflow exports auditable results
```

If asked why the project does not simply ask the model "is this job good?", the answer is:

> I separated model judgment from business judgment. The LLM is useful for turning messy JD text into structured signals and for writing human-facing recommendations, but the final score is deterministic so it can be tested, explained, and tuned.

## Prompt experiment

`npm run experiment:prompt` compares three patterns on the same sample jobs:

| Pattern | What it does | What to watch |
|---|---|---|
| One-shot judgment | Asks the model to score the job directly | Fast, but subjective and harder to audit |
| Structured extraction | Asks the model to return `JobSignals` only | Easier to validate and debug |
| Hybrid workflow | Uses structured signals plus deterministic scoring | More reliable for product decisions |

Interview takeaway:

> I ran prompt experiments instead of guessing which prompt was better. The experiment showed why a one-shot prompt is attractive for speed but weaker for reliability. The hybrid approach makes each step auditable: extraction is structured, scoring is deterministic, and recommendation text can still use LLM generation.

The experiment also compares model outputs with a small human-labeled gold set:

```text
data/gold_judgments.json
```

This file is intentionally editable. Update it when your human judgment changes, then rerun the experiment to see whether one-shot or hybrid output better matches your target decisions.

## RAG-backed profile matching

Milestone 2 adds a local profile knowledge base:

```text
data/profile_knowledge.json
```

Each chunk has an evidence ID, title, category, content, keywords, and citation. The current sample knowledge base contains 28 public-safe evidence chunks based on the sanitized profile, resume details, and public website content. The workflow retrieves the top profile evidence for each job, then passes it into recommendation generation. `JobRecommendation` now includes `evidenceCitations`, so resume focus points and interview talking points are grounded in inspectable evidence instead of generic claims.

Run retrieval eval separately from prompt/generation eval:

```bash
npm run eval:rag
```

Interview takeaway:

> I evaluate retrieval before generation. The RAG step retrieves candidate evidence with citations, and `data/rag_eval_set.json` checks whether the expected evidence appears in the top-k results. This prevents a fluent recommendation from hiding poor retrieval quality.

## Safety

Do not commit API keys, resumes with private contact details, or real application credentials. Use `.env.local` for secrets and sanitized sample data for demos.
