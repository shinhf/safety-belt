# 2. Architecture Constraints

<!-- arc42-generated -->
> **Status: planned.** These constraints apply to the MVP that is about to be built. The repository contains no `package.json`, lockfile or source code yet, so no constraint can be checked against project files. Facts marked *Verified 2026-11-13* come from the official-documentation check recorded in `safety-belt-mlh/planning/plugin-plan.md` §8.
<!-- /arc42-generated -->

## Technical Constraints

<!-- arc42-generated -->
| ID | Constraint | Description | Source |
|----|-----------|-------------|--------|
| TC1 | Node.js 24.x, pinned patch release | Use one local JavaScript service, pinned to a patched 24.x release. *Verified 2026-11-13:* Node 24 has been **Maintenance LTS** since 2026-10-20, and Node 26 is the Active LTS. The latest 24.x is 24.22.3 and the local machine has 24.20.0. Node 24 bundles npm 11, which the npm docs label "Legacy". | [README.md](../README.md), [#1](https://github.com/shinhf/safety-belt/issues/1), plugin-plan §8.1, §8.8 |
| TC2 | Built-in modules only at runtime | Use `node:http`, global `fetch`, `node:crypto` and `node:test`. There is no web framework, provider SDK or **schema library**: a hand-written validator checks the fixed response contract. *Verified:* core `http` has no request-body size limit, so the service must enforce its own. | [docs/technical-decisions.md](../docs/technical-decisions.md) ("One coherent stack"), plugin-plan §8.6–8.7 |
| TC3 | Plain HTML, CSS and vanilla JavaScript | The same service serves one same-origin desktop-browser flow. There is no SPA framework, bundler or design system. | [README.md](../README.md), [docs/technical-decisions.md](../docs/technical-decisions.md) |
| TC4 | One process, in-memory state | One Node process owns one demo session in memory. There is no database or persistence. A reset or a process restart clears the intent, checks, grants and outcomes. No distributed lock is needed, because the critical section is a single synchronous block with no `await`. | [docs/technical-decisions.md](../docs/technical-decisions.md) ("Shared implementation contract") |
| TC5 | Loopback only | The service listens on `127.0.0.1`. There is no cloud deployment, multi-user operation or account system. | [#1](https://github.com/shinhf/safety-belt/issues/1), [README.md](../README.md) |
| TC6 | Single model: Gemini 4 Hydrogen over REST | The model ID `gemini-4-hydrogen` and the API revision are pinned after a live smoke check. There is one call per interpretation and no second model. *Verified:* Gemini's `generateContent` is labelled **legacy** compared with the Interactions API, though it "remains fully supported". The REST field names for structured output differ between the guide and the reference. Issue #3 must choose the API, and only a live call settles the field names. | [docs/technical-decisions.md](../docs/technical-decisions.md), [#3](https://github.com/shinhf/safety-belt/issues/3), plugin-plan §8.2–8.3 |
| TC7 | Model output is untrusted, so local validation is mandatory | *Verified:* Gemini silently removes unsupported JSON Schema keywords such as `minLength`, `maxLength` and `uniqueItems`. Structured output does not guarantee that values are semantically correct. The local validator must enforce required, conditional and enum fields, integer cents, rejection of extra fields, and quotation provenance. Any failure produces `CLARIFY`. | plugin-plan §8.4, [#3](https://github.com/shinhf/safety-belt/issues/3) |
| TC8 | No deterministic sampling | *Verified:* Hydrogen ignores `temperature`, `topP` and `topK` (it returns deprecation-warning headers; the docs say 400 errors come in a future release). Thinking defaults to `high`. Live answers can therefore vary between runs. Deterministic gate tests use labelled replay fixtures, and live results are reported separately as raw counts. | plugin-plan §8.5, [#7](https://github.com/shinhf/safety-belt/issues/7), [#8](https://github.com/shinhf/safety-belt/issues/8) |
| TC9 | Bounded provider call | The provider URL is fixed. The request body is bounded and the timeout is 10 seconds. Errors are sanitized. An HTTP error, rate limit or provider failure never falls back to authorization. | [#3](https://github.com/shinhf/safety-belt/issues/3), [docs/technical-decisions.md](../docs/technical-decisions.md) |
| TC10 | Credentials stay in the service environment | `GEMINI_API_KEY` and `GEMINI_MODEL` live in `.env`, which `.gitignore` excludes. The service loads them with `node --env-file=.env`. The key never reaches browser assets, responses or logs. | [.env.example](../.env.example), [#3](https://github.com/shinhf/safety-belt/issues/3) |
| TC11 | Desktop browser, verified in Chromium | Playwright Test with Chromium is a development dependency, pinned through an npm lockfile. It starts the local service itself, so tests need no deployment. *Verified:* in Playwright's `webServer` option, `port` is deprecated in favour of `url`. | [#7](https://github.com/shinhf/safety-belt/issues/7), plugin-plan §8.9 |
| TC12 | Money as integer cents | Amounts are non-negative safe integers in cents, compared without floating-point arithmetic. The only supported currency is USD. Any other representation pauses the flow. | [#2](https://github.com/shinhf/safety-belt/issues/2), [#4](https://github.com/shinhf/safety-belt/issues/4) |
| TC13 | Windows and Linux are both supported hosts | The service, the npm scripts and the test suite must run unchanged on Windows and Linux. File paths are resolved with `new URL(..., import.meta.url)` or `node:path`, never by joining strings with `/`. npm scripts call `node` directly, with no shell-specific syntax such as `&&` chains that depend on POSIX tools, inline `VAR=value` assignments, `rm` or `cp`. Tests do not assume a particular line ending or a case-sensitive file system. Development currently happens on Linux, and Windows has not been verified yet. | Project owner decision, 2026-11-13 |
<!-- /arc42-generated -->

## Organizational Constraints

<!-- arc42-generated -->
| ID | Constraint | Description | Source |
|----|-----------|-------------|--------|
| OC1 | The model interprets but never authorizes | The AI may interpret disclosed terms. Deterministic checks enforce price, recurrence, merchant and action scope. Merchant text and model text cannot create or revise consent. | `safety-belt-mlh/AGENTS.md`, [#2](https://github.com/shinhf/safety-belt/issues/2), [#4](https://github.com/shinhf/safety-belt/issues/4) |
| OC2 | Simulation only | The MVP uses only synthetic documents, the fictional merchant Paperlane Demo and simulated payment, conversion and subscription state. There are no uploads, card forms, PDF engines, payment processors or real merchant checkouts. Planning artifacts and issues authorize no live transaction, deployment or publication. | [README.md](../README.md), every issue's "Shared contract and scope" line |
| OC3 | Claim boundary | The only claim is this: on the owned checkout, Safety Belt pauses disclosed billing commitments that conflict with the user's explicit intent. Safety Belt does not intercept third-party checkouts, authenticate merchant backends, detect undisclosed future charges or resist malware, and no fraud-prevention figure is claimed. | `safety-belt-mlh/.agents/skills/safety-belt-scenarios/references/pdf-checkout-history.md`, [#8](https://github.com/shinhf/safety-belt/issues/8) |
| OC4 | Label evidence | Reported consumer experiences, verified findings, proposed behaviour and measured results stay distinct. Replay fixtures are labelled test doubles and are never reported as model accuracy. Missing provider access leaves #8 open; it is not counted as a pass. | `safety-belt-mlh/AGENTS.md`, [#7](https://github.com/shinhf/safety-belt/issues/7), [#8](https://github.com/shinhf/safety-belt/issues/8) |
| OC5 | Live provider access is a prerequisite | A working Gemini key with access to `gemini-4-hydrogen` is required to finish #3 and #8. No account-specific access has been verified yet. | [README.md](../README.md), [docs/technical-decisions.md](../docs/technical-decisions.md) |
| OC6 | Work tracking | Work is tracked in the private repository `shinhf/safety-belt`, in issues #1–#8, in the order fixed by their dependencies (#1 → #2 and #3 → #4 → #5 → #6 → #7 → #8). The [Safety Belt MVP board](https://github.com/users/shinhf/projects/11) has the fields Status (Todo / In Progress / Done), Priority (P0 / P1) and Size (S / M / L). Sizes are relative estimates, not delivery promises. | [docs/mvp-backlog.md](../docs/mvp-backlog.md), board field list |
| OC7 | Parallel work uses disjoint file ownership | Delegated agents read their role brief and own separate files. The coordinating agent merges their findings. | `safety-belt-mlh/AGENTS.md` |
<!-- /arc42-generated -->

<!-- arc42-manual: Add the schedule and budget constraints: the actual deadline (the backlog uses relative S/M sizes; the scenario's 3–4-hour sketch is labelled aspirational), who builds the MVP, any cost limit on Gemini API usage, and whether a sponsor or event requires the Gemini integration. -->
<!-- /arc42-manual -->

## Development Conventions

<!-- arc42-generated -->
| Convention | Description | Source |
|-----------|-------------|--------|
| Acceptance criteria are open requirements | Issue checkboxes and the Definition of Done describe future behaviour. Do not mark them done without an observed result. | [docs/mvp-backlog.md](../docs/mvp-backlog.md) |
| Pin everything that affects a result | Pin the Node 24.x patch release, the npm lockfile for Playwright, the model ID and the API revision used in the smoke check. | [#1](https://github.com/shinhf/safety-belt/issues/1), [#3](https://github.com/shinhf/safety-belt/issues/3), [#7](https://github.com/shinhf/safety-belt/issues/7) |
| Outcome truth over UI text | Tests assert the service's payment, subscription and conversion records and its attempt and execution counts, not banners or model agreement. | [#5](https://github.com/shinhf/safety-belt/issues/5), [#7](https://github.com/shinhf/safety-belt/issues/7) |
| Two test layers | `node:test` covers policy, API, grant and replay logic without the provider. Playwright with Chromium covers click and Enter submission, term changes and visible outcomes. Deterministic tests need no live key. | [#4](https://github.com/shinhf/safety-belt/issues/4), [#7](https://github.com/shinhf/safety-belt/issues/7) |
| Model and merchant strings are data | Render them as text only, never as HTML or code. Disclosure text cannot invoke tools or change policy. | [#3](https://github.com/shinhf/safety-belt/issues/3), [#6](https://github.com/shinhf/safety-belt/issues/6) |
| Independent labels before model runs | Label the at-least-eight-case evaluation set before viewing any model answers, and never send the labels to the model. | [#8](https://github.com/shinhf/safety-belt/issues/8) |
| Avoid experimental Node features in required checks | *Verified:* `--experimental-test-coverage`, `mock.module` and test-runner watch mode are still experimental in Node 24. | plugin-plan §8.7 |
<!-- /arc42-generated -->
