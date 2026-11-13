# Safety Belt MVP implementation backlog

Business goal: complete a useful one-document task within explicit one-off payment boundaries, and pause a disclosed recurring commitment before execution.

Target: one fictional desktop checkout, Paperlane Demo; approve one conversion, USD 2 maximum, one payment, no subscription. Journey: synthetic document → separate intent confirmation → checkout interpretation → deterministic policy → current-state submission gate → explain the pause or complete one simulated conversion/payment.

All eight issues are P0. Optional P1 work is deliberately excluded from the active board: subscription enrollment/fresh recurring consent, browser extension/third-party checkout integration, multiple merchants, actual PDF processing, persistence, deployment and visual polish. No live payments, real documents, OS-wide protection, OCR, GPU/NPU stack, banking integration or hidden-charge detection is included.

See [technical decisions](technical-decisions.md) for source reconciliation, stack rationale, data contracts, security and the exact execution boundary. Acceptance criteria below are requirements for future implementation, not claims of passing checks. S/M estimates are relative, not a promise to fit the historical 3–4-hour sketch.

Verified resources: [private repository](https://github.com/shinhf/safety-belt) · [MVP board](https://github.com/users/shinhf/projects/11/views/1).

## Ordered tasks

| # | Task | Priority | Size | Direct dependencies | Technologies |
|---|---|---|---|---|---|
| 1 | [Build the owned checkout fixture and observable simulation state](https://github.com/shinhf/safety-belt/issues/1) | P0 | M | None | Node.js 24, npm, HTML/CSS/JavaScript |
| 2 | [Capture independent one-off intent and invalidate changed approval](https://github.com/shinhf/safety-belt/issues/2) | P0 | S | 1 | Node.js 24, HTML/JavaScript |
| 3 | [Interpret disclosed billing terms with one validated Gemini call](https://github.com/shinhf/safety-belt/issues/3) | P0 | M | 1 | Node.js fetch, Gemini 3.8 Flash REST, JSON Schema |
| 4 | [Enforce intent with deterministic policy and bound execution grants](https://github.com/shinhf/safety-belt/issues/4) | P0 | M | 2, 3 | Node.js, node:crypto, node:test |
| 5 | [Gate every submit path with atomic current-state and replay checks](https://github.com/shinhf/safety-belt/issues/5) | P0 | M | 4 | Node.js HTTP, node:test, Browser form events |
| 6 | [Explain paused commitments and recover to the one-off completion path](https://github.com/shinhf/safety-belt/issues/6) | P0 | S | 5 | HTML/CSS/JavaScript, Node.js API |
| 7 | [Verify browser enforcement, failure handling and privacy boundaries](https://github.com/shinhf/safety-belt/issues/7) | P0 | M | 6 | Playwright Test, Chromium, node:test, npm |
| 8 | [Measure the live model on billing paraphrases and rehearse the MVP demo](https://github.com/shinhf/safety-belt/issues/8) | P0 | S | 7 | Gemini REST, Node.js, Chromium |

<a id="task-1"></a>

## 1. Build the owned checkout fixture and observable simulation state

Create the local Node service and one plain browser flow for a synthetic document at Paperlane Demo. Implement immutable checkout snapshots and read-only outcome inspection under the shared contract in docs/technical-decisions.md. Keep submission unavailable until the gate is integrated.

## Business value

Provides a controlled end-to-end task and reliable outcome truth without real payments or PDF infrastructure.

## Acceptance criteria

- [ ] A documented local start command serves the fixture on 127.0.0.1 using a pinned patched Node 24.x release; runtime uses built-in modules and no frontend framework.
- [ ] The flow offers a synthetic document, checkout, and simulated conversion-completion state, with persistent visible simulation/fictional-merchant labeling; no upload, card entry, live payment, PDF engine or merchant integration exists.
- [ ] Variants include explicit USD 1 one-off; USD 1 today / seven-day trial / USD 49.95 monthly; USD 3 one-off; non-USD; changed merchant; missing/contradictory terms. Each contains real display text and a separate immutable execution commitment; do not return hidden evaluation labels as model input.
- [ ] Changing any material field or disclosure increments checkout revision. A change away and back still has a new revision. The rendered disclosure is the same snapshot text collected for interpretation.
- [ ] Read-only state shows attempted submissions, executions, payments, subscriptions and conversion status. Reset clears session state, including future intents/checks/grants; initial state has zero outcomes. No endpoint can yet execute a payment.
- [ ] Serve only allowlisted static assets/routes. Restrict Host/Origin and cross-origin mutations, validate/limit JSON input, omit permissive CORS, and keep environment files unavailable.

## Delivery

- Priority: **P0**
- Estimate: **M**
- Depends on: None
- Technologies: Node.js 24, npm, HTML/CSS/JavaScript

Shared contract and scope: [technical decisions](https://github.com/shinhf/safety-belt/blob/main/docs/technical-decisions.md). All side effects are simulated; this issue does not authorize live transactions or deployment.

<a id="task-2"></a>

## 2. Capture independent one-off intent and invalidate changed approval

Add Safety Belt's separate intent confirmation surface and service-owned intent record for one document conversion, chosen merchant, USD cap and one-off-only billing. Use the shared intent contract; checkout wording must never supply user consent.

## Business value

Establishes what the user actually approved so a low introductory charge cannot silently authorize a subscription.

## Acceptance criteria

- [ ] Before any check can allow, the user explicitly confirms one conversion of the selected synthetic document, Paperlane Demo, maximum USD 2 (200 cents), and one-off-only billing on a distinct Safety Belt surface.
- [ ] Store intent ID/revision, document/action, merchant, currency, cap and billing scope in the service. Validate finite nonnegative safe-integer cents; missing/invalid intent cannot allow.
- [ ] Only explicit confirmation changes the intent; checkout/model requests cannot create consent. Present the approved scope throughout review.
- [ ] Editing relevant approved fields requires a new confirmation/revision and invalidates pending checks/grants. Reset/process restart discards approval. Switching checkout variants does not silently change approved intent.
- [ ] Reviewing recurring terms or clicking any warning action cannot relax one-off-only intent; the MVP exposes no subscription-authorization override.

## Delivery

- Priority: **P0**
- Estimate: **S**
- Depends on: Task 1
- Technologies: Node.js 24, HTML/JavaScript

Shared contract and scope: [technical decisions](https://github.com/shinhf/safety-belt/blob/main/docs/technical-decisions.md). All side effects are simulated; this issue does not authorize live transactions or deployment.

<a id="task-3"></a>

## 3. Interpret disclosed billing terms with one validated Gemini call

Implement one service-side Gemini 3.8 Flash REST adapter using structured JSON output, the official supported API revision, and the fixed interpretation contract. Extract actual disclosure semantics and supporting text; keep authorization entirely outside the model.

## Business value

Makes the intervention understand varied billing wording instead of depending on a subscription keyword or a fabricated AI panel.

## Acceptance criteria

- [ ] Run and record one synthetic live-provider smoke check using the configured key/model/API revision before claiming integration. Pin gemini-3.8-flash and the verified revision; a missing key produces a clear unavailable state and cannot allow.
- [ ] Send only the public merchant display name and exact snapshot disclosure text plus fixed extraction instructions/schema. Never send intent, hidden execution fields, expected labels, document contents, card or personal data.
- [ ] Return upfront integer cents/currency, merchant, billing kind, renewal amount/interval, trial duration, evidence status and supporting quotations. Require explicit evidence of one-off billing; no recurring keyword is not enough.
- [ ] Validate required and conditional fields, enums, integers/nullability and quotation provenance locally. Reject extra/unsupported fields, malformed JSON, contradictory/missing/uncertain evidence and an interpretation inconsistent with the fixture commitment as CLARIFY.
- [ ] Key is service-only, ignored by Git, absent from browser assets/responses/logs. Use a fixed provider URL, bounded request body, 10-second timeout, sanitized errors and no automatic authorization fallback on HTTP/rate-limit/provider failure.
- [ ] Tag requests with intent and checkout revisions, carry tags through responses, and expose the actual input evidence and result status. Disclosure instructions cannot modify policy/intent or invoke tools. Recorded test responses are explicitly labeled replay.

## Delivery

- Priority: **P0**
- Estimate: **M**
- Depends on: Task 1
- Technologies: Node.js fetch, Gemini 3.8 Flash REST, JSON Schema

Shared contract and scope: [technical decisions](https://github.com/shinhf/safety-belt/blob/main/docs/technical-decisions.md). All side effects are simulated; this issue does not authorize live transactions or deployment.

<a id="task-4"></a>

## 4. Enforce intent with deterministic policy and bound execution grants

Implement a pure policy comparator and service-only grant issuance. Compare validated semantics and the owned execution commitment with the independently approved intent. Return ALLOW, CONFLICT or CLARIFY with factual reason codes.

## Business value

Ensures the model can explain terms but cannot authorize an over-cap charge, subscription, changed merchant or unrelated action.

## Acceptance criteria

- [ ] Current explicit USD 1 one-off terms, approved merchant/action/document and cap USD 2 produce ALLOW. USD 2 is allowed; USD 2.01 is rejected. Use integer-cent comparison, never floating-point price arithmetic.
- [ ] The USD 1 trial followed by USD 49.95 monthly produces CONFLICT despite the introductory fee fitting the cap. Over-cap, currency, merchant and action/document mismatches also pause with specific reasons.
- [ ] Missing/invalid intent, unsupported currency representation, absent or contradictory terms, unsupported/uncertain interpretation, failed model and semantic/execution disagreement produce CLARIFY or a specific conflict, never ALLOW.
- [ ] Only ALLOW can mint an opaque service-generated single-use grant bound to current session, intent ID/revision, checkout ID/revision and material commitment. Browser-submitted model verdicts or edited grants are not trusted.
- [ ] Compare response revision tags with current intent/checkout before issuance. A delayed obsolete response cannot restore a verdict/grant after a state change or reset.
- [ ] Focused node:test cases establish price boundaries, recurrence, all scope mismatches, unknown evidence and stale-response rejection independently of the provider.

## Delivery

- Priority: **P0**
- Estimate: **M**
- Depends on: Task 2, Task 3
- Technologies: Node.js, node:crypto, node:test

Shared contract and scope: [technical decisions](https://github.com/shinhf/safety-belt/blob/main/docs/technical-decisions.md). All side effects are simulated; this issue does not authorize live transactions or deployment.

<a id="task-5"></a>

## 5. Gate every submit path with atomic current-state and replay checks

Wire button, Enter and direct JSON submission into one service handler. Revalidate and consume a current grant at the execution boundary, then synchronously update simulated outcome state using the identical captured commitment.

## Business value

Turns the warning into an enforced pause and prevents stale or repeated approval from causing a payment.

## Acceptance criteria

- [ ] Every supported submission reaches the shared handler; direct API requests without a current valid grant fail with zero side effects. A disabled button alone is insufficient.
- [ ] Immediately before execution compare session, intent/checkout IDs and revisions, document/action, merchant, upfront price/currency, recurrence, renewal and trial fields against the grant. Any mismatch rejects before payment/subscription/conversion changes.
- [ ] Check/consume the grant and update simulated outcomes in one synchronous single-process critical section with no await. Execute the immutable checked commitment; no later mutable-state read supplies execution terms.
- [ ] One allowed USD 1 one-off action creates exactly one simulated payment and completes the selected synthetic conversion, with zero subscriptions. The handler never creates a recurring subscription in this MVP.
- [ ] Duplicate/concurrent clicks, replayed requests, a second grant for the same completed intent/document and response-loss retries cannot create a second payment. Used grants, reset/restart grants and altered/unknown grants fail safely.
- [ ] Changing one-off terms to recurring or changing merchant after check invalidates approval for both click and Enter submit. Delayed model responses remain unable to authorize the replacement state. Attempts and executions are counted separately.
- [ ] API tests assert outcome records and counts for allowed, missing, stale and replayed grants, including a term mutation immediately before submission.

## Delivery

- Priority: **P0**
- Estimate: **M**
- Depends on: Task 4
- Technologies: Node.js HTTP, node:test, Browser form events

Shared contract and scope: [technical decisions](https://github.com/shinhf/safety-belt/blob/main/docs/technical-decisions.md). All side effects are simulated; this issue does not authorize live transactions or deployment.

<a id="task-6"></a>

## 6. Explain paused commitments and recover to the one-off completion path

Finish the browser flow around the enforced gate: show pending/allowed/conflicting/clarification states, actual quoted disclosure, approved intent, read-only subscription review, and the legitimate simulated completion result.

## Business value

Lets the user understand the mismatch and still finish the intended task within their boundaries.

## Acceptance criteria

- [ ] For the recurring variant, the pause says the user approved at most USD 2 once, while this checkout is USD 1 today then USD 49.95 each month after seven days. Show merchant and supporting disclosure, without alleging fraud.
- [ ] Offer Go back and Review subscription terms. Review is read-only and creates no approval, grant, payment or subscription. Returning to the one-off variant triggers a check of its current snapshot before completion.
- [ ] Missing/contradictory terms, timeout, unsupported values and stale state show an intelligible clarification/recheck reason. Pending/uncertain states never display an authorization or a safe badge.
- [ ] The success screen appears only from service-owned completed state and identifies the synthetic document, simulated USD 1 one-off payment and zero subscriptions. Outcome counters remain inspectable.
- [ ] Evidence/merchant/model strings are rendered as plain text, never injected HTML. Native keyboard submission reaches the gate. Labels, focus and warning actions work using keyboard navigation.
- [ ] Always label the fixture fictional, the conversion/payment simulated, and the interpretation live or replay accurately. State the supported-checkout scope on the demo surface.

## Delivery

- Priority: **P0**
- Estimate: **S**
- Depends on: Task 5
- Technologies: HTML/CSS/JavaScript, Node.js API

Shared contract and scope: [technical decisions](https://github.com/shinhf/safety-belt/blob/main/docs/technical-decisions.md). All side effects are simulated; this issue does not authorize live transactions or deployment.

<a id="task-7"></a>

## 7. Verify browser enforcement, failure handling and privacy boundaries

Add the smallest repeatable Chromium suite covering the saved scenario's acceptance matrix, using labeled fixed model responses for deterministic gate tests. Test the actual browser/API and service outcome state, not UI messages alone.

## Business value

Provides falsifiable evidence that the supported journey works and that a visible warning cannot be bypassed through its supported submission paths.

## Acceptance criteria

- [ ] A documented command starts the local service and runs Playwright Chromium plus node:test from a clean setup. Pin the test dependency with an npm lockfile; do not require cloud deployment or a live key for deterministic tests.
- [ ] Assert one-off USD 1 completes exactly once with zero subscriptions; recurring, over-cap, non-USD, changed merchant/action/document, missing and contradictory terms yield zero effects.
- [ ] Exercise click and Enter after check-to-submit mutation, a late response after mutation/reset, duplicate/concurrent submission and replay. Assert service payment/subscription/conversion truth and attempt/execution counts.
- [ ] Inject timeout, HTTP error, malformed/uncertain output, invalid quotation and semantic/execution disagreement. Each pauses with zero side effects and permits safe recheck/recovery.
- [ ] Inspect the outgoing provider payload and served assets/responses: no key, intent, document contents, personal/payment data or hidden evaluation labels leak. Cross-origin mutation/unexpected Host fails; environment-file access and HTML-like evidence do not expose files or execute script.
- [ ] Fixed provider fixtures are labeled test doubles. Separate deterministic gate results from real model results; test-double passes cannot be reported as model accuracy.

## Delivery

- Priority: **P0**
- Estimate: **M**
- Depends on: Task 6
- Technologies: Playwright Test, Chromium, node:test, npm

Shared contract and scope: [technical decisions](https://github.com/shinhf/safety-belt/blob/main/docs/technical-decisions.md). All side effects are simulated; this issue does not authorize live transactions or deployment.

<a id="task-8"></a>

## 8. Measure the live model on billing paraphrases and rehearse the MVP demo

Run a compact independently labeled disclosure set and the real end-to-end demo. Record provider/model revision, actual failures/abstentions and service execution outcomes, then add only the run instructions and short demo script needed to reproduce them.

## Business value

Demonstrates the business outcome with an actual interpreter while keeping model evidence and protection claims honest.

## Acceptance criteria

- [ ] Prepare at least eight fixed synthetic cases before viewing model answers: two explicit one-off phrasings, three renewal phrasings (including introductory access, renews automatically and billed each month), one missing, one contradictory and one unsupported disclosure. Assign expected material fields/evidence class independently; never send labels to the model.
- [ ] Run the selected live model with the same prompt/schema as the application. Save synthetic inputs, expected vs actual fields/class, provider/model/API revision, failures and abstentions; report raw counts without claiming broad accuracy.
- [ ] Core one-off and three recurring phrasings meet their expected classification/material fields, and unclear/contradictory/unsupported cases do not authorize. Record all initial failures; fix and rerun before closing if these core cases fail. Do not suppress errors or substitute replay as live evidence.
- [ ] Rehearse roughly two minutes: independently approve intent; attempt recurring checkout and observe zero effects; return to explicit USD 1 one-off and complete once; reset and inject a post-check change, then reject stale approval. Show state records/counters for each result.
- [ ] The walkthrough and brief README instructions identify the owned checkout, synthetic data, simulated payment/conversion, injected mutation and any replay. Missing provider access leaves this live-model acceptance criterion open rather than claiming success.
- [ ] All deterministic checks from task 7 pass and observed live demo results satisfy the Definition of Done. No claim of third-party interception, hidden-charge detection or measured fraud prevention appears.

## Delivery

- Priority: **P0**
- Estimate: **S**
- Depends on: Task 7
- Technologies: Gemini REST, Node.js, Chromium

Shared contract and scope: [technical decisions](https://github.com/shinhf/safety-belt/blob/main/docs/technical-decisions.md). All side effects are simulated; this issue does not authorize live transactions or deployment.

## Definition of Done

- [ ] Explicit USD 1 one-off checkout completes one simulated payment and the selected synthetic conversion, with zero subscriptions, under separately confirmed USD 2 one-off intent.
- [ ] USD 1 introductory checkout with USD 49.95 monthly renewal after seven days pauses before any payment/subscription/conversion effect, explaining the disclosed mismatch.
- [ ] Price, currency, merchant, action/document and recurrence constraints are enforced by local deterministic rules; unclear or failed interpretation does not authorize.
- [ ] Material changes, late model responses, button/Enter/direct-API paths and replay cannot execute stale approval or duplicate payment.
- [ ] Review terms grants nothing; returning to the one-off flow allows safe completion after a current check.
- [ ] Only public disclosure/merchant text reaches the model; credentials and synthetic document/payment state stay outside provider payloads and served assets.
- [ ] Deterministic browser/API checks pass, the independently labeled live-model set meets task 8's criteria, and the live demonstration records actual execution-state outcomes.
- [ ] Run instructions and demo labels reproduce the owned-checkout claim accurately. No real payment, subscription enrollment, deployment or application implementation has occurred as part of backlog preparation.
