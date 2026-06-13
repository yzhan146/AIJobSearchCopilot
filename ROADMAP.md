# Roadmap

This project has three goals:

1. **Portfolio project**: build an AI project that can be explained in interviews and linked from a personal website.
2. **Learning vehicle**: use one concrete project to learn LLM application concepts that often appear in interviews.
3. **Public product path**: make the tool usable by real users later, with room for deployment, analytics, and possible monetization.

## Milestone 1: Local MVP

- Paste a job description and candidate profile.
- Extract structured JD fields.
- Score the role against a configurable rubric.
- Generate resume focus points and outreach messages.
- Export results to Excel.

## Milestone 2: RAG-backed profile matching

- Store sanitized resume, project notes, and target role criteria.
- Retrieve relevant candidate experience for each JD.
- Explain why each retrieved experience supports the match.
- Evaluate retrieval quality separately from generation quality.

## Milestone 3: Tool calling and agent workflow

- Add tool/function calls for:
  - JD extraction
  - scoring
  - RAG retrieval
  - Excel export
  - application status updates
- Add a human approval step before any application action.
- Log each step for debugging and interview explanation.

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
