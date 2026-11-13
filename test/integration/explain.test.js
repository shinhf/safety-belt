// Task 6 through the real HTTP service: decision explanations, read-only review and recovery to the one-off path.
// Provider answers are labelled synthetic REPLAY fixtures, chosen by the disclosure each request carries.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer } from '../../src/server.js';

const REPLAY = JSON.parse(readFileSync(new URL('../fixtures/gemini-replay.json', import.meta.url), 'utf8'));
const INTENT = { documentId: 'doc-synthetic-001', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only', confirmed: true };

// Answers like a model that reads the disclosure it was sent.
const byDisclosure = () => mock.fn(async (_url, init) => {
  const name = init.body.includes('per month') ? 'recurring-clear' : 'one-off-clear';
  return new Response(JSON.stringify(REPLAY[name].body), { status: 200 });
});

async function service(t, { fetch = byDisclosure(), apiKey = 'test-key-not-real' } = {}) {
  const { server, url } = await startServer({ port: 0, gemini: { apiKey, fetch } });
  t.after(() => server.close());
  const post = async (path, body = {}) => {
    const res = await globalThis.fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const state = async () => (await globalThis.fetch(url + '/api/state')).json();
  await post('/api/intent', INTENT);
  return { url, post, state, fetch };
}

const check = async (svc) => {
  await svc.post('/api/interpret');
  return (await svc.post('/api/decide')).body;
};

test('the recurring pause comes with a plain-text explanation and no grant', async (t) => {
  const svc = await service(t);
  await svc.post('/api/checkout', { variantId: 'trial-recurring' });
  const { decision, grantId, explanation } = await check(svc);
  assert.equal(decision.decision, 'CONFLICT');
  assert.equal(grantId, null);
  assert.equal(explanation.tone, 'pause');
  assert.match(explanation.approved, /at most USD 2\.00, once/);
  assert.match(explanation.disclosed, /USD 1\.00 today, then USD 49\.95 each month after 7 days/);
  assert.equal(explanation.merchant, 'Paperlane Demo');
  assert.equal(explanation.source, 'replay');
  assert.ok(explanation.evidence.length > 0);
});

test('a paused checkout has no grant, and no submit can create a payment or subscription from it', async (t) => {
  const svc = await service(t);
  await svc.post('/api/checkout', { variantId: 'trial-recurring' });
  const { grantId } = await check(svc);
  assert.equal(grantId, null);
  for (const body of [{}, { grantId: 'forged-grant' }]) await svc.post('/api/submit', body);
  const { outcomes } = await svc.state();
  assert.equal(outcomes.payments.length, 0);
  assert.equal(outcomes.subscriptions.length, 0);
  // Review itself is client-only (<details>, no request); the browser check belongs to task 7.
  const served = await (await globalThis.fetch(svc.url + '/app.js')).text();
  assert.doesNotMatch(served, /billingScope:\s*'recurring'|subscribe/i, 'the page never requests a subscription');
});

test('going back to the one-off checkout requires a fresh check, which then allows', async (t) => {
  const svc = await service(t);
  await svc.post('/api/checkout', { variantId: 'trial-recurring' });
  await check(svc);
  await svc.post('/api/checkout', { variantId: 'one-off-usd1' });
  const stale = (await svc.post('/api/decide')).body;
  assert.equal(stale.decision.decision, 'CLARIFY', 'the old check does not carry over to the new snapshot');
  assert.equal(stale.explanation.tone, 'clarify');
  assert.ok(stale.explanation.reasons.some((r) => /changed since the last check/.test(r)), 'tells the user to check again');
  assert.equal(stale.grantId, null);
  const fresh = await check(svc);
  assert.equal(fresh.decision.decision, 'ALLOW');
  assert.equal(fresh.explanation.tone, 'allow');
  assert.match(fresh.explanation.disclosed, /USD 1\.00 once/);
  assert.equal(typeof fresh.grantId, 'string');
  assert.equal(svc.fetch.mock.callCount(), 2);
});

test('a provider timeout explains a recheck and never allows', async (t) => {
  const svc = await service(t, { fetch: mock.fn(async () => { throw new DOMException('t', 'TimeoutError'); }) });
  const { decision, grantId, explanation } = await check(svc);
  assert.equal(decision.decision, 'CLARIFY');
  assert.equal(grantId, null);
  assert.equal(explanation.tone, 'clarify');
  assert.ok(explanation.reasons.includes('The terms check timed out. Check again.'));
  assert.equal(explanation.disclosed, null);
});

test('served page renders server strings as text only and labels the simulation', async (t) => {
  const svc = await service(t);
  const js = await (await globalThis.fetch(svc.url + '/app.js')).text();
  const html = await (await globalThis.fetch(svc.url + '/')).text();
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.match(html, /fictional/i);
  assert.match(html, /simulated/i);
  assert.match(html, /only this demo checkout/i);
});

test('recover end to end: recurring pause, back to one-off, fresh check, one simulated payment, zero subscriptions', async (t) => {
  const svc = await service(t);
  await svc.post('/api/checkout', { variantId: 'trial-recurring' });
  const paused = await check(svc);
  assert.equal(paused.explanation.tone, 'pause');
  assert.equal(paused.explanation.recurringDisclosed, true);
  await svc.post('/api/checkout', { variantId: 'one-off-usd1' });
  const allowed = await check(svc);
  assert.equal(allowed.explanation.tone, 'allow');
  const paid = await svc.post('/api/submit', { grantId: allowed.grantId });
  assert.equal(paid.status, 200);
  assert.deepEqual([paid.body.payment.amountCents, paid.body.payment.currency, paid.body.payment.simulated], [100, 'USD', true]);
  const { outcomes } = await svc.state();
  // These are exactly the fields the success panel reads.
  assert.equal(outcomes.conversionStatus, 'completed');
  assert.equal(outcomes.payments.length, 1);
  assert.equal(outcomes.subscriptions.length, 0);
  const replay = await svc.post('/api/submit', { grantId: allowed.grantId });
  assert.deepEqual([replay.status, replay.body.error], [409, 'ALREADY_COMPLETED']);
  assert.equal((await svc.state()).outcomes.payments.length, 1);
});
