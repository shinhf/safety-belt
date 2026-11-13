# 12. Glossary

<!-- arc42: The most important domain and technical terms that your stakeholders
use when discussing the system. -->

<!-- arc42-generated -->
Terms are defined from the project sources. All of them describe the **planned** MVP. No implementation exists. Main sources:

- [docs/technical-decisions.md](../docs/technical-decisions.md) ("Shared implementation contract")
- [docs/mvp-backlog.md](../docs/mvp-backlog.md) and issues [#1](https://github.com/shinhf/safety-belt/issues/1) to [#8](https://github.com/shinhf/safety-belt/issues/8)
- [README.md](../README.md)
- [AGENTS.md](../safety-belt-mlh/AGENTS.md) and the [PDF checkout scenario](../safety-belt-mlh/inbox/2026-11-13_pdf-checkout-subscription-mvp.md). These two files are local only, because `safety-belt-mlh/` is git-ignored.

Field and enum names in `code` font are the planned contract names. Related sections: [5. Building Block View](05-building-block-view.md), [8. Crosscutting Concepts](08-crosscutting-concepts.md), [9. Architecture Decisions](09-architecture-decisions.md).

| Term | Definition |
|------|-----------|
| Action Seatbelt | The general intent/action check: compare a proposed action with the user's approved intent before it executes. [AGENTS.md](../safety-belt-mlh/AGENTS.md) uses it as another name for Safety Belt. The scenario calls the PDF-checkout MVP "a narrow first application of Action Seatbelt's intent/action check". |
| `ALLOW` | The policy decision that permits execution. It is possible only for explicit one-off terms in the current snapshot that match the approved merchant, action, document and currency and cost no more than the cap. `ALLOW` is the only decision that can mint an execution grant. |
| Attempted submission | A submit request that reaches the execution boundary, counted whether or not it executes. The service counts attempts separately from executions. |
| Billing commitment | What the checkout would actually commit the user to: upfront amount and currency, billing kind, renewal amount and interval, and trial duration. The fixture holds it as an immutable execution commitment. The model only interprets the disclosed version of it. |
| Billing kind | An enum in the checkout snapshot and in the interpretation. `one_off`: a single charge with no renewal. `recurring`: a charge that renews at an interval, for example after a trial. `unknown`: the commitment cannot be determined. Only `one_off` backed by explicit evidence can lead to `ALLOW`. When no recurrence is detected, that does not prove `one_off`. |
| Billing scope | The part of the intent that limits billing. In the MVP it is always `one_off_only`: no trial that renews and no subscription. |
| Checkout revision | A number that increases monotonically on every change to the snapshot's material fields or disclosure text, including a change away and back. Grants and model responses are bound to it. |
| Checkout snapshot | An immutable record of one checkout state: checkout ID, revision, merchant ID and display name, document ID and action, the exact public disclosure text, and the execution commitment. Expected evaluation labels are kept separately. |
| Claim boundary | The only statement the MVP may demonstrate: "On this supported checkout, Safety Belt pauses disclosed billing commitments that conflict with the user's explicit intent." It excludes interception of third-party checkouts, detection of hidden charges and fraud prevention. |
| `CLARIFY` | The policy decision for uncertain cases: missing, invalid, contradictory, unsupported, failed or stale interpretations; disagreement between the interpretation and the execution commitment; and missing intent. The flow pauses with a reason and no grant is minted. |
| `CONFLICT` | The policy decision for clearly disclosed terms that break the approved intent: recurrence, a price over the cap, another currency, merchant, action or document. The flow pauses with no side effects. |
| Decision | The output of the deterministic policy comparator: `ALLOW`, `CONFLICT` or `CLARIFY`, with reason codes, the intent and snapshot revisions it was based on, and inspectable evidence. |
| Disclosure text | The exact public billing wording shown on the checkout and stored in the snapshot. Together with the merchant display name, it is the only checkout content sent to the model. It is treated as untrusted data. |
| Evidence quote | A quotation from the disclosure text that supports an interpretation field. A one-off claim needs one, as do recurring terms. Each quote must appear verbatim in the snapshot. Otherwise the interpretation is rejected and the decision is `CLARIFY`. |
| Evidence status | An interpretation field with the values `clear`, `missing`, `contradictory`, `uncertain` and `unsupported`. Any value other than `clear` cannot lead to `ALLOW`. |
| Execution boundary | The single service handler that every supported submit path reaches: button, Enter and direct JSON. Immediately before the simulated execution, it compares the current state with the grant, consumes the grant and updates outcome state. These steps run in one synchronous step with no `await`. |
| Execution commitment | The immutable commitment that the fixture would actually execute for a snapshot. It is never sent to the model. Execution uses this captured commitment, not mutable state read again. |
| Execution grant | An opaque, single-use ID generated by the service, minted only on `ALLOW`. It is bound to the session, the intent ID and revision, the checkout ID and revision, and every material commitment field. A changed intent or snapshot, a reset or a completed action invalidates it. The browser cannot mint or edit one. |
| Expected evaluation labels | Independently assigned expected fields and evidence class for each fixture variant or test disclosure. They are kept apart from the snapshot and never sent to the model. They are used to score model results in #8. |
| Fail closed | The rule that any error, timeout, missing key, malformed output, unknown value or stale state pauses the flow and produces no grant. A failure never falls back to authorization. |
| Fixture | The owned, fictional desktop-browser checkout that the service serves, with variants such as explicit USD 1 one-off, USD 1 with a trial and USD 49.95 monthly, USD 3 one-off, non-USD, changed merchant, and missing or contradictory terms. |
| Gemini 4 Hydrogen | `gemini-4-hydrogen`: the selected interpreter model, called over REST with structured JSON output and no SDK. It replaced Gemini 3.8 Flash in commit `26b6964`. Access to it is not yet verified. |
| Intent | The record of what the user explicitly approved on Safety Belt's own surface. Fields: `intentId`, revision, synthetic document ID, action `convert-one-document`, merchant ID, currency `USD`, maximum upfront amount in integer cents (default 200) and billing scope `one_off_only`. Merchant or model text cannot create or change it. |
| Intent revision | The version of the intent. Only a new explicit confirmation creates a new revision. A new revision invalidates pending checks and grants. |
| Interpretation | The model's validated reading of the disclosure: upfront cents and currency, merchant display name, billing kind, renewal cents and interval, trial duration, evidence status and evidence quotes. It is input to the policy and never an authorization. |
| Live smoke check | One recorded synthetic call to the provider with the configured key, model and API revision. Integration may not be claimed before it passes (#3). |
| Material field | A field whose change alters the commitment or scope: merchant, document and action, upfront amount and currency, billing kind, renewal amount and interval, trial duration, and disclosure text. A change increments the checkout revision. |
| Observable truth | The outcome state the service owns: attempted-submit count, execution count, payment records, subscription records and conversion status. It decides success, not a model answer or a UI banner. |
| Paperlane Demo | The fictional merchant of the fixture. It has no real branding and no real payments. |
| Reason code | A stable, factual code attached to a decision that names the cause, for example recurrence, over cap, currency or merchant mismatch, or stale state. The pause explanation is built from reason codes. |
| Replay | A recorded or fixed model response used in tests or a demo in place of a live call. It must be labelled as replay or test double, and it never counts as evidence of the live model's quality. |
| Reset | An explicit action that clears the single in-memory session: intent, pending checks, grants and outcomes. A process restart has the same effect. |
| Review subscription terms | A read-only view of recurring terms offered after a pause. It creates no approval, grant, payment or subscription. |
| Safety Belt | The product: it pauses a supported desktop-browser checkout when the disclosed billing commitment conflicts with the user's explicitly approved intent, while preserving legitimate task completion. |
| Simulated completion | The state transition that stands in for payment and conversion. On `ALLOW`, it records one simulated USD 1 payment, marks the synthetic conversion complete and creates zero subscriptions. No PDF engine or payment processor runs. |
| Stale response | A model response whose intent or checkout revision tags no longer match the current state. It cannot affect a decision or a grant. |
| Synthetic document | A made-up document selected in the flow. Its contents are never processed or sent to the model. |
| Upfront amount | The amount charged now, held as a nonnegative safe integer in cents with a currency. Comparisons use integer cents, never floating-point arithmetic: USD 2.00 is allowed and USD 2.01 is rejected. |
<!-- /arc42-generated -->

<!-- arc42-manual: Add domain terms that need business context the sources do not give, for example product names used with partners or sponsors, or terms from the hackathon or demo setting. -->
<!-- /arc42-manual -->
