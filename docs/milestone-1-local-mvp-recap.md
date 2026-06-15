# Milestone 1 Recap: Local Hybrid MVP

Milestone 1 builds a local, inspectable MVP for job-role matching. The chosen product workflow is **hybrid**, not one-shot judgment:

```text
job + candidate profile
 -> LLM structured extraction
 -> TypeScript schema validation
 -> deterministic scoring
 -> LLM recommendation generation
 -> export for human review
```

## Why hybrid won

The prompt experiment compares three patterns:

| Pattern | Role | Decision |
|---|---|---|
| One-shot judgment | Ask the model to score the job directly | Keep as an experiment baseline only |
| Structured extraction | Ask the model to return `JobSignals` | Use as the AI understanding step |
| Hybrid workflow | Extract signals, validate schema, score with code, generate advice | Use as the main product workflow |

The hybrid workflow is preferred because it separates responsibilities:

- LLM handles messy text understanding and natural-language recommendation.
- TypeScript schema validation catches malformed or hallucinated output.
- Deterministic scoring keeps business judgment explainable and tunable.
- Gold judgments evaluate whether model/workflow output matches human judgment.

## DAG nodes and schemas

| DAG node | Input | Output | Why it matters |
|---|---|---|---|
| `ReadJobs` | `jobsPath: string` | `RawJob[]` | Loads job data from local JSON |
| `ReadProfile` | `profilePath: string` | raw profile text | Loads candidate context |
| `ParseProfile` | raw profile text + `ScoringRubric` | `CandidateProfile` | Converts profile into target signals, skills, and language strengths |
| `ExtractSignals` | `RawJob + CandidateProfile + ScoringRubric` | `JobSignals` | LLM-friendly structured extraction boundary |
| `ScoreJob` | `JobSignals + ScoringRubric` | `ScoreResult` | Code-owned business scoring |
| `GenerateRecommendation` | `RawJob + CandidateProfile + JobSignals + ScoreResult` | `JobRecommendation` | Natural-language output for resume focus and outreach |
| `ExportResults` | `JobAnalysis[] + outputDir` | output file paths | Side-effect boundary for generated files |

## Concepts practiced

| Concept | How it appears in this milestone | Interview explanation |
|---|---|---|
| Schema | `RawJob`, `CandidateProfile`, `JobSignals`, `ScoreResult` | Schemas are contracts between model output, tools, and workflow nodes |
| LLM structured output | `extractJobSignalsWithLlm()` | The model extracts fields, but the app validates before trusting them |
| Deterministic scoring | `scoreJob()` | The final score is auditable and tunable instead of hidden in a prompt |
| Prompt experiment | `npm run experiment:prompt:groq` | Compare one-shot, structured extraction, and hybrid workflow |
| Gold set evaluation | `data/gold_judgments.json` | Human judgment defines what "correct" means for evaluation |
| Provider abstraction | `createLlmClient()` | The app can switch between mock, Groq, Gemini, and OpenAI-like providers |
| Rate limits | Sequential experiment execution with retry | Real model APIs require quota/rate-limit handling |

## How to run

Use mock mode when you want deterministic local behavior:

```bash
npm run demo:llm:mock
npm run experiment:prompt
```

Use Groq for real model output:

```bash
npm run demo:llm:groq
npm run experiment:prompt:groq
```

The most useful output for learning is:

```text
exports\prompt-experiment-summary-groq.md
```

It shows:

- human gold judgment
- one-shot vs gold
- hybrid vs gold
- structured extraction fields
- learning points per job

## Interview-ready answer

If asked why the project uses a hybrid architecture:

> I compared one-shot prompting with a hybrid workflow using a small gold set. One-shot is fast but mixes extraction, judgment, and explanation into one opaque answer. I chose hybrid because the LLM extracts structured job signals, TypeScript validates the output, deterministic code owns the score, and the LLM only writes the final recommendation. This makes the system easier to debug, evaluate, and tune.

If asked how eval works:

> I do not label every production sample. I create a representative gold set, including normal and edge cases, then compare workflow output against human expected labels. When output mismatches gold, I can inspect whether the issue came from extraction, schema, scoring rubric, or the gold label itself.

## Remaining polish before Milestone 2

- Expand `data/gold_judgments.json` beyond four sample jobs.
- Add more realistic sample JDs.
- Optionally export `.xlsx`; current MVP exports JSON and CSV.
- Keep one-shot as a baseline, but keep hybrid as the main product workflow.
