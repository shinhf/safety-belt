# 9. Architecture Decisions

<!-- arc42: Important, expensive, large scale or risky architecture decisions
including rationals. With "architecture decisions" we mean those decisions
that affect the structure, non-functional characteristics, dependencies,
interfaces, or construction techniques. -->

<!-- arc42-generated -->
Tasks 1–7 are implemented on `main` (`9b8199e`). Task 8 (live evaluation) part A is on `main` (`dbb2e35`); the rest is in progress. "Accepted" means a project source records the decision. "Implemented" means the code on `main` follows it. "Proposed" means the question is raised and no owner decision is recorded. No decision here is backed by a measured prevention result; the task 3 smoke check shows the integration works, not how accurate the model is.

Main sources:

- [docs/technical-decisions.md](../docs/technical-decisions.md): planning decision of 13 November 2026, stack table, shared implementation contract, and the "Gemini API choice" section with the task 3 live evidence.
- [docs/mvp-backlog.md](../docs/mvp-backlog.md) and GitHub issues [#1](https://github.com/shinhf/safety-belt/issues/1) to [#8](https://github.com/shinhf/safety-belt/issues/8). Issue and board states were not rechecked for this update.
- Code on `main`: `src/server.js`, `src/gemini.js`, `src/domain/*.js`, `package.json`, `.nvmrc`.
- Commit history: `72dbc54` (MVP scope), `26b6964` (Hydrogen replaces Flash), `3488f2c` … `f6f5c69` (tasks 1–6), `8766645` and `9b8199e` (task 7), `dbb2e35` (task 8 part A), `a84054a` and `9e41b5e` (task 3 live evidence).
- Local planning material in `safety-belt-mlh/`. The repository `.gitignore` excludes this folder, so these links work only in a local checkout that contains it:
  [AGENTS.md](../safety-belt-mlh/AGENTS.md), [MVP technologies](../safety-belt-mlh/inbox/2026-11-13_safety-belt-mvp-technologies.md), [PDF checkout scenario](../safety-belt-mlh/inbox/2026-11-13_pdf-checkout-subscription-mvp.md), [plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md) (documentation findings).

Related sections: [4. Solution Strategy](04-solution-strategy.md), [5. Building Block View](05-building-block-view.md), [8. Crosscutting Concepts](08-crosscutting-concepts.md), [11. Risks and Technical Debt](11-risks-and-technical-debt.md).

## Decision overview

| ADR | Decision | Status | Issues |
|-----|----------|--------|--------|
| [ADR-001](#adr-001-demonstrate-on-one-owned-fictional-checkout-only) | Demonstrate on one owned fictional checkout only | Accepted, implemented | #1, #6, #8 |
| [ADR-002](#adr-002-one-nodejs-24-service-with-built-in-modules-and-no-framework) | One Node.js 24 service with built-in modules and no framework | Accepted, implemented | #1, #4, #5 |
| [ADR-003](#adr-003-vanilla-html-css-and-javascript-with-no-build-step) | Vanilla HTML, CSS and JavaScript with no build step | Accepted, implemented | #1, #6 |
| [ADR-004](#adr-004-gemini-38-flash-as-the-billing-interpreter) | Gemini 3.8 Flash as the billing interpreter | Superseded by ADR-005 | #3, #8 |
| [ADR-005](#adr-005-gemini-4-hydrogen-over-rest-with-no-sdk-as-the-only-interpreter) | Gemini 4 Hydrogen over REST, with no SDK, as the only interpreter | Accepted, implemented | #3, #8 |
| [ADR-006](#adr-006-the-model-interprets-deterministic-policy-authorizes) | The model interprets; deterministic policy authorizes | Accepted, implemented | #3, #4 |
| [ADR-007](#adr-007-explicit-validator-instead-of-a-schema-library) | Explicit validator instead of a schema library | Accepted, implemented | #3 |
| [ADR-008](#adr-008-in-memory-single-session-state-with-no-database) | In-memory single-session state with no database | Accepted, implemented | #1, #5 |
| [ADR-009](#adr-009-single-use-execution-grants-bound-to-revisions-at-one-execution-boundary) | Single-use execution grants bound to revisions, at one execution boundary | Accepted, implemented | #4, #5 |
| [ADR-010](#adr-010-independent-intent-capture-and-no-subscription-override) | Independent intent capture and no subscription override | Accepted, implemented | #2, #6 |
| [ADR-011](#adr-011-nodetest-and-playwright-test-with-chromium-labelled-replay-separate-live-evaluation) | `node:test` and Playwright Test with Chromium; labelled replay; separate live evaluation | Accepted; browser suite on `main`, live eval part A on `main` | #7, #8 |
| [ADR-012](#adr-012-gemini-api-surface-generatecontent-on-v1beta) | Gemini API surface: `generateContent` on `v1beta` | Accepted, implemented | #3 |
| [ADR-013](#adr-013-rest-field-for-structured-output-responsemimetype--responsejsonschema) | REST field for structured output: `responseMimeType` + `responseJsonSchema` | Accepted, implemented | #3 |
| [ADR-014](#adr-014-thinking-level-for-gemini-4-hydrogen-low-provisional) | Thinking level for Gemini 4 Hydrogen: `LOW` (provisional) | Accepted provisionally; #8 confirms | #3, #8 |
| [ADR-015](#adr-015-nodejs-24-maintenance-lts-or-nodejs-26-active-lts) | Node.js 24 (Maintenance LTS) or Node.js 26 (Active LTS) | Proposed (open) | #1, #7 |
| [ADR-016](#adr-016-clarify-takes-precedence-over-conflict) | CLARIFY takes precedence over CONFLICT | Proposed; implemented, needs owner confirmation | #4, #6 |

## ADR Format

Each decision uses this structure: Date, Status, Context, Decision, Alternatives considered, Consequences and Sources. Status is one of Proposed, Accepted, Deprecated or Superseded by ADR-NNN, optionally followed by "implemented".

---

### ADR-001: Demonstrate on one owned fictional checkout only

- **Date:** 2026-11-13
- **Status:** Accepted, implemented (task 1, `src/domain/checkout.js`)
- **Context:** A page cannot show what a merchant will secretly charge later, and a fixture that blocks submission does not prove that arbitrary checkouts can be intercepted ([AGENTS.md](../safety-belt-mlh/AGENTS.md), "Context and evidence"). The motivating consumer report (BBB Scam Tracker 1218456) is a firsthand allegation. It does not establish the device used, the exact checkout wording or a last-second change to the transaction ([scenario](../safety-belt-mlh/inbox/2026-11-13_pdf-checkout-subscription-mvp.md), "Real-world motivation and evidence limits").
- **Decision:** The MVP uses one owned desktop-browser checkout at the fictional merchant **Paperlane Demo**, with seven variants (USD 1 one-off, USD 1 trial then USD 49.95 monthly, USD 3 one-off, EUR 1, a different merchant, missing terms, contradictory terms). Documents and payment state are synthetic. Payment and conversion are a **simulated completion** transition. There is no PDF engine, card form, payment processor, browser extension, real merchant integration, deployment, account system or subscription enrollment. The only claim is: "On this supported checkout, Safety Belt pauses disclosed billing commitments that conflict with the user's explicit intent."
- **Alternatives considered:**
  - Desktop remote-access refund scams. They were rejected because they need bank-verified transaction history and involve offline cash handovers ([pdf-checkout-history.md](../safety-belt-mlh/.agents/skills/safety-belt-scenarios/references/pdf-checkout-history.md)).
  - Local screen redaction on NPU and GPU hardware ([option-b-t2-t3-npu-gpu.md](../safety-belt-mlh/inbox/option-b-t2-t3-npu-gpu.md)). It is marked "Historical scope, superseded 2026-11-13" and is excluded in [docs/technical-decisions.md](../docs/technical-decisions.md).
  - A browser extension and third-party checkout integration. These are deliberately left out of the active board as P1 work.
- **Consequences:**
  - (+) The fixture holds the exact commitment it would execute, so outcome truth is service-owned and the mechanism can be shown.
  - (+) No real money, personal data or merchant branding is involved.
  - (-) The MVP is no evidence of protection on third-party sites, of hidden-charge detection or of fraud prevention. Every demo surface must say so ([#6](https://github.com/shinhf/safety-belt/issues/6), [#8](https://github.com/shinhf/safety-belt/issues/8)).
- **Sources:** README.md; docs/technical-decisions.md (closing paragraph); docs/mvp-backlog.md (P1 exclusions); issues #1, #6, #8; `src/domain/checkout.js`.

### ADR-002: One Node.js 24 service with built-in modules and no framework

- **Date:** 2026-11-13
- **Status:** Accepted, implemented (`src/server.js`)
- **Context:** The MVP needs a few fixed routes, one outbound model request, opaque grant IDs and policy tests. It does not process real documents or run local ML.
- **Decision:** One local Node.js 24 process, managed with npm, serves the browser flow and fixed JSON routes on `127.0.0.1`. The runtime uses only built-in modules: `node:http`, `node:fs/promises`, global `fetch`, `node:crypto` and `node:test`. `.nvmrc` pins 24.20.0 and `package.json` `engines` requires `>=24.20.0 <25`. There are no runtime dependencies and no provider SDK; the only dev dependency is `@playwright/test` 1.65.1 (task 7).
- **Alternatives considered:**
  - Python. The [MVP technologies note](../safety-belt-mlh/inbox/2026-11-13_safety-belt-mvp-technologies.md) says Python "remains suitable", but document processing and local ML are outside the MVP.
  - The historical Python 3.12 stack with Streamlit and `google-genai` ([research-technical.md](../safety-belt-mlh/inbox/research-technical.md), "Three Recommended Stacks").
- **Consequences:**
  - (+) One language covers the UI scripts, the service, the policy and the tests, and the runtime has no third-party dependencies.
  - (-) Protections a framework would provide are written by hand in `src/server.js`: a 4096-byte body cap, Host and Origin checks, a field allowlist, a static-file allowlist and security headers (see [8.7](08-crosscutting-concepts.md)).
  - (-) Node.js 24 is now Maintenance LTS (see ADR-015).
- **Sources:** docs/technical-decisions.md ("One coherent stack"); issue #1; `package.json`, `.nvmrc`.

### ADR-003: Vanilla HTML, CSS and JavaScript with no build step

- **Date:** 2026-11-13
- **Status:** Accepted, implemented (`public/`)
- **Context:** The flow is one same-origin desktop-browser page with intent confirmation, checkout review, a pause explanation and simulated completion.
- **Decision:** The Node service serves `index.html`, `app.js` and `styles.css` from a fixed allowlist. There is no SPA framework, bundler or design system. One native form `submit` handler covers the Pay button and Enter, and model, merchant and evidence strings are written with `textContent`, never as HTML.
- **Alternatives considered:** Streamlit demo panels (historical, [research-technical.md](../safety-belt-mlh/inbox/research-technical.md) group K). An SPA framework, which [docs/technical-decisions.md](../docs/technical-decisions.md) calls unnecessary.
- **Consequences:**
  - (+) There is no build toolchain, and keyboard and Enter submission go through native form events ([#5](https://github.com/shinhf/safety-belt/issues/5), [#6](https://github.com/shinhf/safety-belt/issues/6)).
  - (-) Rendering text safely and handling accessibility (labels, focus, live regions) are manual work; task 7 checks them in Chromium.
- **Sources:** docs/technical-decisions.md; README.md; issue #6; `public/app.js`.

### ADR-004: Gemini 3.8 Flash as the billing interpreter

- **Date:** 2026-11-13
- **Status:** Superseded by ADR-005
- **Context:** The MVP needs one semantic interpreter for varied billing wording.
- **Decision (historical):** Commit `72dbc54` selected Gemini 3.8 Flash over REST with JSON Schema.
- **Consequences:** Commit `26b6964` replaced it in README.md, docs/technical-decisions.md and docs/mvp-backlog.md "at the user's request". The historical [research-technical.md](../safety-belt-mlh/inbox/research-technical.md) still shows `gemini-3.8-flash` through the Python SDK. That file is background and does not describe the current stack.
- **Sources:** `git show 72dbc54`, `git show 26b6964`.

### ADR-005: Gemini 4 Hydrogen over REST, with no SDK, as the only interpreter

- **Date:** 2026-11-13
- **Status:** Accepted, implemented (`src/gemini.js`). Account access verified by the task 3 smoke check on 2026-11-13.
- **Context:** The interpreter must extract variable amounts, intervals, trial durations and supporting evidence text, not only classify. The scenario named Jev as a candidate.
- **Decision:** One service-side REST call to **Gemini 4 Hydrogen** with structured JSON output, using the global `fetch`, with no SDK. `MODEL = 'gemini-4-hydrogen'` and `API_ROOT` are constants in code; the `GEMINI_MODEL` variable in `.env.example` is not read. The model receives only the merchant display name and the disclosure text, plus the fixed instruction and schema. The key comes from `GEMINI_API_KEY`. Timeout 10 seconds, no retries, every error fails closed.
- **Alternatives considered:**
  - Jev typed questions. Rejected because the MVP needs extraction as well as classification, and one structured-output call avoids a second extractor. [docs/technical-decisions.md](../docs/technical-decisions.md) calls this "an architectural judgment, not a comparative model benchmark".
  - The `google-genai` SDK (historical research).
  - Gemini 3.8 Flash (ADR-004).
- **Consequences:**
  - (+) There is one provider and one request shape, and the payload is small and free of private data.
  - (+) The smoke check returned `interpreted` for `trial-recurring` and `one-off-usd1` and `clarify` / `EVIDENCE_MISSING` for `missing-terms` (one live sample each).
  - (-) Model output stays untrusted (ADR-006, ADR-007). Accuracy is unmeasured until task 8.
  - (-) A first key returned HTTP 402 (credits depleted); a billing lapse makes every check `CLARIFY`.
- **Sources:** docs/technical-decisions.md ("Gemini API choice"); issues #3, #8; commits `26b6964`, `a84054a`, `9e41b5e`.

### ADR-006: The model interprets; deterministic policy authorizes

- **Date:** 2026-11-13
- **Status:** Accepted, implemented (`src/domain/policy.js`)
- **Context:** A model's interpretation is fallible and cannot authorize a mismatch ([delivery-reviewer.md](../safety-belt-mlh/agents/delivery-reviewer.md)). When no recurrence is detected, that does not prove a one-off purchase ([AGENTS.md](../safety-belt-mlh/AGENTS.md)).
- **Decision:** The model only produces an **interpretation**. The pure `decide()` checks the interpretation's freshness and evidence, its agreement with the owned commitment, then recurrence, merchant, document and action scope, currency and cap in integer cents against the intent. It returns `ALLOW`, `CONFLICT` or `CLARIFY` with reason codes. `/api/decide` takes no input from the request: it reads the server-held intent, snapshot and check. The model has no tools and no authorization capability.
- **Alternatives considered:** A keyword-only detector, which the scenario rejects as insufficient. Letting the model decide, which [AGENTS.md](../safety-belt-mlh/AGENTS.md) rules out.
- **Consequences:**
  - (+) Authorization is deterministic and tested without the provider (`test/domain/policy.test.js`, `test/integration/decide.test.js`).
  - (+) Prompt injection can at most distort an interpretation. It cannot grant execution.
  - (-) Wording the model misreads produces more `CLARIFY` pauses, so the one-off success path depends on model quality ([#8](https://github.com/shinhf/safety-belt/issues/8)).
  - (-) The implemented reason codes differ from the owner-approved table (see [8. Reason codes as implemented](08-crosscutting-concepts.md#reason-codes-as-implemented)).
- **Sources:** docs/technical-decisions.md ("Decision"); issue #4; AGENTS.md; `src/domain/policy.js`.

### ADR-007: Explicit validator instead of a schema library

- **Date:** 2026-11-13
- **Status:** Accepted, implemented (`src/domain/interpretation.js`)
- **Context:** The response contract is small and fixed. Gemini may silently strip unsupported schema keywords, and structured output does not guarantee semantically correct values ([plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md), item 4).
- **Decision:** `validateInterpretation()` checks the exact field set, enums, nullable non-negative safe-integer cents, a three-letter currency and at most 5 quotations of up to 500 characters. It then checks the merchant name, that every quotation appears verbatim in the disclosure, one-off/recurring consistency, and agreement with the owned commitment. Any failure leads to `CLARIFY`. The same module exports the `RESPONSE_SCHEMA` sent to Gemini.
- **Alternatives considered:** Ajv with draft 2020-12 (`ajv/dist/2020` plus `ajv-formats`), noted in plugin plan section 8, item 6.
- **Consequences:**
  - (+) There is no dependency, and all constraints are enforced locally, whatever the provider strips.
  - (-) The validator is custom security-relevant code; `test/domain/interpretation.test.js` covers malformed JSON, extra fields and fabricated quotations.
  - (-) Provenance proves a quote is in the disclosure, not that it supports `billingKind` (`shortcut:` comment in the code; task 8 measures it).
- **Sources:** docs/technical-decisions.md ("Interpretation"); issue #3; `src/domain/interpretation.js`.

### ADR-008: In-memory single-session state with no database

- **Date:** 2026-11-13
- **Status:** Accepted, implemented (`createSession()` in `src/domain/checkout.js`, held by `startServer()`)
- **Context:** The demo has one user, one session and one process. Atomicity matters at the execution boundary.
- **Decision:** One Node process holds one session object in memory: `checkout`, `outcomes`, `intent`, `checks`, `grants`. Reloading the page reads the same session through `GET /api/state`. `POST /api/reset` or a restart clears it. Check, consume and side effect run in one synchronous function with no `await`. There is no persistence, no multi-user support, no distributed lock and no database.
- **Alternatives considered:** A database or a distributed lock. [docs/technical-decisions.md](../docs/technical-decisions.md) ("Execution boundary") calls both unnecessary. Persistence is listed among the excluded P1 items in [docs/mvp-backlog.md](../docs/mvp-backlog.md).
- **Consequences:**
  - (+) Atomicity comes from the single-threaded event loop, with no infrastructure.
  - (-) A restart loses all state, and the design does not scale beyond one process. Both are acceptable for the demo. The single-process guarantee must hold: no worker threads or clustering.
  - (+) Tests start an independent session per server instance (`startServer({ port: 0 })`); revision counters are module-wide, so they never repeat within a process.
- **Sources:** docs/technical-decisions.md ("Shared implementation contract", "Execution boundary"); issue #5.

### ADR-009: Single-use execution grants bound to revisions, at one execution boundary

- **Date:** 2026-11-13
- **Status:** Accepted, implemented (`evaluate()` in `src/domain/policy.js`, `submit()` in `src/domain/execution.js`)
- **Context:** If the service checks a page and later submits mutable state, the race between check and submission stays open ([scenario](../safety-belt-mlh/inbox/2026-11-13_pdf-checkout-subscription-mvp.md), "Smallest build"). Late responses, replays and double clicks must not execute.
- **Decision:**
  - Only `ALLOW` mints an **execution grant**: a random 32-byte `base64url` id from `node:crypto`, mapped server-side to the intent id and revision, the checkout id and revision, merchant, document, action and a copy of the commitment.
  - There is no session id in the binding. With one session, non-repeating revisions make a pre-reset grant unusable instead.
  - The button, Enter and direct JSON submission all reach `submit()`.
  - `submit()` compares the current state with the grant, clears all grants and records the payment from the captured commitment, never from re-read state.
  - Intent confirmation, variant selection, a new stored check, every evaluation, a gate rejection, an execution and reset all clear grants.
  - Model responses carry revision tags; a late answer is returned as `stale` and stored nowhere.
  - At most one payment per run (`ALREADY_COMPLETED`).
- **Alternatives considered:** A disabled button or a cosmetic overlay, which [#5](https://github.com/shinhf/safety-belt/issues/5) and the scenario rule out as insufficient.
- **Consequences:**
  - (+) Stale approval, replay and change-away-and-back cases fail closed, and attempts are counted separately from executions.
  - (-) Every material field must be enumerated in the binding. `COMMITMENT_FIELDS` is the single list both the policy and the gate use, which reduces that risk.
- **Sources:** docs/technical-decisions.md ("Grant", "Execution boundary", "Observable truth"); issues #4, #5.

### ADR-010: Independent intent capture and no subscription override

- **Date:** 2026-11-13
- **Status:** Accepted, implemented (`src/domain/intent.js`, task 6 UI)
- **Context:** Checkout wording must never supply consent. The scenario allows fresh subscription consent "if subscription execution is supported".
- **Decision:** The user confirms intent only on Safety Belt's own form: one conversion, Paperlane Demo, a cap in USD cents (default 200), billing scope `one_off_only`, `confirmed: true`. Merchant text and model text cannot create or revise intent. "Review subscription terms" is a read-only `<details>` that sends no request. The gate refuses any non-one-off commitment (`NOT_ONE_OFF`). Subscription enrollment and its fresh-consent flow are optional future work.
- **Alternatives considered:** A fresh-consent flow for subscriptions, which the [scenario](../safety-belt-mlh/inbox/2026-11-13_pdf-checkout-subscription-mvp.md) permits and [docs/technical-decisions.md](../docs/technical-decisions.md) defers.
- **Consequences:**
  - (+) The MVP has no override path to secure.
  - (-) The scenario's acceptance row "User explicitly chooses to consider a subscription" is narrowed to "the original approval stays insufficient". The recovery is "Go back to the one-off checkout".
- **Sources:** docs/technical-decisions.md ("Source reconciliation", "Independent intent"); issues #2, #6; commit `f6f5c69`.

### ADR-011: `node:test` and Playwright Test with Chromium; labelled replay; separate live evaluation

- **Date:** 2026-11-13
- **Status:** Accepted. `node:test` layers and the Playwright suite (task 7) are implemented; the live eval (task 8) part A is on `main`, the rest is in progress.
- **Context:** Enforcement must be tested falsifiably, against the outcome state the service owns rather than UI messages, and without depending on a live key. Model quality must be reported honestly.
- **Decision:**
  - Domain and HTTP checks use `node:test` (`test/domain`, `test/integration`), with the server on an ephemeral port and a stubbed `fetch`.
  - Browser checks use Playwright Test 1.65.1 with Chromium, pinned in `package.json` and the lockfile. Instead of the planned `webServer`, `e2e/fixtures.js` starts a fresh `startServer({ port: 0 })` with a replay stub per test, so each test gets its own session and can control answer timing.
  - Replay answers (`test/fixtures/gemini-replay.json`, inline stubs) are labelled `replay` in the service output.
  - A separate live run (`npm run eval:gemini`) scores labelled synthetic disclosures in `eval/billing-cases.json` and writes a run record with model, API, prompt and schema hashes and git commit to `eval/runs/`. It reports raw results and makes no accuracy claim.
- **Alternatives considered:** Selenium and Python Playwright (historical research). Playwright's `webServer` option (planned; dropped for per-test servers).
- **Consequences:**
  - (+) The deterministic suite runs with no key and no deployment.
  - (+) Per-test servers isolate state, so specs can run in parallel.
  - (-) Chromium must be installable wherever the tests run (`npx playwright install chromium`; see [11. Risks](11-risks-and-technical-debt.md)).
- **Sources:** docs/technical-decisions.md; issues #7, #8; `playwright.config.js`, `e2e/fixtures.js`, `scripts/eval-gemini.js` (uncommitted).

---

### ADR-012: Gemini API surface: `generateContent` on `v1beta`

- **Date:** 2026-11-13 (decided)
- **Status:** Accepted, implemented. User decision during task 3.
- **Context:** According to [plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md), item 2, the Gemini docs label `generateContent` "legacy" and recommend the Interactions API for new projects, while `generateContent` "remains fully supported".
- **Decision:** The adapter calls `POST {API_ROOT}/models/gemini-4-hydrogen:generateContent` with `API_ROOT = https://generativelanguage.googleapis.com/v1beta`. Both constants live only in `src/gemini.js`.
- **Alternatives considered:** The Interactions API (one probe was made, but it hit the same HTTP 402 credit error, so it was not evaluated further).
- **Consequences:**
  - (+) `GET v1beta/models/gemini-4-hydrogen` lists `generateContent` among the supported methods, and the smoke check passed on it.
  - (-) `generateContent` may be deprecated later. Changing it means rewriting the request builder and the response parsing in `callModel`; ADR-005 and ADR-007 stay unchanged.
- **Sources:** docs/technical-decisions.md ("Gemini API choice"); `src/gemini.js`; commits `a84054a`, `9e41b5e`.

### ADR-013: REST field for structured output: `responseMimeType` + `responseJsonSchema`

- **Date:** 2026-11-13 (decided)
- **Status:** Accepted, implemented
- **Context:** [Plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md), item 3, records that the guide uses `generationConfig.responseFormat.text.{mimeType, schema}`, while the API reference and the JS examples use `responseMimeType` plus `responseJsonSchema`.
- **Decision:** `generationConfig()` sends `responseMimeType: 'application/json'` and `responseJsonSchema: RESPONSE_SCHEMA`. It is the only place that names the field.
- **Alternatives considered:** `responseFormat.text.{mimeType, schema}`; `responseSchema` (no longer documented).
- **Evidence:** `countTokens` with the exact production `generationConfig` returned HTTP 200, while controls with an unknown field returned HTTP 400 `INVALID_ARGUMENT`, so the API accepts the field. The smoke check returned schema-shaped JSON. Whether the provider *enforces* the schema is not measured.
- **Consequences:** If the provider ignored the schema, ADR-007 still turns any non-conforming output into `CLARIFY`. Safety does not depend on this choice; availability of `ALLOW` does.
- **Sources:** docs/technical-decisions.md ("Gemini API choice"); `src/gemini.js`.

### ADR-014: Thinking level for Gemini 4 Hydrogen: `LOW` (provisional)

- **Date:** 2026-11-13
- **Status:** Accepted provisionally. Implemented as `thinkingLevel: LOW`; task 8 must confirm it.
- **Context:** According to [plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md), item 5, Hydrogen ignores `temperature`, `topP` and `topK`, so deterministic sampling is not available. Thinking defaults to `high`, and the docs advise the lowest level that meets the quality bar. The provider timeout is 10 seconds with no retries.
- **Decision:** `thinkingConfig: { thinkingLevel: 'LOW' }`. The code marks it `shortcut: not yet chosen from an eval; task 8 picks the lowest level that meets the bar`. No sampling parameters are sent.
- **Evidence:** `countTokens` accepted `thinkingLevel: LOW` (an invalid value returned HTTP 400). The smoke check passed on three variants at `LOW`. Quality at `LOW` is not measured.
- **Consequences:** The level is part of the pinned interpreter configuration and is recorded in every eval run record. A change requires the task 8 set to run again.
- **Sources:** docs/technical-decisions.md ("Gemini API choice"); `src/gemini.js`.

### ADR-015: Node.js 24 (Maintenance LTS) or Node.js 26 (Active LTS)

- **Date:** 2026-11-13 (raised)
- **Status:** Proposed (open). Node.js 24 stays the recorded and implemented choice (ADR-002) until the owner decides.
- **Context:** [Plugin plan section 8](../safety-belt-mlh/planning/plugin-plan.md), item 1, records that Node.js 24 has been **Maintenance LTS since 2026-10-20** and that Node.js 26 "Lithium" is the Active LTS. The latest 24.x is 24.22.3. The repository pins **24.20.0** in `.nvmrc` and requires `>=24.20.0 <25` in `engines`. Node.js 24 bundles npm 11.19.x, which the npm docs label "Legacy" (item 8). The scripts rely on `node --env-file-if-exists` and `import.meta.main`.
- **Options:**
  1. Stay on Node.js 24 and raise the pin to the latest patched 24.x (at least 24.22.3 per the plugin plan).
  2. Move to Node.js 26 Active LTS. It has a longer support window, but `.nvmrc`, `engines`, the README and the docs must change.
- **Decision:** None yet.
- **Consequences:** Option 1 changes only `.nvmrc` and `engines`. Option 2 also changes ADR-002 and needs the full test suite rerun on 26.

### ADR-016: CLARIFY takes precedence over CONFLICT

- **Date:** 2026-11-13 (implemented in task 4)
- **Status:** Proposed. Implemented in `decide()`; the owner has not recorded it, and it differs from the proposal in the section 8 manual note.
- **Context:** CLARIFY codes (unusable approval or terms) and CONFLICT codes (terms outside the approval) can fire together. The section 8 manual note proposes "CONFLICT if any validated term conflicts, otherwise CLARIFY".
- **Decision (as implemented):** `decide()` returns every code that fired, CLARIFY codes first, and the decision is `CLARIFY` if any CLARIFY code fired. Conflict checks run on the owned commitment, independent of the model. `explain()` hides conflict reasons during a clarification and states disclosed terms only when they were validated.
- **Rationale (from the code comment):** when the disclosed terms or the approval are unusable, the user is asked to clarify rather than shown a conflict they could not have read.
- **Alternatives considered:** CONFLICT first, when a validated term conflicts (the manual-note proposal).
- **Consequences:**
  - (+) The pause never claims a term the disclosure did not clearly state. This matches OC3 (only disclosed terms are observable).
  - (+) Both options fail closed: neither produces `ALLOW`.
  - (-) A checkout that both hides its terms and would charge a subscription shows "needs clear terms", not "starts recurring charges".
- **Sources:** `src/domain/policy.js` (`decide` doc comment), `src/domain/explanation.js` (`reasonsFor`); issue #4.
<!-- /arc42-generated -->

<!-- arc42-manual: Record the owner's choice for ADR-012 to ADR-015 here (or move them to Accepted above) once #3 and #8 settle them. Add decisions not documented elsewhere, for example the demo deadline or who approves a change of model or runtime. -->
<!-- /arc42-manual -->
