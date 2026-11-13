# Safety Belt

Safety Belt pauses a supported desktop-browser checkout when its disclosed billing commitment conflicts with the user's explicitly approved intent, while preserving legitimate task completion.

**Status:** implementation backlog only; the application has not been built or tested.

## MVP: one PDF, one payment

The user selects a synthetic document and independently approves one conversion at the fictional merchant **Paperlane Demo**, paying at most **USD 2 once**, with no recurring subscription. A fictional checkout charging **USD 1 today, then USD 49.95 monthly after seven days** must pause before any simulated execution. An explicitly one-off USD 1 checkout must complete one simulated payment and conversion. Changed terms invalidate approval, including changes immediately before submission.

Journey: select demo document → confirm intent on Safety Belt's own surface → inspect checkout → interpret disclosed terms → apply deterministic rules → either explain the pause or complete the permitted simulation once.

Use synthetic documents and payment state. Conversion is a simulated completion transition; no PDF engine, card form or payment processor is required. Subscription review is read-only. Returning to the supported one-off checkout provides recovery.

## Selected technologies

- **Node.js 24 LTS and npm:** one local JavaScript service using built-in HTTP, fetch, crypto and test modules; in-memory state.
- **HTML, CSS and vanilla JavaScript:** one desktop-browser flow, served by the same service; no frontend build framework.
- **Gemini 3.8 Flash via REST with JSON Schema:** one semantic interpreter of disclosed billing wording; service-side key and validation. It cannot authorize actions.
- **Playwright Test with Chromium:** focused browser verification of the supported checkout boundary.

No database, cloud deployment, browser extension, OCR, GPU/NPU pipeline, account system, real merchant integration, live payment or subscription enrollment is in scope. The demonstrable claim applies only to this owned checkout and its disclosed terms.

## Ready for development

See the [ordered implementation backlog](docs/mvp-backlog.md) for tasks, acceptance criteria, dependencies and the Definition of Done. See [technical decisions and source reconciliation](docs/technical-decisions.md) for the shared contract and evidence.

The repository contains planning artifacts only. Model credentials and a live provider smoke check are implementation prerequisites; no working integration or measured prevention result is claimed.
