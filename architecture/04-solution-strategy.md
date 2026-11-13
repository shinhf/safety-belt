# 4. Solution Strategy

<!-- arc42: A short summary and explanation of the fundamental decisions and
solution strategies that shape the system's architecture. -->

<!-- arc42-generated -->
> **Status:** target architecture. No application code exists and nothing in this section has been built or measured ([README.md](../README.md), [docs/technical-decisions.md](../docs/technical-decisions.md)). Every claim applies only to the owned Paperlane Demo checkout fixture.

## 4.1 Strategy in brief

- **One local process, one language.** A single Node.js 24 service on `127.0.0.1` serves the static browser UI and a small set of fixed JSON routes. It holds one demo session in memory. There is no database, framework, provider SDK or deployment ([technical-decisions.md:23-32](../docs/technical-decisions.md)).
- **The model interprets, rules decide.** Gemini 4 Hydrogen extracts billing semantics and supporting quotations from the public disclosure text. A local validator and a pure, deterministic policy comparator decide `ALLOW`, `CONFLICT` or `CLARIFY`. Model output is untrusted data and cannot authorize anything ([technical-decisions.md:36-37](../docs/technical-decisions.md), issue [#4](https://github.com/shinhf/safety-belt/issues/4)).
- **Intent comes only from Safety Belt's own surface.** The user confirms the intent (one conversion, Paperlane Demo, at most USD 2, one-off only) separately from checkout text. Merchant or model text cannot create or change it ([technical-decisions.md:34](../docs/technical-decisions.md), issue [#2](https://github.com/shinhf/safety-belt/issues/2)).
- **Authorization is a server-side, single-use grant bound to exact state.** Only `ALLOW` mints an opaque grant bound to session, intent revision, checkout revision and every material commitment field. Any state change invalidates it ([technical-decisions.md:38](../docs/technical-decisions.md)).
- **One execution boundary.** Button, Enter and direct JSON submits reach one handler. That handler revalidates, consumes the grant and records the simulated outcome in one synchronous critical section ([technical-decisions.md:39](../docs/technical-decisions.md), issue [#5](https://github.com/shinhf/safety-belt/issues/5)).
- **Service state is the truth.** Payment, subscription and conversion records plus attempt and execution counters define success, not a model answer or a UI banner ([technical-decisions.md:40](../docs/technical-decisions.md)).

## 4.2 Technology Decisions

| Decision area | Choice | Rationale | Source |
|---|---|---|---|
| Runtime | Node.js 24 LTS, pinned to a patched 24.x release | One language for service, policy and tests. Built-in `node:http`, `fetch`, `node:crypto` and `node:test` cover the few fixed routes, so no framework or SDK is needed. Node 24 has been Maintenance LTS since 2026-10-20; Node 26 is the Active LTS (github.com/nodejs/Release, checked 2026-11-13). | [technical-decisions.md:23](../docs/technical-decisions.md); `safety-belt-mlh/planning/plugin-plan.md` §8.1 |
| Package manager | npm with a lockfile | Pins the development-only test dependency (Playwright). There are no runtime dependencies. | issue [#7](https://github.com/shinhf/safety-belt/issues/7) |
| HTTP server | Core `node:http`, fixed route table | A few fixed routes and an allowlist of static files. Core `http` has no request body size limit, so the service enforces its own cap. | [technical-decisions.md:32,41](../docs/technical-decisions.md); plugin-plan.md §8.7 |
| Frontend | Static HTML, CSS and vanilla JavaScript, same origin | One desktop flow with native form submission (so Enter reaches the gate) and `textContent` rendering of untrusted text. No SPA, bundler or design system. | [technical-decisions.md:24](../docs/technical-decisions.md), issue [#6](https://github.com/shinhf/safety-belt/issues/6) |
| State | In-memory single demo session | A reset or restart clears intent, checks, grants and outcomes. A synchronous critical section in one process removes the need for locks or a database. | [technical-decisions.md:32,39](../docs/technical-decisions.md) |
| Semantic interpreter | Gemini 4 Hydrogen (`gemini-4-hydrogen`) over REST with structured JSON output | One call extracts amounts, intervals, trial duration and evidence quotations, which a classifier-only service would not do. This is an architectural judgement, not a benchmark. | [technical-decisions.md:11,17,25](../docs/technical-decisions.md), issue [#3](https://github.com/shinhf/safety-belt/issues/3) |
| Model output validation | Explicit hand-written validator for the fixed response contract | The project rules out a schema library (`technical-decisions.md:28`). Gemini drops unsupported schema keywords (`minLength`, `maxLength`, `uniqueItems`) without warning and does not guarantee semantically correct values, so local validation is required. | [technical-decisions.md:28](../docs/technical-decisions.md); plugin-plan.md §8.4, §8.6 |
| Grant identifiers | `node:crypto` random opaque IDs held in a server-side map | The browser cannot mint or edit a grant. Single-use credentials bound to transaction data and checked server-side, following the OWASP Transaction Authorization guidance. | [technical-decisions.md:38](../docs/technical-decisions.md) |
| Unit and API tests | `node:test` | Stable built-in runner for the policy, validator, grants and HTTP API. Coverage reporting is still experimental (`--experimental-test-coverage`), so it is not a gate. | [technical-decisions.md:23](../docs/technical-decisions.md); plugin-plan.md §8.7 |
| Browser tests | Playwright Test 1.65 with Chromium, `webServer` with `url` plus `baseURL` | Real click and Enter submission, term changes and visible outcomes without a deployment. In 1.65 the `port` option is deprecated in favour of `url`. | [technical-decisions.md:26](../docs/technical-decisions.md); plugin-plan.md §8.9 |
| Secrets | `.env` loaded with `node --env-file=.env`; `.env` is in `.gitignore` | Keeps the key on the service side and out of Git, browser assets and logs. | [.env.example](../.env.example), [technical-decisions.md:41](../docs/technical-decisions.md) |
| Work tracking | GitHub Issues #1-#8 and the MVP project board | An ordered P0 backlog with explicit dependencies. | [docs/mvp-backlog.md](../docs/mvp-backlog.md) |

Excluded: database, cloud deployment, browser extension, OCR, GPU/NPU pipeline, account system, provider SDK, schema library, second model, real merchant integration, live payments and subscription enrollment ([README.md](../README.md), [mvp-backlog.md:7](../docs/mvp-backlog.md)).

## 4.3 Open technology choices

Issue [#3](https://github.com/shinhf/safety-belt/issues/3) settles these with the live smoke check. None of them is verified yet.

| Open choice | Options | Constraint from the sources | Decided in |
|---|---|---|---|
| Gemini API surface | `generateContent`, which the docs label legacy but still fully supported, or the Interactions API, which the docs recommend for new projects (aistudio.google.com/llms.txt, checked 2026-11-13) | `technical-decisions.md:25` links to the structured-output page and does not choose. Pin the API revision the smoke check uses. | issue #3 |
| Structured-output request field | `generationConfig.responseFormat.text.{mimeType, schema}` (guide) or `responseMimeType` + `responseJsonSchema` (reference and JS examples) | Only a live call with a key settles it. Treat as unverified until then. | issue #3 |
| Hydrogen thinking level | Default `high`, or the lowest level that meets the quality bar | Hydrogen ignores `temperature`, `topP` and `topK` (it returns deprecation-warning headers; the docs say 400 errors come in a future release), so sampling cannot be made deterministic. | issues #3, #8 |
| Exact Node 24.x patch | Latest is 24.22.3; 24.20.0 is installed locally (plugin-plan.md §8.1) | "Pin a supported patched 24.x release at setup" (`technical-decisions.md:23`). | issue #1 |
| Request body cap, port and CSP header text | Not fixed by any source | The contract asks for a body limit; the values are implementation choices. | issues #1, #7 |
<!-- /arc42-generated -->

<!-- arc42-manual: Record each open choice once issue #3's smoke check settles it (API surface, request field name, pinned API revision, thinking level), and add an ADR in 09-architecture-decisions.md. -->
<!-- /arc42-manual -->

<!-- arc42-generated -->
## 4.4 Decomposition approach

- **Pure core, thin shell.** The policy comparator is a pure function of (intent, checkout snapshot, validated interpretation) → decision with reason codes. It needs no network, clock or randomness, so `node:test` can cover it exhaustively ([issue #4](https://github.com/shinhf/safety-belt/issues/4)). I/O lives at the edges: the HTTP layer, the Gemini adapter and the in-memory state holders.
- **Blocks follow the backlog.** Each P0 issue adds one cohesive block: fixture (#1), intent (#2), interpreter (#3), policy and grants (#4), gate (#5), UI (#6), browser verification (#7) and live measurement (#8). See [05-building-block-view.md](05-building-block-view.md).
- **The fixture's commitment is what executes.** The owned fixture holds an immutable execution commitment per snapshot revision. The model's interpretation must agree with it, and any disagreement gives `CLARIFY`. The gate executes the captured commitment and does not re-read mutable state ([technical-decisions.md:35-36,39](../docs/technical-decisions.md)).

## 4.5 Quality Goal Strategies

The quality goals are defined in [01-introduction-and-goals.md](01-introduction-and-goals.md). This table maps the goals the shared contract sets to the strategies above.

| Quality goal | Approach | Where it lives |
|---|---|---|
| **Fail closed** | Any missing key, timeout (10 s), HTTP or rate-limit error, malformed or uncertain output, unsupported value, missing or contradictory evidence, invalid intent or disagreement with the commitment gives `CLARIFY` or a specific `CONFLICT`, never `ALLOW`. There is no automatic fallback to authorization. | Validator, policy comparator, adapter error mapping ([08-crosscutting-concepts.md](08-crosscutting-concepts.md) §8.5) |
| **The model never authorizes** | Model output passes parse → validate → semantic checks and only feeds the deterministic comparator. Only the comparator's `ALLOW` can reach the grant service. Price, currency, merchant, action and document scope, and recurrence are integer-cent and enum rules. Browser-submitted verdicts are ignored. | Policy comparator, grant service |
| **Revalidate at the execution boundary** | Every submit path calls one handler. Just before execution it compares the current session, intent and checkout IDs and revisions and all material fields with the grant. A late model response must match current revisions before it can affect a decision. | Execution gate, grant service |
| **Single-use grants** | Opaque server-generated IDs. Check, consume and record the outcome happen synchronously with no `await` in between. At most one payment per intent and document; reset starts a new run. | Grant service, execution gate |
| **Evidence rendered as text** | Disclosure, merchant and model strings go into the DOM only through `textContent`. A strict Content-Security-Policy is defence in depth. Quotations must be exact substrings of the snapshot disclosure. | Browser UI, HTTP headers, validator |
| **Privacy of the provider request** | The provider request carries only the public merchant display name, the disclosure text and the fixed instructions and schema. | Interpretation adapter ([08-crosscutting-concepts.md](08-crosscutting-concepts.md) §8.6) |
| **Honest evidence** | Recorded model responses are labelled replay test doubles. Live-model results are measured separately (issue #8) and are never reported from replay runs. | Test strategy ([08-crosscutting-concepts.md](08-crosscutting-concepts.md) §8.8) |

## 4.6 Organizational Decisions

- Eight ordered P0 issues with explicit dependencies (#1 → #2/#3 → #4 → #5 → #6 → #7 → #8). Optional P1 work is kept off the board ([mvp-backlog.md:7,15-24](../docs/mvp-backlog.md)).
- Repository-local role briefs (product owner, delivery reviewer) review scope and enforcement boundaries. Parallel workers own disjoint files (`safety-belt-mlh/AGENTS.md`).
- Planning artifacts do not authorize implementation against real merchants, payments, publication or deployment ([technical-decisions.md:3](../docs/technical-decisions.md)).
<!-- /arc42-generated -->

<!-- arc42-manual: Who implements and reviews each issue, the timebox for the demo, and when the open choices in 4.3 must be settled. -->
<!-- /arc42-manual -->
