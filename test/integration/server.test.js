import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { startServer } from '../../src/server.js';

let server, url;
before(async () => ({ server, url } = await startServer({ port: 0 })));
after(() => server.close());

const post = (path, body, headers = {}) => fetch(url + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

function rawRequest(path, headers) {
  return new Promise((resolve, reject) => {
    http.get(`${url}${path}`, { headers }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
}

test('serves index.html when present, with security headers', async () => {
  const res = await fetch(url + '/');
  if (!existsSync(new URL('../../public/index.html', import.meta.url))) {
    assert.equal(res.status, 404);
    return;
  }
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('environment and unlisted files are not served', async () => {
  for (const p of ['/.env', '/.env.example', '/package.json', '/public/app.js', '/../.env']) {
    assert.equal((await fetch(url + p)).status, 404, p);
  }
});

test('lists variants', async () => {
  const list = await (await fetch(url + '/api/variants')).json();
  assert.equal(list.length, 7);
  assert.ok(list.every((v) => Object.keys(v).join() === 'id,label'));
});

test('checkout switch bumps revision and hides commitment', async () => {
  const before = (await (await fetch(url + '/api/state')).json()).checkout.revision;
  const res = await post('/api/checkout', { variantId: 'trial-recurring' });
  assert.equal(res.status, 200);
  const { checkout } = await res.json();
  assert.ok(checkout.revision > before);
  assert.equal(checkout.commitment, undefined);
  assert.equal((await post('/api/checkout', { variantId: 'bogus' })).status, 400);
  assert.equal((await post('/api/checkout', { variantId: 'non-usd', extra: 1 })).status, 400);
  assert.equal((await post('/api/checkout', '{not json')).status, 400);
});

test('submit is refused and never executes', async () => {
  await post('/api/reset', {});
  const res = await post('/api/submit', {});
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'SUBMISSION_GATE_NOT_INTEGRATED' });
  const { outcomes, simulation } = await (await fetch(url + '/api/state')).json();
  assert.equal(simulation, true);
  assert.equal(outcomes.attemptedSubmissions, 1);
  assert.equal(outcomes.executions, 0);
  assert.deepEqual(outcomes.payments, []);
  assert.deepEqual(outcomes.subscriptions, []);
});

test('rejects cross-origin POST', async () => {
  assert.equal((await post('/api/reset', {}, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await post('/api/reset', {}, { Origin: url })).status, 200);
});

test('rejects non-JSON POST', async () => {
  const res = await fetch(url + '/api/reset', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
});

test('rejects unexpected Host', async () => {
  assert.equal(await rawRequest('/api/state', { Host: 'evil.example' }), 421);
  assert.equal(await rawRequest('/api/state', { Host: `localhost:${new URL(url).port}` }), 200);
});

test('rejects oversized body', async () => {
  const res = await post('/api/checkout', { variantId: 'x'.repeat(5000) });
  assert.equal(res.status, 413);
});

test('reset zeroes outcomes', async () => {
  await post('/api/submit', {});
  const state = await (await post('/api/reset', {})).json();
  assert.equal(state.outcomes.attemptedSubmissions, 0);
  assert.equal(state.outcomes.conversionStatus, 'not_started');
});

const INTENT = {
  documentId: 'doc-synthetic-001', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only', confirmed: true,
};
const getState = async () => (await fetch(url + '/api/state')).json();

test('intent is confirmed only via POST /api/intent and survives invalid edits', async () => {
  await post('/api/reset', {});
  assert.equal((await getState()).intent, null);

  const res = await post('/api/intent', INTENT);
  assert.equal(res.status, 200);
  const { intent } = await res.json();
  assert.equal(intent.capCents, 200);
  assert.equal(intent.billingScope, 'one_off_only');
  assert.equal(intent.action, 'convert-one-document');
  assert.deepEqual((await getState()).intent, intent);

  const again = (await (await post('/api/intent', { ...INTENT, capCents: 150 })).json()).intent;
  assert.equal(again.intentId, intent.intentId);
  assert.ok(again.revision > intent.revision);

  const bad = await post('/api/intent', { ...INTENT, billingScope: 'recurring' });
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'INVALID_INTENT' });
  assert.deepEqual(await (await post('/api/intent', { ...INTENT, confirmed: false })).json(), { error: 'INTENT_NOT_CONFIRMED' });
  assert.equal((await post('/api/intent', { ...INTENT, extra: 1 })).status, 400);
  assert.deepEqual((await getState()).intent, again);

  assert.equal((await post('/api/checkout', { variantId: 'trial-recurring', capCents: 500 })).status, 400);
  assert.equal((await post('/api/checkout', { variantId: 'trial-recurring' })).status, 200);
  assert.deepEqual((await getState()).intent, again);

  const reset = await (await post('/api/reset', {})).json();
  assert.equal(reset.intent, null);
  assert.equal((await getState()).intent, null);
});

test('rejects cross-origin POST /api/intent', async () => {
  await post('/api/reset', {});
  assert.equal((await post('/api/intent', INTENT, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await getState()).intent, null);
});
