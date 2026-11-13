# Spec: Featureful MVP

Status: ready-for-agent

## Problem Statement

A product team for a coffee-tracking app (home roasters logging beans, roasts, brews, and recipes) gets feature Requests from Customers and Support agents. The Requests pile up as near-duplicates in the submitters' own words, each proposing a solution rather than describing the need. PMs can't easily see which underlying Problems matter most, popular asks crowd out strategically valuable ones, prioritization is inconsistent, and Customers never hear what was decided or why.

## Solution

Featureful is an AI-first feature intelligence system that runs locally. Its core move happens **at submission**. When someone submits a Request, the AI extracts the underlying need and compares it against every existing Problem. It then either proposes attaching the Request as Evidence to a matching Problem, or proposes a new Problem statement. The submitter confirms or rejects the suggestion before anything is saved. People Support Problems, not Requests.

Every Problem gets a transparent Priority score. Demand is computed from the supporter count. The AI judges Impact, Strategic fit (against an editable Product Strategy), Effort, and delivery Risk, each with a one-line reason. A PM can override the score, but only with a note.

PMs can generate a Decision brief for any Problem and change its Status. Each Status change comes with a Decision note, which the AI can draft and which Customers see.

The home page differs by role:
- **Internal stakeholders** see the full evaluation.
- **Customers** see the problem statement, Status, support count, and Decision note.

The app runs locally only; it is not deployed. The README explains how to run it.

## User Stories

### Identity

1. As any user, I want to pick who I am from a switcher in the header, so that I can use the app as a Customer, a Support agent, or a PM without setting up accounts.
2. As any user, I want the app to remember my chosen identity across page loads, so that I don't have to pick it again.
3. As a demo viewer, I want to switch identities freely, so that I can see how each role experiences the workflow.

### Submitting Requests

4. As a Customer, I want to submit a Request with a title and a description, so that the product team hears what I need.
5. As a Support agent, I want to submit a Request on a Customer's behalf, so that feedback from support conversations isn't lost.
6. As a submitter, I want to see, before my Request is saved, whether the AI thinks it matches an existing Problem, so that I don't create a duplicate.
7. As a submitter, I want to see the AI's confidence and a one-line reason for a suggested match, so that I can judge whether it really is the same thing.
8. As a submitter, I want to accept a suggested match and have my Request attached and my Support added to that Problem, so that my voice adds weight to an existing Problem.
9. As a submitter, I want to reject a suggested match ("mine is different"), so that a new Problem is created when the AI is wrong.
10. As a submitter whose Request matches nothing, I want to see the AI-proposed problem statement for the new Problem, so that I can check it captures what I meant.
11. As a submitter, I want the problem statement to describe my underlying need rather than my proposed solution, so that the team can consider other ways to solve it.
12. As a submitter who already supports the matched Problem, I want my new Request still recorded as Evidence without counting my Support twice, so that Demand stays honest.
13. As a submitter, I want clear feedback while the AI is working, so that I know the app hasn't frozen.
14. As a submitter, I want a clear error and the chance to retry if the AI call fails, so that my typed Request is not lost.

### Discovering and Supporting Problems

15. As any user, I want to see a list of Problems, so that I can see what others have asked for.
16. As any user, I want to search Problems by keyword, so that I can find a Problem before I submit.
17. As any user, I want to filter Problems by Status, so that I can focus on open, planned, or shipped work.
18. As any user, I want to sort Problems by priority, support, or newest, so that I can see what matters most or what's new.
19. As a Customer, I want to Support a Problem with one click, so that I can show it matters to me without writing a Request.
20. As a Customer, I want to remove my Support, so that I can correct a mistake.
21. As a Customer, I want to be unable to Support the same Problem twice, so that counts are fair.
22. As a Customer, I want my home page to focus on each Problem's statement, Status, and support count, so that it is simple and readable.
23. As a Customer, I want to see the Decision note on a Problem, so that I know what was decided and why.
24. As a Customer, I want to see my own Requests on a Problem's page, so that I know my feedback was attached.
25. As a Customer, I want other Customers' Request text kept private from me, so that people's words aren't exposed.
26. As a Customer, I want to see which Problems I support, so that I can follow them.

### Evaluation (Internal stakeholders)

27. As an Internal stakeholder, I want a home page showing each Problem's Priority score, support count, Status, and Evidence count, so that I can triage at a glance.
28. As an Internal stakeholder, I want to see the score broken down into Demand, Impact, Strategic fit, Effort, and Risk, each with the AI's one-line reason, so that I understand why a Problem ranks where it does.
29. As an Internal stakeholder, I want to read all the Evidence on a Problem, so that I can hear Customers in their own words.
30. As an Internal stakeholder, I want to see who supports a Problem, so that I know who to follow up with.
31. As a PM, I want Problems scored automatically when they are created and when new Evidence arrives, so that scores stay current without manual work.
32. As a PM, I want to edit the Product Strategy, so that Strategic fit reflects where we are headed.
33. As a PM, I want to re-evaluate one Problem, so that I can refresh a stale score.
34. As a PM, I want to re-evaluate all Problems after changing the Product Strategy, so that Strategic fit stays consistent.
35. As a PM, I want to override a Priority score, so that I can apply judgment the AI lacks.
36. As a PM, I want overrides to require a note and to be shown alongside the AI's score, so that overrides are transparent.
37. As a PM, I want to clear an override, so that the computed score applies again.
38. As a Support agent, I want to see everything a PM sees but be unable to override scores, change Status, generate briefs, or edit the Product Strategy, so that decisions stay with PMs.

### Decisions and communication

39. As a PM, I want to generate a Decision brief for a Problem, so that I can see the case for and against at a glance.
40. As a PM, I want the brief to contain the problem statement, a summary of the Evidence with 2–3 representative quotes, the score breakdown, a do/defer/decline recommendation with reasoning, and open questions, so that it is ready for a decision meeting.
41. As a PM, I want the brief saved and regenerable, so that I don't pay for regeneration on every view but can refresh it.
42. As a PM, I want to change a Problem's Status (Open, Planned, In progress, Shipped, Declined), so that progress is tracked.
43. As a PM, I want to attach a Decision note when I change Status, so that supporters know why.
44. As a PM, I want the AI to draft a Decision note from the brief and Evidence, written for Customers, so that communicating decisions takes seconds.
45. As a PM, I want to edit the AI-drafted note before saving, so that the message is mine.

### Setup

46. As a developer, I want a README with clear local setup steps (install, environment variables, database setup, seed, run, test), so that I can run the app on my machine.
47. As a developer, I want a seed command that loads about 25 coffee-app Requests from about 8 Customers through the real AI pipeline, so that the demo shows realistic matching and scoring.
48. As a developer, I want the AI model name in one config constant and the API key in an environment file, so that switching models is trivial.

## Implementation Decisions

**Stack:**
- Next.js (App Router), TypeScript.
- Vercel AI SDK with the Anthropic provider (Claude Sonnet; one model constant). All AI calls use structured output with Zod schemas.
- SQLite with Drizzle.
- Tailwind and shadcn/ui.
- Vitest.
- Local only. No deployment target.

**Identity:** A cookie holds the current person's id. People have a name and a role: Customer, Support agent, or PM. Server actions check the role for PM-only actions. There is no real authentication.

**Schema (conceptual):**
- **people**: id, name, role.
- **product_strategy**: a single row of text.
- **problems**:
  - id, title, need statement, Status, Decision note, created_at
  - for each of Impact, Strategic fit, Effort, Risk: an AI score (1–5) and a reason
  - evaluated_at
  - override score and override note (nullable)
  - brief markdown and brief_generated_at (nullable)
- **requests**: id, problem_id, author_id, title, description, created_at. A Request is always attached to exactly one Problem.
- **supports**: person_id, problem_id, unique on the pair.

**Modules:**
- **Priority scoring** (pure, deep). Inputs: the AI criterion scores (1–5), the supporter count, the weights, and an optional override. Output: a 0–100 total plus a breakdown for each criterion.
  - Demand maps supporter count to 1–5 by fixed thresholds: 1 → 1, 2–3 → 2, 4–5 → 3, 6–8 → 4, 9+ → 5.
  - Effort and Risk are inverted (6 − score).
  - Each criterion is normalized as (s − 1) / 4 and weighted.
  - Default weights: Demand 25, Impact 25, Strategic fit 20, Effort 15, Risk 15. They live in one config file.
  - An override replaces the total while keeping the computed total visible.
  - Demand is computed whenever the score is read, never stored.
- **Intake** (deep; the core AI workflow). Two operations:
  - `propose(request)` writes nothing. It returns either `{match: problemId, confidence, reason}` or `{newProblem: {title, need}}`.
  - `confirm(request, decision, personId)` writes the Request (as Evidence), creates the Problem if needed, adds Support idempotently, and triggers evaluation.
  - Intake depends on a **Matcher** interface: given a Request and summaries of all Problems, it returns a proposal. The production Matcher is an LLM call that sends the full Problem list (see ADR 0001). Tests inject a fake Matcher.
- **Evaluator** (AI). Given a Problem, its Evidence, and the Product Strategy, it returns scores and reasons for Impact, Strategic fit, Effort, and Risk. It runs after a response is sent (Next.js `after`) on creation and on new Evidence, and on demand from the PM's re-evaluate actions.
- **Brief writer** (AI). Given a Problem, its Evidence, and its score breakdown, it returns brief markdown, which is stored on the Problem.
- **Decision note drafter** (AI). Given a Problem, its brief, the target Status, and its Evidence, it returns a short, Customer-facing note.
- **UI:**
  - A home page that branches by role (Customer view vs Internal stakeholder view).
  - A Problem page that also branches by role.
  - A submit flow with two steps: propose, then confirm.
  - A Product Strategy page (PM only).
  - A header identity switcher.
- **Seed:** a static file of about 25 coffee-app Requests by about 8 Customers, with deliberate near-duplicates, plus extra Support links. It also defines Support agent Dana, PM Sam, and the default Product Strategy (serious home roasters; data ownership; brew repeatability). The seed script resets the database and runs each Request through Intake, auto-accepting the Matcher's proposal, then through evaluation.
- **README:** prerequisites, install, `.env` with `ANTHROPIC_API_KEY`, database migrate/push, seed, dev server, running tests. No deployment instructions.

## Testing Decisions

- Good tests check external behavior through a module's public interface, not internal details. They should survive refactoring.
- **Priority scoring:** Vitest unit tests on the pure function. Cover the Demand thresholds, Effort/Risk inversion, weighting, the 0–100 bounds, and override behavior.
- **Intake:** Vitest tests against an in-memory SQLite database with a fake Matcher injected. Cover:
  - a match proposal attaches Evidence and adds Support;
  - rejecting a match creates a new Problem;
  - a no-match proposal creates a new Problem;
  - Support is not duplicated when the submitter already supports the Problem;
  - `propose` writes nothing.
- The AI modules (the production Matcher, Evaluator, Brief writer, Decision note drafter) and the UI are not automatically tested. They are checked by inspecting the seed run and by manual click-through. This is a deliberate concession to token limits, not time.
- There is no prior art in the repo; this is a new codebase.

## Out of Scope

- Deployment and hosting.
- Real authentication or accounts.
- Embeddings or vector search (ADR 0001 records the scale compromise).
- Merging Problems, splitting them, or moving Requests between Problems.
- Theme grouping above Problems, triage routing, and trend detection.
- Email and in-app notifications.
- A UI for editing weights.
- Recording "on behalf of" for Support agent submissions.
- Tests for the AI modules and the UI.

## Further Notes

- Use the vocabulary in `GLOSSARY.md` throughout the code and UI (Problem, Request, Evidence, Support, Decision note, Decision brief, and so on).
- **Support** (giving Support to a Problem) and **Support agent** (a role) share a word. Watch for confusion in the UI copy.
- Matching quality depends on prompt quality. Instruct the Matcher to match only when the underlying need is the same, not merely the same area of the app.
