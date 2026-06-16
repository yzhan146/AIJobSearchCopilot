# AI Interview Learning Map

This project should make the following concepts concrete enough to discuss in interviews.

## LLM application basics

Questions to answer:

- Why use an LLM here instead of rules only?
- Which parts should be deterministic code and which parts should be LLM calls?
- How do you handle hallucination and unstable output?

Project implementation:

- Use LLMs for JD extraction and explanation.
- Use deterministic scoring functions for the final score.
- Use structured output schemas and validation.

## Model selection

Questions to answer:

- How do you choose between GPT, Claude, Gemini, and local/open-source models?
- How do cost, latency, context length, Chinese quality, JSON reliability, and tool-calling support affect the choice?
- When is a smaller model enough?

Project implementation:

- Keep the LLM provider configurable.
- Track model, latency, token usage, and output quality.
- Start with a strong hosted model, then test cheaper alternatives.

## Prompt engineering and prompt experiments

Questions to answer:

- What is a prompt experiment?
- How do you compare prompts objectively?
- How do you reduce prompt brittleness?

Project implementation:

- Compare at least three prompt strategies:
  1. One-shot direct judgment.
  2. Structured extraction followed by scoring.
  3. Extraction, scoring, risk analysis, and outreach generation as separate steps.
- Save prompts as versioned templates.
- Evaluate output stability on the same sample JD set.

## RAG

Questions to answer:

- How do you build a RAG pipeline?
- What goes into the knowledge base?
- How do chunking, embeddings, retrievers, reranking, and citations work?
- How do you evaluate retrieval independently from answer quality?

Project implementation:

- Index sanitized resume, project experience, and target role criteria in `data/profile_knowledge.json`.
- Retrieve relevant candidate evidence for each JD with `retrieveProfileEvidence()`.
- Generate match explanations with `evidenceCitations` tied to stable evidence IDs.
- Track false positives and missed evidence with `npm run eval:rag`.

## Function calling / tool calling

Questions to answer:

- What is function calling?
- How is it different from asking the model to write text?
- How do you keep tool calls safe?

Project implementation:

- Expose typed tools:
  - `extract_job_signals`
  - `score_job`
  - `retrieve_profile_evidence`
  - `export_shortlist`
  - `update_application_status`
- Validate all tool inputs and outputs.
- Keep destructive or external actions behind human approval.

## Agent

Questions to answer:

- What makes something an agent instead of a normal LLM workflow?
- When should you not use an agent?
- How do you debug agent failures?

Project implementation:

- Start with an explicit workflow.
- Add limited agent behavior only where the system must choose the next step.
- Log the plan, tool calls, observations, and final result.

## Skill, prompt, agent, and harness

Working definitions:

- **Prompt**: instructions sent to a model for one task.
- **Skill**: a reusable capability package, usually combining instructions, examples, and sometimes scripts/resources.
- **Agent**: a system that can reason over state, decide next actions, and call tools toward a goal.
- **Harness**: the surrounding runtime that wires prompts, tools, memory, evaluation, logging, and safety together.

Project mapping:

- Prompts: JD extraction and message generation templates.
- Skills: reusable job-screening and resume-tailoring instructions.
- Agent: job-search workflow that decides whether to extract, retrieve, score, or ask for approval.
- Harness: app code, schemas, tool registry, evaluation set, logs, and UI.

## MCP

Questions to answer:

- What is MCP?
- Why use MCP instead of custom one-off integrations?
- How do MCP servers expose tools and resources?

Project implementation:

- Treat MCP as a future integration layer.
- Potential MCP tools:
  - file system for reading sample JDs
  - browser/search for collecting public job data
  - spreadsheet export
  - local resume/profile store

## Evaluation

Questions to answer:

- How do you know the AI output is good?
- How do you evaluate extraction, retrieval, scoring, and final recommendations separately?
- What would you A/B test?

Project implementation:

- Build a small gold set of sample JDs.
- Track:
  - extraction accuracy
  - retrieval relevance
  - scoring agreement with human judgment
  - hallucination rate
  - cost and latency

## Interview story

Short version:

> I built an AI Job Search Copilot to turn a messy job-search process into a structured agentic workflow. It extracts job signals, retrieves relevant resume evidence, scores the fit with deterministic rules, generates tailored outreach, and keeps human approval before any external action. The project helped me understand the practical differences between prompts, RAG, tool calling, agents, and the application harness around them.
