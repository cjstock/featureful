# Featureful

A feature intelligence system that turns raw feature requests into understood customer problems that a product team can prioritize and decide on.

## Language

### Intake

**Request**:
A single piece of raw feedback submitted by someone, consisting of a title and description in the submitter's own words.
_Avoid_: Ticket, idea, suggestion, feedback item

**Problem**:
The underlying customer need behind one or more Requests, stated independently of any proposed solution. The unit the product team prioritizes and decides on.
_Avoid_: Theme, cluster, epic, feature

**Evidence**:
The Requests attached to a Problem; they show who is asking and how they describe it.
_Avoid_: Duplicates, linked requests

**Support**:
A person's declaration that a Problem matters to them; each person supports a given Problem at most once, and submitting a Request attached to a Problem counts as supporting it.
_Avoid_: Vote, upvote, like

**Problem I've asked about**:
From a Customer's point of view, a Problem with at least one of their own Requests as Evidence. People never "create" Problems; their Requests are attached to them.
_Avoid_: My Problem, Problem I created, my idea

### Matching

**Matcher**:
What proposes, for a new Request, whether it shares the underlying need of an existing Problem or needs a new one.
_Avoid_: Deduper, classifier, AI

**Matching decision**:
The record of what the Matcher proposed for a Request (a match with confidence and reason, or a new Problem) and what the submitter chose.
_Avoid_: Match result, suggestion

**Match review**:
A PM's verdict on a Matching decision: Confirm, Move (to another existing Problem), or Split (into a new Problem), with an optional note.
_Avoid_: Correction, override, triage

**Matching example**:
A reviewed Matching decision that the Matcher learns from when judging new Requests.
_Avoid_: Training data, few-shot, feedback

**Boundary note**:
A short statement on a Problem of what it does and does not cover, distilled from Match reviews, that the Matcher reads alongside the Problem.
_Avoid_: Scope note, rule, description

### Evaluation

**Product Strategy**:
A short statement, maintained by the PM, of who the product serves and what it is trying to achieve; the yardstick for Strategic fit.
_Avoid_: Roadmap, vision, OKRs

**Priority score**:
A Problem's overall rank, combining Demand, Impact, Strategic fit, Effort, and Risk; a PM may override it with a stated reason.
_Avoid_: Rank, RICE, rating

**Demand**:
How many people support a Problem.
_Avoid_: Votes, popularity

**Impact**:
How painful and frequent the Problem is for those who have it.
_Avoid_: Severity, value

**Strategic fit**:
How well solving the Problem advances the Product Strategy.
_Avoid_: Alignment

**Effort**:
The estimated cost of solving the Problem; lower Effort raises the Priority score.
_Avoid_: Size, complexity

**Risk**:
The likelihood that solving the Problem goes wrong in delivery (technical unknowns, data breakage, external dependencies); lower Risk raises the Priority score. Not the risk of leaving the Problem unsolved, which is part of Impact.
_Avoid_: Uncertainty, danger

**Decision brief**:
A summary of a Problem written for product leaders: the need, the Evidence, the Priority score, and a recommendation.
_Avoid_: Report, one-pager

### Decisions

**Status**:
Where a Problem stands: Open, Planned, In progress, Shipped, or Declined.
_Avoid_: Stage, state

**Decision note**:
The PM's explanation, visible to supporters, of why a Problem's Status changed.
_Avoid_: Update, announcement, changelog

### People

**Customer**:
An external user of the product who submits Requests and supports Problems.
_Avoid_: Client, end user, external stakeholder

**Support agent**:
An internal team member who submits Requests on behalf of Customers.
_Avoid_: CS, support rep

**PM**:
A product manager who evaluates, prioritizes, and decides on Problems.
_Avoid_: Admin, product owner

**Internal stakeholder**:
A Support agent or PM; sees the full evaluation of every Problem.
_Avoid_: Staff, admin

