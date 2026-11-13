// POST /api/decide through the real HTTP service. Provider answers are labelled synthetic REPLAY fixtures.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer } from '../../src/server.js';

const REPLAY = JSON.parse(readFileSync(new URL('../fixtures/gemini-replay.json', import.meta.url), 'utf8'));
const INTENT = { documentId: 'doc-synthetic-001', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only', confirmed: true };
const replay = (name) => mock.fn(async () => new Response(JSON.stringify(REPLAY[name].body), { status: REPLAY[name].status }));

async function service(t, { fetch = replay('one-off-clear'), apiKey = 'test-key-not-real', variantId } = {}) {
  const { server, url } = await startServer({ port: 0, gemini: { apiKey, fetch } });
  t.after(() => server.close());
  const post = async (path, body = {}) => {
    const res = await globalThis.fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  if (variantId) await post('/api/checkout', { variantId });
  return { post };
}

test('USD 1 one-off within the approved USD 2 cap is ALLOW with an opaque grant', async (t) => {
  const svc = await service(t);
  await svc.post('/api/intent', INTENT);
  await svc.post('/api/interpret');
  const { status, body } = await svc.post('/api/decide');
  assert.equal(status, 200);
  assert.equal(body.decision.decision, 'ALLOW');
  assert.match(body.grantId, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(body.decision.commitment, undefined, 'hidden commitment never leaves the service');
});

test('USD 1 trial then USD 49.95 monthly is CONFLICT with no grant', async (t) => {
  const svc = await service(t, { variantId: 'trial-recurring', fetch: replay('recurring-clear') });
  await svc.post('/api/intent', INTENT);
  await svc.post('/api/interpret');
  const { body } = await svc.post('/api/decide');
  assert.equal(body.decision.decision, 'CONFLICT');
  assert.deepEqual(body.decision.reasons, ['RECURRING_NOT_APPROVED']);
  assert.equal(body.grantId, null);
});

test('no intent, no interpretation, missing key or a model obeying injected text never ALLOW', async (t) => {
  const noIntent = await service(t);
  assert.deepEqual((await noIntent.post('/api/decide')).body.decision.reasons, ['INTENT_MISSING', 'INTERPRETATION_MISSING']);

  const noCheck = await service(t);
  await noCheck.post('/api/intent', INTENT);
  assert.equal((await noCheck.post('/api/decide')).body.decision.decision, 'CLARIFY');

  const noKey = await service(t, { apiKey: '' });
  await noKey.post('/api/intent', INTENT);
  await noKey.post('/api/interpret');
  const d = (await noKey.post('/api/decide')).body;
  assert.equal(d.decision.decision, 'CLARIFY');
  assert.ok(d.decision.reasons.includes('NO_API_KEY'));

  // The recurring checkout, but the model answered "one-off": rejected, never allowed.
  const lied = await service(t, { variantId: 'trial-recurring', fetch: replay('one-off-clear') });
  await lied.post('/api/intent', INTENT);
  await lied.post('/api/interpret');
  const l = (await lied.post('/api/decide')).body;
  assert.notEqual(l.decision.decision, 'ALLOW');
  assert.equal(l.grantId, null);
});

test('the browser cannot submit a verdict, interpretation or grant to decide', async (t) => {
  const svc = await service(t, { variantId: 'trial-recurring', fetch: replay('recurring-clear') });
  await svc.post('/api/intent', INTENT);
  await svc.post('/api/interpret');
  for (const body of [{ decision: 'ALLOW' }, { grantId: 'x' }, { interpretation: { billingKind: 'one_off' } }]) {
    const r = await svc.post('/api/decide', body);
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'UNKNOWN_FIELD');
  }
});

test('an earlier interpretation cannot ALLOW after the checkout or intent changes or a reset', async (t) => {
  const svc = await service(t);
  await svc.post('/api/intent', INTENT);
  await svc.post('/api/interpret');
  assert.equal((await svc.post('/api/decide')).body.decision.decision, 'ALLOW');

  await svc.post('/api/checkout', { variantId: 'one-off-usd1' }); // same terms, new revision
  const afterSwitch = (await svc.post('/api/decide')).body;
  assert.equal(afterSwitch.decision.decision, 'CLARIFY');
  assert.equal(afterSwitch.grantId, null);

  await svc.post('/api/interpret');
  assert.equal((await svc.post('/api/decide')).body.decision.decision, 'ALLOW');
  await svc.post('/api/intent', { ...INTENT, capCents: 150 });
  assert.equal((await svc.post('/api/decide')).body.grantId, null);

  await svc.post('/api/interpret');
  await svc.post('/api/reset');
  await svc.post('/api/intent', INTENT);
  assert.equal((await svc.post('/api/decide')).body.grantId, null);
});

test('USD 3 one-off is CONFLICT over the cap; a cap of exactly USD 1 still allows USD 1', async (t) => {
  const svc = await service(t, { variantId: 'one-off-usd3', fetch: replay('one-off-clear') });
  await svc.post('/api/intent', INTENT);
  await svc.post('/api/interpret');
  // the USD 1 replay disagrees with the USD 3 commitment, so the model answer alone can't allow it
  assert.notEqual((await svc.post('/api/decide')).body.decision.decision, 'ALLOW');

  const exact = await service(t);
  await exact.post('/api/intent', { ...INTENT, capCents: 100 });
  await exact.post('/api/interpret');
  assert.equal((await exact.post('/api/decide')).body.decision.decision, 'ALLOW');
  await exact.post('/api/intent', { ...INTENT, capCents: 99 });
  await exact.post('/api/interpret');
  const over = (await exact.post('/api/decide')).body.decision;
  assert.equal(over.decision, 'CONFLICT');
  assert.deepEqual(over.reasons, ['OVER_CAP']);
});
