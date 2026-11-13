// POST /api/submit through the real HTTP service: the single execution boundary for button, Enter and direct API.
// Provider answers are labelled synthetic REPLAY fixtures.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer } from '../../src/server.js';

const REPLAY = JSON.parse(readFileSync(new URL('../fixtures/gemini-replay.json', import.meta.url), 'utf8'));
const INTENT = { documentId: 'doc-synthetic-001', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only', confirmed: true };
const answer = (name) => new Response(JSON.stringify(REPLAY[name].body), { status: REPLAY[name].status });

async function service(t, fetch = mock.fn(async () => answer('one-off-clear'))) {
  const { server, url } = await startServer({ port: 0, gemini: { apiKey: 'test-key-not-real', fetch } });
  t.after(() => server.close());
  const post = async (path, body = {}) => {
    const res = await globalThis.fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const outcomes = async () => (await (await globalThis.fetch(url + '/api/state')).json()).outcomes;
  const allow = async () => {
    await post('/api/intent', INTENT);
    await post('/api/interpret');
    const { body } = await post('/api/decide');
    assert.equal(body.decision.decision, 'ALLOW');
    return body.grantId;
  };
  return { post, outcomes, allow };
}

const NONE = { executions: 0, payments: [], subscriptions: [], conversionStatus: 'not_started' };
const effects = ({ attemptedSubmissions, ...rest }) => rest;

test('allowed grant: exactly one USD 1 payment, conversion completed, zero subscriptions', async (t) => {
  const svc = await service(t);
  const grantId = await svc.allow();
  const r = await svc.post('/api/submit', { grantId });
  assert.equal(r.status, 200);
  assert.equal(r.body.payment.amountCents, 100);
  assert.equal(r.body.payment.currency, 'USD');
  const o = await svc.outcomes();
  assert.equal(o.attemptedSubmissions, 1);
  assert.equal(o.executions, 1);
  assert.deepEqual(o.payments, [r.body.payment]);
  assert.deepEqual(o.subscriptions, []);
  assert.equal(o.conversionStatus, 'completed');
});

test('missing, unknown and forged grants fail with zero side effects; attempts are still counted', async (t) => {
  const svc = await service(t);
  const grantId = await svc.allow();
  for (const [body, status, error] of [[{}, 409, 'GRANT_REQUIRED'], [{ grantId: 'nope' }, 409, 'GRANT_UNKNOWN'],
    [{ grantId: grantId.toUpperCase() }, 409, 'GRANT_UNKNOWN'], [{ grantId, decision: 'ALLOW' }, 400, 'UNKNOWN_FIELD']]) {
    const r = await svc.post('/api/submit', body);
    assert.deepEqual([r.status, r.body.error], [status, error], JSON.stringify(body));
  }
  const o = await svc.outcomes();
  assert.equal(o.attemptedSubmissions, 3, 'the malformed 400 request never reached the handler');
  assert.deepEqual(effects(o), NONE);
});

test('replayed, concurrent and retried submissions create one payment', async (t) => {
  const svc = await service(t);
  const grantId = await svc.allow();
  const results = await Promise.all(Array.from({ length: 8 }, () => svc.post('/api/submit', { grantId })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.filter((r) => r.status !== 200).every((r) => r.body.error === 'ALREADY_COMPLETED'));

  const retry = await svc.post('/api/submit', { grantId }); // e.g. the client lost the first response
  assert.deepEqual([retry.status, retry.body.error], [409, 'ALREADY_COMPLETED']);

  await svc.post('/api/interpret');
  const second = (await svc.post('/api/decide')).body.grantId; // a fresh grant for the same completed intent/document
  assert.deepEqual((await svc.post('/api/submit', { grantId: second })).body.error, 'ALREADY_COMPLETED');

  const o = await svc.outcomes();
  assert.equal(o.attemptedSubmissions, 10);
  assert.equal(o.executions, 1);
  assert.equal(o.payments.length, 1);
});

test('terms changed to recurring or a new merchant immediately before submission: no payment', async (t) => {
  for (const variantId of ['trial-recurring', 'changed-merchant', 'one-off-usd1']) {
    const svc = await service(t);
    const grantId = await svc.allow();
    await svc.post('/api/checkout', { variantId }); // mutation between check and submit (same terms still revokes)
    const r = await svc.post('/api/submit', { grantId });
    assert.deepEqual([r.status, r.body.error], [409, 'GRANT_UNKNOWN'], variantId);
    assert.deepEqual(effects(await svc.outcomes()), NONE, variantId);
  }
});

test('intent re-confirmation and reset revoke the grant', async (t) => {
  const svc = await service(t);
  let grantId = await svc.allow();
  await svc.post('/api/intent', { ...INTENT, capCents: 150 });
  assert.equal((await svc.post('/api/submit', { grantId })).body.error, 'GRANT_UNKNOWN');

  grantId = await svc.allow();
  await svc.post('/api/reset');
  assert.equal((await svc.post('/api/submit', { grantId })).body.error, 'GRANT_UNKNOWN');
  assert.deepEqual(effects(await svc.outcomes()), NONE);
});

test('a delayed model answer for the old one-off checkout cannot authorize the recurring replacement', async (t) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const svc = await service(t, mock.fn(async () => { await gate; return answer('one-off-clear'); }));
  await svc.post('/api/intent', INTENT);
  const pending = svc.post('/api/interpret'); // asked about the USD 1 one-off
  await svc.post('/api/checkout', { variantId: 'trial-recurring' }); // replaced while the model is thinking
  release();
  assert.equal((await pending).body.check.status, 'stale');
  const { body } = await svc.post('/api/decide');
  assert.notEqual(body.decision.decision, 'ALLOW');
  assert.equal(body.grantId, null);
  assert.equal((await svc.post('/api/submit', { grantId: 'anything' })).body.error, 'GRANT_UNKNOWN');
  assert.deepEqual(effects(await svc.outcomes()), NONE);
});
