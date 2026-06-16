# Milestone 2 Learning Guide: What You Should Understand About RAG

This guide explains what you should do next, what you learned in Milestone 2, and what RAG interview questions you should be ready to answer.

If you want the Chinese beginner version first, read:

```text
docs\rag-chinese-primer.md
```

## What you should do now

Run:

```bash
npm run demo:llm:mock
npm run eval:rag
```

Then inspect:

```text
exports\local-mvp-results.json
exports\rag-retrieval-evaluation.md
```

Focus on these fields:

```text
retrievedEvidence
recommendation.evidenceCitations
recall@3
```

When reading `local-mvp-results.json`, ask:

1. Which evidence chunks were retrieved for this job?
2. Do the retrieved chunks actually support the recommendation?
3. Did the recommendation cite evidence IDs instead of making unsupported claims?

When reading `rag-retrieval-evaluation.md`, ask:

1. What evidence did the gold set expect?
2. What did the retriever actually return?
3. Which expected chunks were missed?
4. Is the miss caused by bad chunk text, weak keywords, a vague JD, or the retriever scoring logic?

## What you learned

Milestone 1 was:

```text
LLM structured extraction
 -> schema validation
 -> deterministic scoring
 -> LLM recommendation
```

Milestone 2 adds RAG:

```text
profile / project notes / role criteria
 -> evidence chunks
 -> retrieval for each JD
 -> recommendation grounded in retrieved evidence
 -> citations
 -> retrieval evaluation
```

The important idea is:

> RAG is not "put the whole resume into a long prompt." RAG means retrieving the most relevant external knowledge first, then generating an answer grounded in that retrieved knowledge.

## How this project implements RAG

| RAG concept | Project file | Meaning |
|---|---|---|
| Knowledge base | `data\profile_knowledge.json` | Sanitized candidate evidence chunks |
| Chunk | One object in `profile_knowledge.json` | A small retrievable piece of resume/project/criteria context |
| Retriever | `src\rag\retrieveProfileEvidence.ts` | Selects top evidence chunks for a JD |
| Citation | `evidenceCitations` | Shows which evidence supports a recommendation |
| Retrieval eval | `data\rag_eval_set.json` + `npm run eval:rag` | Checks whether retrieval found the expected evidence |
| Metric | `recall@3` | Whether expected evidence appears in top 3 retrieved chunks |

## What RAG interviewers may ask

### 1. What is RAG?

Answer:

> RAG means Retrieval-Augmented Generation. The system first retrieves relevant knowledge from an external knowledge base, then gives that evidence to the LLM so the answer is grounded and traceable.

In this project:

> The external knowledge base is sanitized candidate profile/project evidence. For each JD, I retrieve relevant candidate evidence before generating resume focus points and outreach suggestions.

### 2. Why not put the whole profile into the prompt?

Answer:

> A long prompt is expensive, noisy, and hard to debug. RAG lets the system retrieve only the most relevant evidence. It also makes the output auditable because each suggestion can cite the evidence chunk it came from.

### 3. What is chunking?

Answer:

> Chunking means splitting source documents into smaller retrievable pieces. Good chunks should be small enough to avoid noise but large enough to preserve meaning.

In this project:

> Each chunk is a candidate evidence item such as engineering-product background, data workflow experience, AI project learning, or English collaboration strength.

### 4. What is embedding retrieval?

Answer:

> Embeddings convert text into vectors, then retrieval uses vector similarity to find semantically related chunks. This helps when exact keywords differ but meaning is similar.

Important distinction:

> This project currently uses local keyword retrieval as a baseline. That is intentional: it is easier to inspect and evaluate. A later version can add embedding retrieval behind the same retrieval interface and compare quality.

### 5. What is top-k?

Answer:

> Top-k means taking the k most relevant retrieved chunks. For example, recall@3 checks whether the expected evidence appears in the top 3 results.

In this project:

> `npm run eval:rag` reports average recall@3 on the starter RAG eval set.

### 6. How do you evaluate RAG?

Answer:

> Evaluate retrieval separately from generation. Retrieval quality asks whether the system found the right evidence. Generation quality asks whether the LLM used that evidence correctly and wrote a useful answer.

In this project:

> `data\rag_eval_set.json` maps sample jobs to expected evidence IDs. The eval script measures recall@3 before judging the generated recommendation.

### 7. What can go wrong in RAG?

Common failures:

- Bad chunks: the useful information is split poorly or missing.
- Bad metadata: keywords do not represent the chunk.
- Bad query: the JD is vague or the extracted signals are weak.
- Bad retriever: irrelevant chunks rank higher.
- Bad generation: the LLM ignores retrieved evidence.
- Hallucinated citations: the LLM cites evidence that was not retrieved.

In this project, we reduce risk by:

- keeping evidence IDs stable,
- passing retrieved evidence explicitly,
- requiring citations in `JobRecommendation`,
- evaluating retrieval with `recall@3`.

## Interview-ready project explanation

Use this version:

> In Milestone 2, I added RAG-backed profile matching to my AI Job Search Copilot. Instead of sending the whole candidate profile to the model, I created a small profile knowledge base with sanitized resume, project, and target-role evidence chunks. For each job, the workflow extracts job signals, retrieves the most relevant candidate evidence, and generates recommendations with citation IDs. I also built a retrieval eval set and measure recall@3, so I can evaluate whether retrieval found the right evidence before judging the LLM's final wording.

Short version:

> RAG helped me make recommendations grounded and auditable. The key lesson is that retrieval quality must be evaluated separately from generation quality.

## What to polish next

1. Add more real sanitized profile/project chunks.
2. Add embedding retrieval.
3. Compare keyword retrieval vs embedding retrieval.
4. Expand the RAG eval set.
5. Add a "with RAG vs without RAG" recommendation comparison.
