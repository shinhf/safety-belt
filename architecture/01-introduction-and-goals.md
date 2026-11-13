# 1. Introduction and Goals

<!-- arc42-generated -->
> **Status: planned target architecture.** No application code exists yet. This file describes the MVP that GitHub issues [#1–#8](https://github.com/shinhf/safety-belt/issues) will build. Nothing here is implemented, tested or measured.

Safety Belt pauses a supported desktop-browser checkout when its disclosed billing commitment conflicts with the intent the user explicitly approved. It still lets a legitimate purchase within that intent finish ([README.md](../README.md)). The MVP is called "One PDF, one payment". It runs against one owned, fictional checkout, **Paperlane Demo**. All documents, payments and conversions are synthetic and simulated.

**Evidence labels used in this documentation** (rule from `safety-belt-mlh/AGENTS.md`):

| Label | Meaning |
|---|---|
| Reported | A consumer's own account, such as a BBB Scam Tracker report. It is not an adjudicated fact. |
| Verified | A fact checked against official documentation, with the check date given. |
| Proposed | Planned behaviour taken from the backlog or the scenario. |
| Measured | A result observed on running software. **There are none yet.** |

Note on sources: the product briefs under `safety-belt-mlh/` are a local folder that the repository's `.gitignore` excludes. They are cited here by path and do not resolve on GitHub.
<!-- /arc42-generated -->

## 1.1 Requirements Overview

<!-- arc42-generated -->
**Business goal (Proposed).** Let a person complete one useful document task within an explicit one-off payment limit. If a checkout discloses a recurring commitment, pause it before anything executes ([docs/mvp-backlog.md](../docs/mvp-backlog.md)).

**Motivation (Reported).** In [BBB Scam Tracker report 1218456](https://www.bbb.org/scamtracker/lookupscam/1218456), reported on 10 March 2026, a consumer says a USD 1 trial of a one-time PDF service turned into a USD 49.95 monthly subscription. The report does not establish the device used, the exact checkout wording or any last-second change to the transaction. It is a firsthand allegation, not proof of fraud. The fixture reconstructs the problem pattern with fictional details (`safety-belt-mlh/.agents/skills/safety-belt-scenarios/references/pdf-checkout-history.md`).

**Core journey (Proposed):**

1. The user selects a synthetic document.
2. The user confirms the intent on Safety Belt's own surface.
3. Safety Belt inspects the checkout.
4. The model interprets the disclosed terms.
5. Deterministic rules decide.
6. The checkout either shows an explanation of the pause or completes the permitted simulation once ([README.md](../README.md)).

| ID | Priority | Requirement | Description | Issue |
|----|----------|-------------|-------------|-------|
| R1 | P0 | Owned checkout fixture | A local Node service serves a synthetic document and the Paperlane Demo checkout variants: USD 1 one-off; USD 1 today, then USD 49.95 monthly after a seven-day trial; USD 3 one-off; non-USD; changed merchant; missing or contradictory terms. Each variant has immutable, revisioned snapshots and read-only outcome counters. | [#1](https://github.com/shinhf/safety-belt/issues/1) |
| R2 | P0 | Independent intent | A separate Safety Belt surface records the intent: one conversion, Paperlane Demo, at most USD 2 (200 cents), one-off billing only. Only explicit confirmation creates or revises the intent. Checkout text and model output cannot. | [#2](https://github.com/shinhf/safety-belt/issues/2) |
| R3 | P0 | Semantic interpretation | One service-side Gemini 4 Hydrogen REST call extracts the billing semantics with supporting quotations. A local validator checks the result. The model cannot authorize anything. | [#3](https://github.com/shinhf/safety-belt/issues/3) |
| R4 | P0 | Deterministic policy and grants | A pure comparator returns `ALLOW`, `CONFLICT` or `CLARIFY` with reason codes. Only `ALLOW` mints a single-use grant, and that grant is bound to the current session, intent revision, checkout revision and commitment. | [#4](https://github.com/shinhf/safety-belt/issues/4) |
| R5 | P0 | Gated execution boundary | Button, Enter and direct JSON submission all reach one handler. That handler revalidates the grant, consumes it and records the simulated outcome in one synchronous critical section. | [#5](https://github.com/shinhf/safety-belt/issues/5) |
| R6 | P0 | Explanation and recovery | The browser explains a paused commitment with the quoted disclosure. "Review subscription terms" is read-only. Going back to the one-off checkout leads to completion after a fresh check. | [#6](https://github.com/shinhf/safety-belt/issues/6) |
| R7 | P0 | Verification | A Playwright Chromium suite and `node:test` cover enforcement, failure injection and privacy boundaries, using labelled replay fixtures. | [#7](https://github.com/shinhf/safety-belt/issues/7) |
| R8 | P0 | Live-model measurement and demo | At least eight independently labelled synthetic disclosures run against the live model, with raw counts reported. The team rehearses a two-minute demo. | [#8](https://github.com/shinhf/safety-belt/issues/8) |

All eight issues are P0 and in the **Todo** column of the [Safety Belt MVP board](https://github.com/users/shinhf/projects/11) as of 2026-11-13. Their acceptance criteria and the Definition of Done in [docs/mvp-backlog.md](../docs/mvp-backlog.md) are requirements for future work, not claims that any check passes. The shared data contract (intent, checkout snapshot, interpretation, decision, grant) is in [docs/technical-decisions.md](../docs/technical-decisions.md).

**Excluded from the MVP:**

- P1 work: subscription enrollment or fresh recurring consent, a browser extension or third-party checkout integration, multiple merchants, actual PDF processing, persistence, deployment and visual polish.
- Never in scope: live payments, real documents, OCR, a GPU or NPU stack, banking integration and hidden-charge detection.

Sources: [docs/mvp-backlog.md](../docs/mvp-backlog.md) and [README.md](../README.md).
<!-- /arc42-generated -->

## 1.2 Quality Goals

<!-- arc42-generated -->
These goals are ordered by priority. Each scenario is **Proposed**: it restates issue acceptance criteria and has not been measured. "Outcome records" means the service-owned counters for attempted submissions, executions, payments, subscriptions and conversion status. These records, not UI messages, are the outcome truth ([docs/technical-decisions.md](../docs/technical-decisions.md), "Observable truth").

| # | Quality goal | Motivation | Measurable scenario (acceptance source) |
|---|---|---|---|
| 1 | **Fail-closed enforcement** (safety) | A low introductory fee must not authorize a subscription. A model error must never become permission. | Approved intent is USD 2 once. The USD 1-then-USD 49.95-monthly variant returns `CONFLICT`. The over-cap, non-USD, changed-merchant, missing-terms and contradictory-terms variants, and injected timeouts, HTTP errors, malformed output and invalid quotations, return `CONFLICT` or `CLARIFY`. In every one of these cases the outcome records show **0 payments, 0 subscriptions and conversion not completed**. USD 2.00 is allowed and USD 2.01 is rejected, using integer cents. ([#4](https://github.com/shinhf/safety-belt/issues/4), [#7](https://github.com/shinhf/safety-belt/issues/7)) |
| 2 | **Approval integrity at the execution boundary** | Checking one state and then executing another, or reusing a grant, would bring the risk back. | The one-off checkout is checked. Its terms then change to recurring, or its merchant changes, before submission. Click, Enter and direct JSON requests are each **rejected with zero side effects**. A model response that arrives after the change or after a reset cannot mint a grant. Duplicate clicks, concurrent clicks, replays and response-loss retries produce **at most 1 payment** per intent and document. Attempts and executions are counted separately. ([#5](https://github.com/shinhf/safety-belt/issues/5), [#7](https://github.com/shinhf/safety-belt/issues/7)) |
| 3 | **Legitimate task completion** (functional suitability) | A system that only blocks gives no useful help. | Approved intent is USD 2 once. The explicit USD 1 one-off checkout creates **exactly 1 simulated payment** and completes the selected synthetic conversion with **0 subscriptions**. After a pause, "Go back" leads to that same completion following a fresh check of the current snapshot. ([#5](https://github.com/shinhf/safety-belt/issues/5), [#6](https://github.com/shinhf/safety-belt/issues/6), DoD in [docs/mvp-backlog.md](../docs/mvp-backlog.md)) |
| 4 | **Provider-payload confidentiality** (security) | Only public billing text is needed for interpretation. The key and user data must not leave the service. | Inspection of the outgoing Gemini payload shows **only** the merchant display name, the disclosure text and fixed instructions and schema. It contains no intent, hidden execution fields, evaluation labels, document contents, or payment or personal data. The API key **appears in none** of the served assets, responses or logs. Cross-origin mutations and unexpected `Host` headers fail. ([#3](https://github.com/shinhf/safety-belt/issues/3), [#7](https://github.com/shinhf/safety-belt/issues/7)) |
| 5 | **Explainable and honestly labelled results** (usability, transparency) | The user must understand why the checkout paused. Demo claims must match what was observed. | The pause message states the approved scope (USD 2 once) and the disclosed terms (USD 1 today, then USD 49.95 per month after seven days), with the merchant and the quoted disclosure, and without alleging fraud. Model text renders as plain text, never as HTML. The UI labels the fixture fictional, the payment and conversion simulated, and the interpretation live or replay. Live-model runs report raw counts, failures and abstentions, kept separate from replay-based gate results. ([#6](https://github.com/shinhf/safety-belt/issues/6), [#8](https://github.com/shinhf/safety-belt/issues/8)) |
<!-- /arc42-generated -->

<!-- arc42-manual: The priority order above is derived from the briefs. Confirm it or reorder it. The product-owner brief ranks "comprehension, completion and a visible intent/action mismatch" highly, so goal 3 could rank above goal 2. -->
<!-- /arc42-manual -->

## 1.3 Stakeholders

<!-- arc42-generated -->
| Role | Contact | Expectations |
|------|---------|-------------|
| Project owner (the user directing the work) | See the manual block below | Keeps authority over product direction and external commitments. No planning artifact authorizes payments, deployment, publication or interaction with a real merchant (`safety-belt-mlh/AGENTS.md`, `safety-belt-mlh/agents/product-owner.md`). |
| Product owner (repository-local agent role) | `safety-belt-mlh/agents/product-owner.md` | Wants the smallest useful scope, observable acceptance criteria, a legitimate success path next to the protective intervention, and factual warnings that never declare a merchant fraudulent. |
| Delivery reviewer (repository-local agent role) | `safety-belt-mlh/agents/delivery-reviewer.md` | Wants every submit path enforced, approval tied to current terms, unknown terms stopped, falsifiable criteria, and no claims beyond the owned fixture. |
| Developers implementing #1–#8 | See the manual block below | Need a shared data contract, a pinned stack and runnable checks: [docs/technical-decisions.md](../docs/technical-decisions.md), [docs/mvp-backlog.md](../docs/mvp-backlog.md). |
| Demo end user (persona) | Not a real person | An ordinary consumer who needs one PDF conversion and could miss what a low-price trial leads to. Expects a clear explanation and a way to still finish the task (`safety-belt-mlh/inbox/2026-11-13_pdf-checkout-subscription-mvp.md`). |
| Demo audience or evaluators | See the manual block below | Expect a roughly two-minute demonstration in which every result can be traced to service outcome records and replay is clearly labelled. The scenario mentions a submission deadline and possible sponsor or model-integration eligibility, but does not say who the audience is. |
<!-- /arc42-generated -->

<!-- arc42-manual: Add contact names or handles for the project owner and the developers. Name the demo audience (for example, a hackathon jury or a sponsor), its submission deadline, and any sponsor eligibility rules that apply to the Gemini integration. -->
<!-- /arc42-manual -->
