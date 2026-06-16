# Non-coder Code Walkthrough

You do not need to understand every TypeScript line in this project. But you should understand the workflow, the important files, and where to look when something goes wrong.

## One-sentence project explanation

AI Job Search Copilot takes a job description, extracts structured job signals, scores fit with deterministic rules, retrieves relevant profile evidence with RAG, generates recommendations, and exports results for human review.

## The main workflow

Remember this path:

```text
JD
 -> extractJobSignalsWithLlm()
 -> scoreJob()
 -> retrieveProfileEvidence()
 -> generateRecommendationsWithLlm()
 -> exportResults()
```

Plain English:

```text
Job description comes in
 -> extract role signals
 -> score whether it fits
 -> retrieve the most relevant evidence from your profile/project knowledge base
 -> generate resume focus points and outreach message
 -> export JSON/CSV for review
```

## Key files and what they do

| File | What it does | What you should know |
|---|---|---|
| `src\index.ts` | CLI entry point | Reads command-line arguments and starts the workflow |
| `src\workflow\runLocalMvp.ts` | Main workflow | Wires extraction, scoring, RAG retrieval, recommendation, and export |
| `src\schemas.ts` | Core data contracts | Defines what a job, signals, score, evidence, and recommendation look like |
| `src\tools\extractJobSignalsWithLlm.ts` | JD extraction | Uses LLM when enabled, otherwise falls back to deterministic extraction |
| `src\tools\scoreJob.ts` | Deterministic scoring | Code-owned business logic; the LLM does not decide the final score |
| `src\rag\retrieveProfileEvidence.ts` | RAG retrieval | Finds the top-k profile evidence chunks for the current JD |
| `src\tools\generateRecommendationsWithLlm.ts` | Recommendation generation | Uses JD signals, score, and retrieved evidence to generate advice |
| `src\tools\exportResults.ts` | Export | Writes local JSON/CSV outputs |
| `data\profile_knowledge.json` | RAG knowledge base | Stores sanitized profile/project/role evidence chunks |
| `data\rag_eval_set.json` | RAG eval set | Defines expected evidence IDs for retrieval evaluation |

## What LLM does vs what code does

| Responsibility | Owner | Why |
|---|---|---|
| Understand messy JD text | LLM or deterministic baseline | LLM is good at language understanding |
| Validate output shape | TypeScript code | Never trust raw model output blindly |
| Final score | Deterministic code | Scoring should be auditable and tunable |
| Retrieve profile evidence | RAG retriever code | Keeps evidence selection inspectable |
| Write outreach/recommendation text | LLM or template baseline | LLM is good at natural language |
| Export results | Code | Side effects should be predictable |

## RAG in this project

Your RAG knowledge base is:

```text
data\profile_knowledge.json
```

It contains profile evidence chunks such as:

```text
engineering + product background
data workflow / monitoring / scheduling experience
AI Job Search Copilot project
English communication strength
target role criteria
```

For each JD, the retriever asks:

```text
Which of my profile evidence chunks best support this job?
```

Then it returns top-k evidence chunks, currently top 3.

## How to inspect one run

Run:

```bash
npm run demo:llm:mock
```

Open:

```text
exports\local-mvp-results.json
```

For each job, inspect:

```text
signals
score
retrievedEvidence
recommendation.evidenceCitations
```

Read it like this:

1. `signals`: What did the system understand from the JD?
2. `score`: Why did this role get this match score?
3. `retrievedEvidence`: Which of your experiences did RAG retrieve?
4. `evidenceCitations`: Which evidence was used in the recommendation?

## How to inspect RAG quality

Run:

```bash
npm run eval:rag
```

Open:

```text
exports\rag-retrieval-evaluation.md
```

Focus on:

```text
expected evidence
retrieved evidence
hitCount
recall@3
missed evidence
```

Plain English:

```text
Did the retriever find the evidence we expected it to find?
```

## Where to look when output is wrong

| Symptom | First place to check |
|---|---|
| JD fields look wrong | `signals` in `exports\local-mvp-results.json` |
| Score feels wrong | `src\tools\scoreJob.ts` and `src\config\rubric.ts` |
| Wrong profile evidence retrieved | `data\profile_knowledge.json` and `src\rag\retrieveProfileEvidence.ts` |
| Recommendation sounds generic | `retrievedEvidence` and `src\tools\generateRecommendationsWithLlm.ts` |
| RAG eval is low | `data\rag_eval_set.json`, chunk keywords, and top-k setting |

## Interview-safe way to explain AI-written code

Use this:

> I used AI to help implement the code, but I own the architecture and evaluation logic. The workflow is intentionally split into clear steps: JD extraction, schema validation, deterministic scoring, RAG evidence retrieval, recommendation generation, and export. I do not need to claim I wrote every line manually; I need to explain why each module exists, how data flows through the system, and how I validate whether the output is correct.

Avoid saying:

```text
AI wrote it so I do not need to understand it.
```

Say instead:

```text
AI accelerated implementation, but I understand the workflow, design tradeoffs, and failure modes.
```

## Minimum things you should be able to explain

1. Why scoring is deterministic instead of fully LLM-based.
2. Why RAG retrieves profile evidence before recommendation generation.
3. What top-k means.
4. What hitCount and recall@3 mean in RAG eval.
5. Why citations reduce hallucination risk.
6. Why real sensitive data should not be sent to external LLM providers.
7. What you would improve next: with-RAG vs without-RAG comparison, embedding retrieval, ingestion pipeline.
