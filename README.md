# Safety Belt

Safety Belt pauses a supported desktop-browser checkout when its disclosed billing commitment conflicts with the user's explicitly approved intent, while preserving legitimate task completion.

**Status:** tasks 1–7 are on `main` (checkout fixture, intent confirmation, Gemini interpretation, policy and grants, submission gate, pause explanation UI, browser tests). Task 8 (live-model evaluation) is open. The live Gemini smoke check (task 3) has passed once. That is not a measured prevention result.

## MVP: one PDF, one payment

The user selects a synthetic document and independently approves one conversion at the fictional merchant **Paperlane Demo**, paying at most **USD 2 once**, with no recurring subscription. A fictional checkout charging **USD 1 today, then USD 49.95 monthly after seven days** must pause before any simulated execution. An explicitly one-off USD 1 checkout must complete one simulated payment and conversion. Changed terms invalidate approval, including changes immediately before submission.

Journey: select demo document → confirm intent on Safety Belt's own surface → inspect checkout → interpret disclosed terms → apply deterministic rules → either explain the pause or complete the permitted simulation once.

Use synthetic documents and payment state. Conversion is a simulated completion transition; no PDF engine, card form or payment processor is required. Subscription review is read-only. Returning to the supported one-off checkout provides recovery.

## Selected technologies

- **Node.js 24 LTS and npm:** one local JavaScript service using built-in HTTP, fetch, crypto and test modules; in-memory state.
- **HTML, CSS and vanilla JavaScript:** one desktop-browser flow, served by the same service; no frontend build framework.
- **Gemini 4 Hydrogen via REST with JSON Schema:** one semantic interpreter of disclosed billing wording; service-side key and validation. It cannot authorize actions.
- **Playwright Test with Chromium:** focused browser verification of the supported checkout boundary.

No database, cloud deployment, browser extension, OCR, GPU/NPU pipeline, account system, real merchant integration, live payment or subscription enrollment is in scope. The demonstrable claim applies only to this owned checkout and its disclosed terms.

## Ready for development

See the [ordered implementation backlog](docs/mvp-backlog.md) for tasks, acceptance criteria, dependencies and the Definition of Done. See [technical decisions and source reconciliation](docs/technical-decisions.md) for the shared contract and evidence.

Tests use labelled replay responses, not the live provider. The live Gemini smoke check (task 3) has passed once; no model accuracy or measured prevention result is claimed until the evaluation (task 8) passes.

## Run

Linux and Windows are both supported hosts (TC13). The app is developed on Linux. It is supported on Windows (TC13) but not yet verified there.

### Prerequisites

- **Node.js 24.20.0** (pinned in `.nvmrc`). On Linux use, for example, nvm (`nvm install && nvm use`). On Windows use nvm-windows, fnm or the official installer.
- **npm** (ships with Node.js).
- **Git**.
- Nothing else. The service runs on Node built-ins. The only dev dependency is Playwright, for the browser tests.

### Setup

Linux / macOS:

```bash
git clone https://github.com/shinhf/safety-belt.git
cd safety-belt
npm ci
cp .env.example .env   # optional: then set GEMINI_API_KEY in .env
```

Windows (PowerShell):

```powershell
git clone https://github.com/shinhf/safety-belt.git
cd safety-belt
npm ci
Copy-Item .env.example .env   # optional: then set GEMINI_API_KEY in .env
```

`.env` holds `GEMINI_API_KEY` and `GEMINI_MODEL` (default `gemini-4-hydrogen`). Git ignores it, so the key stays on your machine. The app also runs without a key. In that case the terms check reports "unavailable" and Safety Belt pauses every checkout (fail closed).

### Start the app

```bash
npm start
```

Open <http://127.0.0.1:3000>. Stop it with Ctrl+C.

The default port is 3000. To change it:

```bash
PORT=4000 npm start
```

```powershell
$env:PORT=4000; npm start
```

```cmd
set PORT=4000 && npm start
```

The server listens only on `127.0.0.1`, so other machines cannot reach it. Open it as `http://127.0.0.1:<port>` or `http://localhost:<port>`. Any other host name is rejected with `421 Misdirected Request`.

### Tests

These commands are the same on both OSes:

```bash
npm test                          # domain unit tests + HTTP integration tests (node:test); no key, no network
npx playwright install chromium   # one-time browser download (added with Task 7)
npm run test:e2e                  # Playwright + Chromium browser tests (added with Task 7)
npm run test:all                  # both suites (added with Task 7)
```

The tests use labelled replay model answers, not the live provider. A passing run is evidence that the gate works. It says nothing about model accuracy.

### Live Gemini smoke check

```bash
npm run smoke:gemini
```

This needs `GEMINI_API_KEY` in `.env`. It sends one synthetic checkout (by default `trial-recurring`; you can pass another variant id as an argument) through the production adapter and validator. It prints a JSON report with the verdict, API, model, status, reasons and interpretation, and it never prints the key. Exit codes: `0` PASS, `1` FAIL, `2` SKIPPED (no key), `3` unknown variant.

### Troubleshooting

- **`Executable doesn't exist at …/chromium_headless_shell-…`** when running the browser tests: the Chromium build for this Playwright version is not installed. Run `npx playwright install chromium`. On a bare Linux host that also lacks the system libraries Chromium needs, run `npx playwright install --with-deps chromium` (it installs them with the package manager, so it may ask for sudo).
- **Wrong Node version:** run `node --version`. It must print `v24.20.0` or a later 24.x. `npm ci` warns when it doesn't (`engines`).
- **Port already in use** (`EADDRINUSE`): stop the other process, or start on a free port with `PORT` (see above).
- **421 response:** you opened the app through a host name other than `127.0.0.1` or `localhost`, for example the machine name, a LAN IP or a proxy. Use `http://127.0.0.1:<port>`.
- **PowerShell says "running scripts is disabled"** for `npm` or `npx`: run `npm.cmd` / `npx.cmd`, or allow local scripts for your user with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **Line endings:** Git on Windows may check files out with CRLF (`core.autocrlf`). Per TC13 the code and tests do not assume a particular line ending or a case-sensitive file system. If a test fails only on Windows, report it as a bug.
