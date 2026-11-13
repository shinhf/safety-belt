# 9. Architecture Decisions

<!-- arc42: Important, expensive, large scale or risky architecture decisions
including rationals. With "architecture decisions" we mean those decisions
that affect the structure, non-functional characteristics, dependencies,
interfaces, or construction techniques. -->

<!-- arc42-generated -->
No application code exists yet. Every decision below is a **planning decision** for the MVP. None of them is implemented, tested or measured. "Accepted" means a project source records the decision. "Proposed" means a source raises the question and no source records an answer.

Main sources:

- [docs/technical-decisions.md](../docs/technical-decisions.md) (planning decision of 13 November 2026, stack table and shared implementation contract)
- [docs/mvp-backlog.md](../docs/mvp-backlog.md) and GitHub issues [#1](https://github.com/shinhf/safety-belt/issues/1) to [#8](https://github.com/shinhf/safety-belt/issues/8). All eight are open, have no comments and are in `Todo` on the [MVP board](https://github.com/users/shinhf/projects/11/views/1).
- Commit history: `72dbc54` (MVP scope, stack and backlog) and `26b6964` (Gemini 4 Hydrogen replaces Gemini 3.8 Flash), both from 2026-11-13.
- Local planning material in `safety-belt-mlh/`. The repository `.gitignore` excludes this folder, so these links work only in a local checkout that contains it:
  [AGENTS.md](../safety-belt-mlh/AGENTS.md), [MVP technologies](../safety-belt-mlh/inbox/2026-11-13_safety-belt-mvp-technologies.md), [PDF checkout scenario](../safety-belt-mlh/inbox/2026-11-13_pdf-checkout-subscription-mvp.md), [plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md) (documentation findings).

Related sections: [4. Solution Strategy](04-solution-strategy.md), [5. Building Block View](05-building-block-view.md), [8. Crosscutting Concepts](08-crosscutting-concepts.md), [11. Risks and Technical Debt](11-risks-and-technical-debt.md).

## Decision overview

| ADR | Decision | Status | Issues |
|-----|----------|--------|--------|
| [ADR-001](#adr-001-demonstrate-on-one-owned-fictional-checkout-only) | Demonstrate on one owned fictional checkout only | Accepted | #1, #6, #8 |
| [ADR-002](#adr-002-one-nodejs-24-service-with-built-in-modules-and-no-framework) | One Node.js 24 service with built-in modules and no framework | Accepted | #1, #4, #5 |
| [ADR-003](#adr-003-vanilla-html-css-and-javascript-with-no-build-step) | Vanilla HTML, CSS and JavaScript with no build step | Accepted | #1, #6 |
| [ADR-004](#adr-004-gemini-38-flash-as-the-billing-interpreter) | Gemini 3.8 Flash as the billing interpreter | Superseded by ADR-005 | #3, #8 |
| [ADR-005](#adr-005-gemini-4-hydrogen-over-rest-with-no-sdk-as-the-only-interpreter) | Gemini 4 Hydrogen over REST, with no SDK, as the only interpreter | Accepted | #3, #8 |
| [ADR-006](#adr-006-the-model-interprets-deterministic-policy-authorizes) | The model interprets; deterministic policy authorizes | Accepted | #3, #4 |
| [ADR-007](#adr-007-explicit-validator-instead-of-a-schema-library) | Explicit validator instead of a schema library | Accepted | #3 |
| [ADR-008](#adr-008-in-memory-single-session-state-with-no-database) | In-memory single-session state with no database | Accepted | #1, #5 |
| [ADR-009](#adr-009-single-use-execution-grants-bound-to-revisions-at-one-execution-boundary) | Single-use execution grants bound to revisions, at one execution boundary | Accepted | #4, #5 |
| [ADR-010](#adr-010-independent-intent-capture-and-no-subscription-override) | Independent intent capture and no subscription override | Accepted | #2, #6 |
| [ADR-011](#adr-011-nodetest-and-playwright-test-with-chromium-labelled-replay-separate-live-evaluation) | `node:test` and Playwright Test with Chromium; labelled replay; separate live evaluation | Accepted | #7, #8 |
| [ADR-012](#adr-012-gemini-api-surface-generatecontent-or-interactions-api) | Gemini API surface: `generateContent` or Interactions API | Proposed (open) | #3 |
| [ADR-013](#adr-013-rest-field-for-structured-output) | REST field for structured output | Proposed (open) | #3 |
| [ADR-014](#adr-014-thinking-level-for-gemini-4-hydrogen) | Thinking level for Gemini 4 Hydrogen | Proposed (open) | #3, #8 |
| [ADR-015](#adr-015-nodejs-24-maintenance-lts-or-nodejs-26-active-lts) | Node.js 24 (Maintenance LTS) or Node.js 26 (Active LTS) | Proposed (open) | #1, #7 |

## ADR Format

Each decision uses this structure: Date, Status, Context, Decision, Alternatives considered, Consequences and Sources. Status is one of Proposed, Accepted, Deprecated or Superseded by ADR-NNN.

---

### ADR-001: Demonstrate on one owned fictional checkout only

- **Date:** 2026-11-13
- **Status:** Accepted
- **Context:** A page cannot show what a merchant will secretly charge later, and a fixture that blocks submission does not prove that arbitrary checkouts can be intercepted ([AGENTS.md](../safety-belt-mlh/AGENTS.md), "Context and evidence"). The motivating consumer report (BBB Scam Tracker 1218456) is a firsthand allegation. It does not establish the device used, the exact checkout wording or a last-second change to the transaction ([scenario](../safety-belt-mlh/inbox/2026-11-13_pdf-checkout-subscription-mvp.md), "Real-world motivation and evidence limits").
- **Decision:** The MVP uses one owned desktop-browser checkout at the fictional merchant **Paperlane Demo**. It uses synthetic documents and payment state. Payment and conversion are a **simulated completion** transition. There is no PDF engine, card form, payment processor, browser extension, real merchant integration, deployment, account system or subscription enrollment ([README.md](../README.md), [docs/mvp-backlog.md](../docs/mvp-backlog.md) intro). The only claim is: "On this supported checkout, Safety Belt pauses disclosed billing commitments that conflict with the user's explicit intent."
- **Alternatives considered:**
  - Desktop remote-access refund scams. They were rejected because they need bank-verified transaction history and involve offline cash handovers ([pdf-checkout-history.md](../safety-belt-mlh/.agents/skills/safety-belt-scenarios/references/pdf-checkout-history.md)).
  - Local screen redaction on NPU and GPU hardware ([option-b-t2-t3-npu-gpu.md](../safety-belt-mlh/inbox/option-b-t2-t3-npu-gpu.md)). It is marked "Historical scope, superseded 2026-11-13" and is excluded in [docs/technical-decisions.md](../docs/technical-decisions.md).
  - A browser extension and third-party checkout integration. These are deliberately left out of the active board as P1 work.
- **Consequences:**
  - (+) The fixture holds the exact commitment it would execute, so outcome truth is service-owned and the mechanism can be shown.
  - (+) No real money, personal data or merchant branding is involved.
  - (-) The MVP is no evidence of protection on third-party sites, of hidden-charge detection or of fraud prevention. Every demo surface must say so ([#6](https://github.com/shinhf/safety-belt/issues/6), [#8](https://github.com/shinhf/safety-belt/issues/8)).
- **Sources:** README.md; docs/technical-decisions.md (closing paragraph); docs/mvp-backlog.md (P1 exclusions); issues #1, #6, #8.

### ADR-002: One Node.js 24 service with built-in modules and no framework

- **Date:** 2026-11-13
- **Status:** Accepted
- **Context:** The MVP needs a few fixed routes, one outbound model request, opaque grant IDs and policy tests. It does not process real documents or run local ML.
- **Decision:** One local Node.js 24 LTS process, managed with npm, serves the browser flow and fixed JSON routes on `127.0.0.1`. The runtime uses only built-in modules: `node:http`, global `fetch`, `node:crypto` and `node:test`. The project pins a supported, patched 24.x release at setup. There is no runtime framework and no provider SDK.
- **Alternatives considered:**
  - Python. The [MVP technologies note](../safety-belt-mlh/inbox/2026-11-13_safety-belt-mvp-technologies.md) says Python "remains suitable", but document processing and local ML are outside the MVP.
  - The historical Python 3.12 stack with Streamlit and `google-genai` ([research-technical.md](../safety-belt-mlh/inbox/research-technical.md), "Three Recommended Stacks").
- **Consequences:**
  - (+) One language covers the UI scripts, the service, the policy and the tests, and the runtime has no third-party dependencies.
  - (-) Protections a framework would provide must be written by hand: a request body size limit, Host and Origin checks, an asset allowlist and no permissive CORS ([#1](https://github.com/shinhf/safety-belt/issues/1)). [Plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md) item 7 notes that core `http` has no body size limit.
  - (-) Node.js 24 is now Maintenance LTS (see ADR-015).
- **Sources:** docs/technical-decisions.md ("One coherent stack"); issue #1 (first acceptance criterion).

### ADR-003: Vanilla HTML, CSS and JavaScript with no build step

- **Date:** 2026-11-13
- **Status:** Accepted
- **Context:** The flow is one same-origin desktop-browser page with intent confirmation, checkout review, a pause explanation and simulated completion.
- **Decision:** The Node service serves plain HTML, CSS and vanilla JavaScript from an allowlist. There is no SPA framework, bundler or design system. Native form submission reaches the gate, and model, merchant and evidence strings are rendered as text, never as HTML.
- **Alternatives considered:** Streamlit demo panels (historical, [research-technical.md](../safety-belt-mlh/inbox/research-technical.md) group K). An SPA framework, which [docs/technical-decisions.md](../docs/technical-decisions.md) calls unnecessary.
- **Consequences:**
  - (+) There is no build toolchain, and keyboard and Enter submission go through native form events ([#5](https://github.com/shinhf/safety-belt/issues/5), [#6](https://github.com/shinhf/safety-belt/issues/6)).
  - (-) Rendering text safely and handling accessibility (labels, focus) are manual work, and [#6](https://github.com/shinhf/safety-belt/issues/6) and [#7](https://github.com/shinhf/safety-belt/issues/7) must check them.
- **Sources:** docs/technical-decisions.md; README.md ("Selected technologies"); issue #6.

### ADR-004: Gemini 3.8 Flash as the billing interpreter

- **Date:** 2026-11-13
- **Status:** Superseded by ADR-005
- **Context:** The MVP needs one semantic interpreter for varied billing wording.
- **Decision (historical):** Commit `72dbc54` selected Gemini 3.8 Flash over REST with JSON Schema.
- **Consequences:** Commit `26b6964` replaced it in README.md, docs/technical-decisions.md and docs/mvp-backlog.md "at the user's request". The historical [research-technical.md](../safety-belt-mlh/inbox/research-technical.md) still shows `gemini-3.8-flash` through the Python SDK. That file is background and does not describe the current stack.
- **Sources:** `git show 72dbc54`, `git show 26b6964`.

### ADR-005: Gemini 4 Hydrogen over REST, with no SDK, as the only interpreter

- **Date:** 2026-11-13
- **Status:** Accepted (planning). No account-specific access is verified yet.
- **Context:** The interpreter must extract variable amounts, intervals, trial durations and supporting evidence text, not only classify. The scenario named Jev as a candidate.
- **Decision:** One service-side REST call to **Gemini 4 Hydrogen** (`gemini-4-hydrogen`) with structured JSON output, using the global `fetch`, with no SDK. The project pins the model ID and the API revision used by the live smoke check ([#3](https://github.com/shinhf/safety-belt/issues/3)). The model receives only the public merchant display name, the exact disclosure text and fixed instructions and schema. It never receives the intent, hidden execution fields, evaluation labels, document contents or personal or payment data. The key stays in the service environment (`GEMINI_API_KEY` in `.env`, see `.env.example`). The timeout is 10 seconds and errors fail closed.
- **Alternatives considered:**
  - Jev typed questions. Rejected because the MVP needs extraction as well as classification, and one structured-output call avoids a second extractor. [docs/technical-decisions.md](../docs/technical-decisions.md) calls this "an architectural judgment, not a comparative model benchmark".
  - The `google-genai` SDK (historical research).
  - Gemini 3.8 Flash (ADR-004).
- **Consequences:**
  - (+) There is one provider and one request shape, and the payload is small and free of private data.
  - (-) The REST API surface, the structured-output field and the thinking level are still open (ADR-012 to ADR-014).
  - (-) Model output stays untrusted (ADR-006, ADR-007), and integration cannot be claimed until a recorded live smoke check passes.
- **Sources:** docs/technical-decisions.md (stack table, "Minimum privacy/security"); README.md; issues #3, #8; commit `26b6964`.

### ADR-006: The model interprets; deterministic policy authorizes

- **Date:** 2026-11-13
- **Status:** Accepted
- **Context:** A model's interpretation is fallible and cannot authorize a mismatch ([delivery-reviewer.md](../safety-belt-mlh/agents/delivery-reviewer.md)). When no recurrence is detected, that does not prove a one-off purchase ([AGENTS.md](../safety-belt-mlh/AGENTS.md)).
- **Decision:** The model only produces an **interpretation**. A pure local policy comparator checks price (in integer cents), currency, merchant, action and document scope, and recurrence against the independently approved intent. It returns `ALLOW`, `CONFLICT` or `CLARIFY` with stable reason codes. Only explicit one-off terms within scope and at or below the cap can produce `ALLOW`. A missing, invalid, failed, uncertain or stale interpretation, or any disagreement between the interpretation and the fixture's execution commitment, cannot produce `ALLOW` (the flow fails closed). The model has no tools and no authorization capability.
- **Alternatives considered:** A keyword-only detector, which the scenario rejects as insufficient. Letting the model decide, which [AGENTS.md](../safety-belt-mlh/AGENTS.md) rules out.
- **Consequences:**
  - (+) Authorization is deterministic and testable without the provider ([#4](https://github.com/shinhf/safety-belt/issues/4), `node:test`).
  - (+) Prompt injection can at most distort an interpretation. It cannot grant execution.
  - (-) Wording the model misreads produces more `CLARIFY` pauses, so the one-off success path depends on model quality ([#8](https://github.com/shinhf/safety-belt/issues/8)).
- **Sources:** docs/technical-decisions.md ("Decision"); issue #4; AGENTS.md.

### ADR-007: Explicit validator instead of a schema library

- **Date:** 2026-11-13
- **Status:** Accepted
- **Context:** The response contract is small and fixed. Gemini may silently strip unsupported schema keywords, and structured output does not guarantee semantically correct values ([plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md), item 4).
- **Decision:** A hand-written validator in the service checks required and conditional fields, enums, nullability, nonnegative safe-integer cents, and the absence of extra fields. It also checks that every quotation appears verbatim in the snapshot disclosure, and it cross-checks material fields against the fixture's execution commitment. Any failure leads to `CLARIFY`. "No provider SDK, schema library or second model is planned" ([docs/technical-decisions.md](../docs/technical-decisions.md), line 28).
- **Alternatives considered:** Ajv with draft 2020-12 (`ajv/dist/2020` plus `ajv-formats`), noted in plugin plan section 8, item 6.
- **Consequences:**
  - (+) There is no dependency, and all constraints are enforced locally, whatever the provider strips.
  - (-) The validator is custom security-relevant code and needs focused tests (malformed JSON, extra fields, fabricated quotations), as [#3](https://github.com/shinhf/safety-belt/issues/3) and [#7](https://github.com/shinhf/safety-belt/issues/7) require.
- **Sources:** docs/technical-decisions.md (line 28, "Interpretation"); issue #3.

### ADR-008: In-memory single-session state with no database

- **Date:** 2026-11-13
- **Status:** Accepted
- **Context:** The demo has one user, one session and one process. Atomicity matters at the execution boundary.
- **Decision:** One Node process holds a single demo session in memory: intent, pending checks, grants and outcome records. Reloading the page reconnects to that session. An explicit reset or a process restart clears it. Check, consume and side effect run in one synchronous critical section with no `await`. There is no persistence, no multi-user support, no distributed lock and no database.
- **Alternatives considered:** A database or a distributed lock. [docs/technical-decisions.md](../docs/technical-decisions.md) ("Execution boundary") calls both unnecessary. Persistence is listed among the excluded P1 items in [docs/mvp-backlog.md](../docs/mvp-backlog.md).
- **Consequences:**
  - (+) Atomicity comes from the single-threaded event loop, with no infrastructure.
  - (-) A restart loses all state, and the design does not scale beyond one process. Both are acceptable for the demo. The single-process guarantee must hold: no worker threads or clustering.
- **Sources:** docs/technical-decisions.md ("Shared implementation contract", "Execution boundary"); issue #5.

### ADR-009: Single-use execution grants bound to revisions, at one execution boundary

- **Date:** 2026-11-13
- **Status:** Accepted
- **Context:** If the service checks a page and later submits mutable state, the race between check and submission stays open ([scenario](../safety-belt-mlh/inbox/2026-11-13_pdf-checkout-subscription-mvp.md), "Smallest build"). Late responses, replays and double clicks must not execute.
- **Decision:**
  - Only `ALLOW` mints an **execution grant**: an opaque, single-use ID generated by the service with `node:crypto`. It is bound to the session, the intent ID and revision, the checkout ID and revision, and every material commitment field.
  - The button, Enter and direct JSON submission all reach one service handler.
  - That handler compares the current state with the grant, consumes the grant and executes the captured immutable commitment, never the re-read mutable state.
  - Any change to the intent or snapshot, a reset or a completed action invalidates the grant.
  - Model responses carry revision tags and must match the current revisions before they can affect a decision.
  - There is at most one payment per demo intent and document.
- **Alternatives considered:** A disabled button or a cosmetic overlay, which [#5](https://github.com/shinhf/safety-belt/issues/5) and the scenario rule out as insufficient.
- **Consequences:**
  - (+) Stale approval, replay and change-away-and-back cases fail closed, and attempts are counted separately from executions.
  - (-) Every material field must be enumerated in the grant binding. A missing field would reopen the race.
- **Sources:** docs/technical-decisions.md ("Grant", "Execution boundary", "Observable truth"); issues #4, #5.

### ADR-010: Independent intent capture and no subscription override

- **Date:** 2026-11-13
- **Status:** Accepted
- **Context:** Checkout wording must never supply consent. The scenario allows fresh subscription consent "if subscription execution is supported".
- **Decision:** The user confirms intent only on Safety Belt's own surface: one conversion, Paperlane Demo, at most USD 2 (200 cents), billing scope `one_off_only`. Merchant text and model text cannot create or revise intent. "Review subscription terms" is read-only and grants nothing. The MVP has no action that overrides the pause to authorize a subscription. Subscription enrollment and its fresh-consent flow are optional future work.
- **Alternatives considered:** A fresh-consent flow for subscriptions, which the [scenario](../safety-belt-mlh/inbox/2026-11-13_pdf-checkout-subscription-mvp.md) permits and [docs/technical-decisions.md](../docs/technical-decisions.md) defers.
- **Consequences:**
  - (+) The MVP has no override path to secure.
  - (-) The scenario's acceptance row "User explicitly chooses to consider a subscription" is narrowed to "the original approval stays insufficient". No recurring execution path exists.
- **Sources:** docs/technical-decisions.md ("Source reconciliation", "Independent intent"); issues #2, #6.

### ADR-011: `node:test` and Playwright Test with Chromium; labelled replay; separate live evaluation

- **Date:** 2026-11-13
- **Status:** Accepted
- **Context:** Enforcement must be tested falsifiably, against the outcome state the service owns rather than UI messages, and without depending on a live key. Model quality must be reported honestly.
- **Decision:**
  - Policy, grant and API checks use `node:test`.
  - Browser checks (click and Enter, term mutation, visible outcomes) use Playwright Test with Chromium, pinned through an npm lockfile and started against the local server.
  - Deterministic gate tests use fixed provider responses that are labelled as test doubles (replay).
  - A separate live run of `gemini-4-hydrogen` on at least eight independently labelled synthetic disclosures reports raw counts, failures and abstentions, with no accuracy claim ([#8](https://github.com/shinhf/safety-belt/issues/8)).
- **Alternatives considered:** Selenium and Python Playwright (historical research).
- **Consequences:**
  - (+) The deterministic suite runs with no key and no deployment.
  - (-) The live-model acceptance criteria stay open while provider access is missing.
  - (-) Chromium must be installable wherever the tests run (see [11. Risks](11-risks-and-technical-debt.md)).
- **Sources:** docs/technical-decisions.md (stack table, line 28); issues #7, #8.

---

### ADR-012: Gemini API surface: `generateContent` or Interactions API

- **Date:** 2026-11-13 (raised)
- **Status:** Proposed (open). [#3](https://github.com/shinhf/safety-belt/issues/3) must choose.
- **Context:** According to [plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md), item 2, the Gemini docs label `generateContent` "legacy" and recommend the Interactions API for new projects, while `generateContent` "remains fully supported". [docs/technical-decisions.md](../docs/technical-decisions.md) links the structured-output page but does not pick an API surface. This document has not verified these findings again.
- **Options:**
  1. `generateContent` (labelled legacy). Many examples exist and it is fully supported, but it may be deprecated during the project.
  2. Interactions API. The docs recommend it for new projects, but whether it supports structured output with `gemini-4-hydrogen` must be checked in the live smoke check.
- **Decision:** None yet. Decide during the live smoke check in #3, and record the chosen endpoint and API revision.
- **Consequences:** Either option keeps ADR-005 (REST, no SDK) and ADR-007 (local validation) unchanged. The request builder and the response parsing differ.

### ADR-013: REST field for structured output

- **Date:** 2026-11-13 (raised)
- **Status:** Proposed (open). It cannot be verified without a live key.
- **Context:** [Plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md), item 3, records that the guide uses `generationConfig.responseFormat.text.{mimeType, schema}`, while the API reference and the JS examples use `responseMimeType` plus `responseJsonSchema`. `responseSchema` (the OpenAPI subset) is no longer documented. Only a live call settles which field works.
- **Options:**
  1. `generationConfig.responseFormat.text.{mimeType, schema}`
  2. `generationConfig.responseMimeType` plus `responseJsonSchema`
  3. `responseSchema`. Not recommended because it is no longer documented.
- **Decision:** None yet. The #3 smoke check sends the fixed schema and records which form the pinned API revision accepts and enforces.
- **Consequences:** If the provider ignores the schema field without an error, the output may be unconstrained JSON. ADR-007 already turns any non-conforming output into `CLARIFY`, so safety does not depend on this choice. Availability of the `ALLOW` path does.

### ADR-014: Thinking level for Gemini 4 Hydrogen

- **Date:** 2026-11-13 (raised)
- **Status:** Proposed (open)
- **Context:** According to [plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md), item 5, Hydrogen ignores `temperature`, `topP` and `topK` (it returns deprecation-warning headers; the docs say 400 errors come in a future release), so deterministic sampling is not available. Thinking defaults to `high`, and the docs advise choosing the lowest level that meets the quality bar. The provider timeout is fixed at 10 seconds ([docs/technical-decisions.md](../docs/technical-decisions.md)).
- **Options:**
  1. Default (`high`). This may give the best interpretation quality. Inferred, not measured: it may also add latency that comes close to the 10-second timeout.
  2. A lower level, chosen with the #8 labelled set. It may be faster, and its quality must be confirmed on the core one-off and recurring phrasings.
- **Decision:** None yet. Choose the level in #8 by comparing raw results on the same labelled set, and record it with the model revision. Do not send sampling parameters.
- **Consequences:** The level becomes part of the pinned interpreter configuration. A change to it requires the #8 set to run again.

### ADR-015: Node.js 24 (Maintenance LTS) or Node.js 26 (Active LTS)

- **Date:** 2026-11-13 (raised)
- **Status:** Proposed (open). Node.js 24 stays the recorded choice (ADR-002) until the owner decides.
- **Context:** README.md and docs/technical-decisions.md say "Node.js 24 LTS". [Plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md), item 1, records that Node.js 24 has been **Maintenance LTS since 2026-10-20** and that Node.js 26 "Lithium" is the Active LTS. The latest 24.x is 24.22.3, and 24.20.0 is installed locally. Node.js 24 bundles npm 11.19.x, which the npm docs label "Legacy" (item 8). `.env.example` relies on `node --env-file`, which it describes as stable since Node.js 24.10.
- **Options:**
  1. Stay on Node.js 24 and pin the latest patched 24.x (at least 24.22.3 per the plugin plan). This matches every issue and the local install.
  2. Move to Node.js 26 Active LTS. It has a longer support window, but the docs, issues #1 and #2 and the tooling assumptions must be updated.
- **Decision:** None yet.
- **Consequences:** Option 1 needs no change to the backlog. Option 2 means changing ADR-002, issues #1 and #2 and the Playwright compatibility check (Playwright 1.65 no longer tests on Node.js 20; that does not affect 24 or 26).
<!-- /arc42-generated -->

<!-- arc42-manual: Record the owner's choice for ADR-012 to ADR-015 here (or move them to Accepted above) once #3 and #8 settle them. Add decisions not documented elsewhere, for example the demo deadline or who approves a change of model or runtime. -->
<!-- /arc42-manual -->
