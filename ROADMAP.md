# Roadmap

This project has three goals:

1. **Portfolio project**: build an AI project that can be explained in interviews and linked from a personal website.
2. **Learning vehicle**: use one concrete project to learn LLM application concepts that often appear in interviews.
3. **Public product path**: make the tool usable by real users later, with room for deployment, analytics, and possible monetization.

## Milestone 1: Local hybrid MVP

Status: mostly complete. The original local MVP expanded from a simple parser/scorer into a learning-focused hybrid AI workflow.

Implemented:

- TypeScript CLI project with `npm run demo`.
- Sample inputs:
  - `data/sample_jobs.json`
  - `data/sample_profile.md`
  - `data/gold_judgments.json`
- Core schemas:
  - `RawJob`
  - `CandidateProfile`
  - `JobSignals`
  - `ScoreResult`
  - `JobRecommendation`
- Job/profile schema extensions for:
  - required skillset
  - candidate skillset
  - language requirements
  - language strengths
  - AI replacement risk
- Deterministic scoring with a configurable rubric.
- LLM provider abstraction:
  - mock provider for local deterministic tests
  - OpenAI-compatible provider path
  - Gemini provider path
  - Groq provider path
- Prompt experiment comparing:
  - one-shot judgment
  - structured extraction
  - hybrid workflow
- Gold set evaluation against human expected labels.
- Exported local results to JSON and CSV.
- Milestone recap in `docs/milestone-1-local-mvp-recap.md`.

Decision:

- Use **hybrid workflow** as the main product architecture:
  1. LLM structured extraction
  2. TypeScript schema validation
  3. deterministic scoring
  4. LLM recommendation generation
  5. export for human review
- Keep one-shot prompting only as an experiment baseline.

Remaining polish before moving deep into Milestone 2:

- Expand gold judgments beyond the starter sample set.
- Add more realistic sample JDs.
- Optionally add `.xlsx` export; current MVP exports JSON and CSV.

## Milestone 2: RAG-backed profile matching

Status: ready to close. The RAG baseline is implemented as local keyword retrieval over sanitized resume/profile evidence chunks, with realistic Top20 job samples and a final recap.

Implemented:

- Sanitized profile knowledge base:
  - `data/profile_knowledge.json`
  - Expanded to 28 public-safe evidence chunks based on the sanitized profile, resume details, and public website content.
- RAG eval gold set:
  - `data/rag_eval_set.json`
  - Expanded to 8 sample retrieval cases based on the current Top20 job samples.
- Realistic sample jobs:
  - `data/sample_jobs.json`
  - Replaced starter toy jobs with a sanitized conversion of the Beijing AI product jobs Top20 spreadsheet.
- Core RAG schemas:
  - `ProfileEvidence`
  - `RetrievedProfileEvidence`
  - `ProfileEvidenceCitation`
- Local retrieval tool:
  - `src/rag/profileKnowledge.ts`
  - `src/rag/retrieveProfileEvidence.ts`
- Workflow integration:
  - `runLocalMvp()` retrieves top profile evidence for each JD.
  - `JobRecommendation` includes citation-backed evidence.
  - JSON/CSV exports include retrieved evidence and citation IDs.
- Separate retrieval evaluation:
  - `npm run eval:rag`
  - `exports/rag-retrieval-evaluation.md`
- Milestone recap in `docs/milestone-2-rag-profile-matching.md`.
- Final recap in `docs/milestone-2-final-recap.md`.
- Learning guide in `docs/milestone-2-learning-guide.md`.

Decision:

- Start with deterministic local retrieval before embeddings so chunking, matched terms, citation quality, and recall@k are easy to inspect.
- Keep RAG as an explicit workflow node before recommendation generation.
- Evaluate retrieval quality separately from recommendation wording quality.

Next polish:

- Add embedding retrieval behind the same retrieval interface.
- Compare keyword retrieval vs embedding retrieval.
- Expand `data/rag_eval_set.json` beyond current sample jobs if more realistic JDs are added.
- Compare recommendation quality with and without retrieved evidence.

## Milestone 3: Tool calling and agent workflow

See the outline:

```text
docs/milestone-3-outline.md
```

- Add tool/function calls for:
  - JD extraction
  - scoring
  - RAG retrieval
  - Excel export
  - application status updates
- Add a human approval step before any application action.
- Log each step for debugging and interview explanation.
- Represent the workflow as explicit nodes/tools so it can evolve from a fixed DAG into an agent-controlled workflow.

## Milestone 4: Website-ready demo

- Add a polished web UI.
- Add public-safe sample data.
- Add screenshots and demo flow.
- Prepare a project page for the personal website.

## Milestone 5: Public product exploration

- Deploy a usable version.
- Add rate limits and privacy warnings.
- Add analytics for usage and conversion.
- Explore monetization only after validating real user value.
