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

- Store sanitized resume, project notes, and target role criteria.
- Retrieve relevant candidate experience for each JD.
- Explain why each retrieved experience supports the match.
- Evaluate retrieval quality separately from generation quality.
- Connect retrieved evidence to `JobRecommendation` with citations.
- Compare recommendation quality with and without RAG.

## Milestone 3: Tool calling and agent workflow

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
