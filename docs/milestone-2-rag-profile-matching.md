# Milestone 2 Recap: RAG-backed Profile Matching

Milestone 2 upgrades the demo from "compare a JD with one raw profile document" to "retrieve cited profile evidence for each JD, then generate recommendations grounded in that evidence."

```text
job + candidate profile + profile knowledge base
 -> structured job signals
 -> local profile evidence retrieval
 -> deterministic scoring
 -> recommendation with citations
 -> retrieval eval
```

## What changed

| Area | Implementation | Why it matters |
|---|---|---|
| Profile knowledge base | `data/profile_knowledge.json` | Turns sanitized resume/project/criteria notes into retrievable chunks |
| Retrieval tool | `src/rag/retrieveProfileEvidence.ts` | Finds relevant candidate evidence for each JD |
| Citation schema | `ProfileEvidenceCitation` | Connects recommendations to specific profile evidence IDs |
| Workflow integration | `runLocalMvp()` retrieves evidence before recommendation generation | RAG becomes a workflow node, not a hidden prompt trick |
| Retrieval eval | `npm run eval:rag` | Evaluates retrieval quality separately from generation quality |

## Why local keyword retrieval first

This milestone intentionally starts with deterministic keyword retrieval instead of embeddings. That gives a clear baseline:

- It runs locally without API keys.
- Every retrieved item has a visible score and matched terms.
- It makes retrieval failure easy to debug before adding vector embeddings.
- It creates an eval harness that can later compare keyword retrieval vs embedding retrieval.

The interview explanation is:

> I did not jump straight to embeddings. I first built a small retrieval abstraction and a deterministic baseline so I could inspect chunks, citations, top-k results, and recall. Then embedding retrieval can be added as a better retriever behind the same interface.

## Data shape

Each profile evidence chunk contains:

```json
{
  "id": "profile-ai-application-learning",
  "title": "AI application learning project",
  "category": "project",
  "content": "Candidate is building an AI job-search copilot...",
  "keywords": ["AI application", "LLM", "RAG", "Agent"],
  "citation": "docs/milestone-1-local-mvp-recap.md#concepts-practiced"
}
```

The important design choice is that recommendations cite stable evidence IDs instead of inventing claims.

The current demo knowledge base contains 28 public-safe evidence chunks based on the sanitized profile, resume details, and public website content. It covers platform product execution, Monitoring Hub, 400K+ MAU adoption, execution scalability, migration constraints, AI-assisted workflow/productivity, Copilot context, frontend/backend engineering background, data security, AI learning, and target role criteria.

## Retrieval eval

`data/rag_eval_set.json` defines human-expected evidence IDs for sample jobs. The current starter set covers 8 retrieval cases.

Run:

```bash
npm run eval:rag
```

Outputs:

```text
exports\rag-retrieval-evaluation.json
exports\rag-retrieval-evaluation.md
```

The first metric is `recall@k`: how many expected evidence chunks appear in the top-k retrieved results.

This is different from generation quality. A recommendation can sound good even when retrieval is wrong, so retrieval must be evaluated separately.

## How recommendations use RAG

`JobRecommendation` now includes:

```ts
evidenceCitations: ProfileEvidenceCitation[];
```

The local MVP export includes:

- retrieved evidence IDs
- relevance reasons
- recommendation citations
- resume focus points
- outreach message

## Current limitations

- Retrieval is lexical, not vector-based yet.
- Chunks are manually curated from sanitized/public-safe source material.
- Recall eval is still small and only covers sample jobs.
- Evidence quality still depends on sanitized profile/project notes.

These limitations are useful because they define the next polish path: add more chunks, add embedding retrieval, compare retrievers, and expand the eval set.

## Interview-ready answer

If asked what RAG means in this project:

> RAG means the recommendation is not generated only from the JD and a generic profile summary. For each job, the workflow retrieves specific candidate evidence chunks, such as engineering-product background, data workflow experience, or AI project learning. The recommendation then cites those evidence IDs, so the user can inspect why a resume point or outreach sentence was suggested.

If asked how retrieval quality is evaluated:

> I created a small gold set mapping sample jobs to expected profile evidence IDs. The eval script measures recall@k before generation. This separates retrieval quality from wording quality, which is important because a fluent LLM answer can hide bad retrieval.
