# RAG Interview Question Bank for AI Product Roles

This note summarizes common RAG interview topics found across public interview-prep materials and adapts them to an AI product / agent product interview context.

## What is enough for a product role

As an AI product candidate, you do not need to implement vector search from scratch. But you should be able to reason about:

| Level | Must understand |
|---|---|
| Product basics | When RAG is needed and when it is overkill |
| Workflow | Query -> retrieval -> top-k evidence -> generation -> citation |
| Quality | How to tell whether failure came from retrieval, ranking, or generation |
| Metrics | recall@k, precision@k, latency, cost, hallucination rate, user satisfaction |
| Safety | ACL, user isolation, sensitive data, audit logs |
| Roadmap | How to improve from keyword baseline to embedding, reranking, and ingestion pipeline |

## 1. Basic concept questions

| Question | Product-level answer |
|---|---|
| What is RAG? | Retrieval-Augmented Generation: retrieve relevant external knowledge first, then generate an answer grounded in that knowledge. |
| Why use RAG instead of only an LLM? | LLMs do not know private, fresh, or domain-specific data. RAG connects external knowledge and supports citations. |
| When is RAG unnecessary? | When data is small, static, and can fit directly in prompt/context. |
| RAG vs long prompt? | Long prompt sends everything; RAG selects relevant chunks, reducing noise/cost and improving traceability. |
| RAG vs fine-tuning? | RAG is better for dynamic facts and private knowledge; fine-tuning is better for style, format, or repeated behavior patterns. |

## 2. Architecture questions

| Question | What interviewers test |
|---|---|
| Describe a typical RAG pipeline. | Whether you know ingestion, chunking, indexing, retrieval, reranking, generation, citation, evaluation. |
| What is chunking and why does it matter? | Whether you understand chunk size trade-offs: too large = noise, too small = lost context. |
| What is embedding? | Whether you know text is converted into vectors for semantic similarity search. |
| What is a vector database? | Whether you understand scalable vector similarity search and metadata filtering. |
| What is hybrid search? | Combining keyword/sparse search with embedding/dense search to improve recall and precision. |
| What is reranking? | First retrieve many candidates, then use a stronger model to reorder and select final top-k. |

## 3. Retrieval and ranking questions

| Question | Strong answer direction |
|---|---|
| How do you choose top-k? | Tune with eval. Small k can miss evidence; large k adds noise, cost, and latency. |
| What is recall@k? | Of all expected relevant chunks, how many appear in top-k. Good for measuring retrieval coverage. |
| What is precision@k? | Of retrieved top-k chunks, how many are actually relevant. Good for measuring noise. |
| What is MRR? | Mean Reciprocal Rank: rewards putting the first correct result higher. |
| How do you improve bad retrieval? | Check corpus, chunking, metadata, query rewriting, embedding model, hybrid search, reranking. |
| How do you debug top-20 good but top-3 bad? | Retrieval recall is okay, ranking/reranking is weak. Add reranker or tune scoring. |

## 4. Evaluation questions

| Question | Strong answer direction |
|---|---|
| How do you evaluate RAG? | Evaluate retrieval separately from generation. |
| Retrieval metrics? | recall@k, precision@k, MRR, hit rate, coverage by category. |
| Generation metrics? | groundedness, faithfulness, citation correctness, answer usefulness, hallucination rate. |
| Human eval? | Ask reviewers whether answer is correct, complete, grounded, and useful. |
| A/B testing? | Compare baseline vs new retriever/prompt/reranker on task success, latency, satisfaction, escalation rate. |
| What is LLM-as-judge risk? | It can be biased or inconsistent; use rubrics, calibration examples, and human spot checks. |

## 5. Hallucination and grounding questions

| Question | Strong answer direction |
|---|---|
| Why does hallucination happen in RAG? | Missing/irrelevant evidence, prompt allows unsupported claims, model overgeneralizes, stale or conflicting docs. |
| How do you reduce hallucination? | Require answer from retrieved context, cite sources, say "not enough evidence", add grounding checks. |
| How do you detect hallucination? | Compare claims against retrieved chunks; flag unsupported claims and fake citations. |
| What if retrieved docs conflict? | Surface uncertainty, cite both sources, prefer newer/authoritative docs by metadata. |

## 6. Security and enterprise questions

| Question | Strong answer direction |
|---|---|
| How do you prevent data leakage? | ACL filtering before retrieval, user_id/tenant_id isolation, audit logs, least privilege. |
| Can embeddings leak information? | They can encode sensitive semantics; treat embeddings/vector DB as sensitive data. |
| How do you handle deletion requests? | Delete source doc, chunks, embeddings, caches, and update indexes. |
| What about external LLM providers? | Do not send sensitive retrieved chunks unless provider/deployment is approved for that data. |
| How do you handle prompt injection in documents? | Treat retrieved documents as untrusted content; separate instructions from data; add policy filters. |

## 7. Product and UX questions

| Question | Strong answer direction |
|---|---|
| What metrics would you track after launch? | Answer helpfulness, groundedness, retrieval hit rate, citation click rate, task completion, latency, cost. |
| How do you explain confidence to users? | Show citations, freshness, source authority, and uncertainty; avoid fake numeric confidence. |
| How do you handle "no answer"? | Say not enough evidence and suggest next actions instead of hallucinating. |
| How do you collect feedback? | Thumbs up/down plus reason tags: wrong source, outdated, incomplete, unclear, hallucinated. |
| How do you prioritize improvements? | Use failure taxonomy: missing knowledge, retrieval miss, ranking issue, generation issue, permission issue. |

## 8. Scenario questions

### Scenario: Internal company Q&A

Good answer:

> I would build an ingestion pipeline for internal docs, chunk and index them with metadata and ACLs, retrieve top-k chunks per question with tenant/user permission filters, optionally rerank, then generate answers with citations. I would separately monitor retrieval recall, answer groundedness, latency, and data leakage risks.

### Scenario: Job matching product

Good answer:

> I would keep structured fields such as location, salary, skills, and seniority in a database, and use RAG for long profile/project evidence. For each JD, extract job signals, retrieve per-user evidence chunks with user_id filtering, score deterministically, then generate recommendations with citations.

### Scenario: Users complain answers are bad

Good answer:

> I would not start by changing the LLM. I would inspect the trace: query signals, retrieved chunks, scores, top-k, citations, and final answer. If correct evidence is missing from the corpus, it is ingestion/chunking. If it exists but is not retrieved, it is retrieval/embedding. If it appears in top-20 but not top-3, it is ranking/reranking. If it is in top-k but ignored, it is generation/grounding.

## What you should master as a product candidate

Must know:

```text
RAG vs prompt vs fine-tune
chunking trade-offs
embedding basics
top-k / recall@k / hitCount
reranking purpose
retrieval vs generation eval
hallucination and citation
privacy / ACL / tenant isolation
debugging failure modes
```

Good to know:

```text
hybrid search
vector DB metadata filtering
embedding model selection
document freshness
prompt injection through retrieved docs
LLM-as-judge limitations
cost / latency trade-offs
```

Not necessary to deeply implement for a product interview:

```text
writing vector index internals
training embedding models from scratch
implementing cross-encoder rerankers
low-level ANN algorithms
```

## Final interview pitch

> For an AI product role, I do not need to claim I can build every low-level vector search component from scratch. But I should understand the RAG product architecture: when it is needed, how knowledge is ingested and chunked, how retrieval and top-k work, how to evaluate retrieval separately from generation, how to debug bad answers, and how to protect sensitive data. In my AI Job Search Copilot, I implemented a small keyword-based RAG baseline first, because it is inspectable and easy to evaluate. The next step would be comparing it with embedding retrieval and reranking using the same eval set.
