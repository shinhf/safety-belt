// Per-test Safety Belt service on a free port, started with the same startServer() as `npm start`.
// Only the provider transport differs: a stub returning labelled REPLAY answers (source: 'replay'),
// so every pass here is a deterministic gate result, never evidence of model accuracy (OC4).
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { startServer } from '../src/server.js';

const REPLAY = JSON.parse(readFileSync(new URL('../test/fixtures/gemini-replay.json', import.meta.url), 'utf8'));
export const KEY = 'test-key-not-real';
export const INTENT = { documentId: 'doc-synthetic-001', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only', confirmed: true };

const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// REPLAY: an inline generateContent body in the same shape as test/fixtures/gemini-replay.json.
export const modelAnswer = (fields) => ({
  candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(fields) }] }, finishReason: 'STOP', index: 0 }],
  modelVersion: 'gemini-4-hydrogen',
  responseId: 'replay-inline',
});

// Inline interpretation fields; override what differs from a clear USD 1 one-off answer.
export const terms = (over = {}) => ({
  upfrontCents: 100, currency: 'USD', merchantName: 'Paperlane Demo', billingKind: 'one_off',
  renewalCents: null, renewalInterval: null, trialDays: null, evidenceStatus: 'clear',
  quotations: ['USD 1.00 charged once to convert one document.'], ...over,
});

const FAILURES = {
  http500: () => respond({ error: { code: 500, message: 'replay internal error' } }, 500),
  timeout: () => { throw new DOMException('replay timeout', 'TimeoutError'); },
  malformed: () => new Response('{"candidates": [', { status: 200 }),
};

function createStub() {
  const queue = [];
  const requests = []; // every outgoing provider request, for privacy assertions
  return {
    requests,
    fetch: async (url, init) => {
      requests.push({ url, init });
      const next = queue.shift();
      if (!next) throw new Error('stub: no replay answer queued'); // surfaces as PROVIDER_NETWORK
      return next();
    },
    replay(name) { queue.push(() => respond(REPLAY[name].body, REPLAY[name].status)); },
    answer(fields) { queue.push(() => respond(modelAnswer(fields))); },
    fail(kind) { queue.push(FAILURES[kind]); },
    // Queues a replay that is only answered when the returned function is called.
    hold(name) {
      let release;
      const gate = new Promise((r) => { release = r; });
      queue.push(async () => { await gate; return respond(REPLAY[name].body, REPLAY[name].status); });
      return release;
    },
  };
}

export const test = base.extend({
  stub: async ({}, use) => { await use(createStub()); },
  service: async ({ stub }, use) => {
    const { server, url } = await startServer({ port: 0, gemini: { apiKey: KEY, fetch: stub.fetch } });
    await use({ url });
    server.closeAllConnections();
    server.close();
  },
  baseURL: async ({ service }, use) => { await use(service.url); },
  state: async ({ request }, use) => { await use(async () => (await request.get('/api/state')).json()); },
});
export { expect };

const isPost = (path) => (r) => new URL(r.url()).pathname === path && r.request().method() === 'POST';

// init() wires the forms only after its first refresh() renders the state (public/app.js:116-120).
// Acting before that falls back to a native GET form submission, so every spec opens the page through here.
export async function open(page) {
  await page.goto('/');
  await expect(page.locator('#revision')).not.toBeEmpty();
}

// Confirms the approval on Safety Belt's own form, as a user does.
export async function approve(page, cap = '2.00') {
  await page.getByLabel('Maximum charge (USD)').fill(cap);
  await page.getByRole('checkbox', { name: /I approve one conversion/ }).check();
  const saved = page.waitForResponse(isPost('/api/intent'));
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  expect((await saved).status()).toBe(200);
}

export async function chooseVariant(page, variantId) {
  const switched = page.waitForResponse(isPost('/api/checkout'));
  await page.getByLabel('Checkout variant').selectOption(variantId);
  expect((await switched).status()).toBe(200);
}

export const payButton = (page) => page.getByRole('button', { name: 'Pay and convert' });

// Clicks Pay (or presses Enter on it) and waits until the submit handler has finished: Pay is re-enabled
// in its `finally`, which then reloads GET /api/state (public/app.js:172-176). Returns the /api/decide body.
export async function pay(page, { key = false } = {}) {
  const decided = page.waitForResponse(isPost('/api/decide'));
  // The first GET /api/state requested after POST /api/decide is the handler's own refresh,
  // not a refresh still in flight from an earlier action.
  let decideSent = false;
  const refreshed = page.waitForRequest((req) => {
    const path = new URL(req.url()).pathname;
    if (req.method() === 'POST' && path === '/api/decide') decideSent = true;
    return decideSent && req.method() === 'GET' && path === '/api/state';
  });
  if (key) await payButton(page).press('Enter');
  else await payButton(page).click();
  const body = await (await decided).json();
  await expect(payButton(page)).toBeEnabled();
  await (await refreshed).response();
  return body;
}

export const waitForPost = (page, path) => page.waitForResponse(isPost(path));

export const NO_EFFECTS = { executions: 0, payments: [], subscriptions: [], conversionStatus: 'not_started' };
export const effects = ({ executions, payments, subscriptions, conversionStatus }) => ({ executions, payments, subscriptions, conversionStatus });
