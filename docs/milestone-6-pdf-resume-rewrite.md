# Milestone 6: PDF Resume Rewrite and Interview Prep

## Goal

Move the product from an MVP ranking demo into a practical job-application assistant:

1. User uploads a PDF resume.
2. User submits one or more JD URLs or pasted JD descriptions.
3. The tool compares the resume/profile against each JD.
4. The tool returns:
   - interview success probability;
   - JD-specific resume edit guidance;
   - a rewritten PDF resume draft;
   - current gaps for the role;
   - likely interview questions and grounded answer drafts.

## Product Boundary

The rewritten resume must only reorder, summarize, and re-narrate facts already present in the uploaded resume or explicit profile supplements.

It must not invent:

- employers, titles, dates, schools, certifications, or degrees;
- metrics, revenue, adoption numbers, or impact claims;
- skills, tools, projects, or domain experience not supported by the source material;
- location, salary, or language claims.

If a JD asks for unsupported experience, the system should mark it as a gap and optionally suggest what to learn or prepare, but it must not add that gap into the rewritten resume.

## Inputs

| Input | Required | Notes |
|---|---:|---|
| PDF resume | Yes | Server extracts text locally before model analysis. |
| Resume text supplement | No | Useful when PDF extraction is incomplete or the PDF is scanned. |
| Personal website | No | Treated as user-provided background context. |
| GitHub URL | No | Treated as user-provided background context. |
| JD URL | Conditional | Can stand alone when OpenAI-backed extraction is enabled. |
| JD title + text | Conditional | Required when URL-only extraction is unavailable. |

## Outputs Per JD

| Output | Description |
|---|---|
| Success probability | 0-100 score plus Strong / Medium / Low level. |
| Ranking reasons | Why this role is more or less promising. |
| Resume improvements | Concrete edits for this JD. |
| Rewritten resume PDF | A downloadable draft generated from existing facts only. |
| Rewrite plan | What was moved, emphasized, or reframed. |
| Gaps | Missing or weak evidence for this role. |
| Interview Q&A | Likely questions and grounded answer drafts. |
| Integrity notes | Checks explaining how hallucination was avoided. |

## Current Implementation

Implemented in the local web app:

- `web/index.html` reads PDF/text resume files and sends base64 content to the server.
- `web_server.js` extracts text from PDF resumes with `pdf-parse`.
- `web_server.js` calls Zhipu when `LLM_PROVIDER=zhipu` and `ZHIPU_API_KEY` are configured, or OpenAI when `LLM_PROVIDER=openai` and `OPENAI_API_KEY` are configured.
- `web_server.js` validates the JSON feedback shape.
- `web_server.js` writes rewritten PDF drafts to `exports/resume-rewrites/`.
- If OpenAI is not configured, the app keeps the deterministic local ranking path and explains that PDF rewriting is unavailable.

## Acceptance Criteria

- A user can upload a PDF resume and analyze 1-10 JDs.
- A user can provide a JD URL only when OpenAI is configured.
- Each JD returns success probability, reasons, gaps, and interview prep.
- Each OpenAI-backed JD analysis produces a downloadable PDF resume draft.
- The prompt and UI explicitly warn that rewritten resume content must not invent new facts.
- API keys stay in `.env.local` and are never committed.

## Open Questions

- Add OCR for scanned PDFs.
- Decide whether the public `marshallzzz.com/resumeAssist/` page should stay static or call a deployed backend.
- Add side-by-side diff between original resume sections and rewritten sections.
- Add user approval before exporting or sharing any rewritten resume externally.
