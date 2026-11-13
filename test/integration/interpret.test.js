// POST /api/interpret through the real HTTP service with a stubbed provider transport.
// Every provider answer here is a labelled synthetic REPLAY (test/fixtures/gemini-replay.json).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer } from '../../src/server.js';
import { RESPONSE_SCHEMA } from '../../src/domain/interpretation.js';

const REPLAY = JSON.parse(readFileSync(new URL('../fixtures/gemini-replay.json', import.meta.url), 'utf8'));
const KEY = 'test-key-not-real';
const INTENT = { documentId: 'doc-synthetic-001', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only', confirmed: true };

const replay = (name) => mock.fn(async () => new Response(JSON.stringify(REPLAY[name].body), { status: REPLAY[name].status }));

async function service(t, { apiKey = KEY, fetch = replay('one-off-clear'), intent = true, variantId } = {}) {
  const { server, url } = await startServer({ port: 0, gemini: { apiKey, fetch } });
  t.after(() => server.close());
  const post = (path, body = {}) => globalThis.fetch(url + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (variantId) await post('/api/checkout', { variantId });
  if (intent) await post('/api/intent', INTENT);
  return { url, post, fetch };
}

async function interpret(svc) {
  const res = await svc.post('/api/interpret');
  return { status: res.status, text: await res.clone().text(), body: await res.json() };
}

test('one-off replay is interpreted, tagged and labelled replay', async (t) => {
  const svc = await service(t);
  const state = await (await globalThis.fetch(svc.url + '/api/state')).json();
  const { status, body: { check } } = await interpret(svc);
  assert.equal(status, 200);
  assert.equal(check.status, 'interpreted');
  assert.equal(check.source, 'replay');
  assert.deepEqual(check.tags, { intentRevision: state.intent.revision, checkoutId: state.checkout.checkoutId, checkoutRevision: state.checkout.revision });
  assert.deepEqual(check.input, { merchantDisplayName: 'Paperlane Demo', disclosureText: state.checkout.disclosure });
  assert.equal(check.interpretation.billingKind, 'one_off');
  assert.equal(check.provider.responseId, 'replay-one-off-clear');
  assert.equal(check.decision, undefined, 'interpretation never carries a decision');
});

test('request goes to the fixed endpoint with only public merchant name and disclosure', async (t) => {
  const svc = await service(t, { variantId: 'trial-recurring', fetch: replay('recurring-clear') });
  const { body: { check } } = await interpret(svc);
  assert.equal(check.status, 'interpreted');
  assert.equal(svc.fetch.mock.callCount(), 1);
  const [url, init] = svc.fetch.mock.calls[0].arguments;
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent');
  assert.ok(!url.includes(KEY), 'key never in the URL');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-goog-api-key'], KEY);
  assert.ok(init.signal instanceof AbortSignal, 'finite timeout signal');
  assert.equal(init.redirect, 'error', 'the key header is never forwarded to a redirect target');
  const sent = JSON.parse(init.body);
  assert.deepEqual(Object.keys(sent).sort(), ['contents', 'generationConfig', 'systemInstruction']);
  assert.equal(sent.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(sent.generationConfig.responseJsonSchema, RESPONSE_SCHEMA, 'schema sent is the schema validated');
  for (const p of ['temperature', 'topP', 'topK']) assert.equal(sent.generationConfig[p], undefined, `Hydrogen ignores ${p}`);
  const data = sent.contents[0].parts[0].text;
  assert.equal(sent.contents.length, 1);
  assert.equal(data, `<data>\n${JSON.stringify({ merchantDisplayName: 'Paperlane Demo', disclosureText: 'USD 1 today. Free 7-day trial, then USD 49.95 per month until cancelled.' })}\n</data>`);
  // Hidden commitment, labels, intent and document never leave the service.
  for (const leak of ['4995', 'CONFLICT', 'doc-synthetic-001', 'capCents', 'one_off_only', 'paperlane-demo', 'trialMonthly', KEY]) {
    assert.ok(!init.body.includes(leak), `request must not carry ${leak}`);
  }
});

test('missing key fails closed with no provider call', async (t) => {
  const svc = await service(t, { apiKey: '' });
  const { body: { check } } = await interpret(svc);
  assert.deepEqual([check.status, check.reasons], ['unavailable', ['NO_API_KEY']]);
  assert.equal(svc.fetch.mock.callCount(), 0);
});

test('no confirmed intent refuses before any provider call', async (t) => {
  const svc = await service(t, { intent: false });
  const { status, body } = await interpret(svc);
  assert.deepEqual([status, body.error], [409, 'INTENT_REQUIRED']);
  assert.equal(svc.fetch.mock.callCount(), 0);
});

test('provider failures are unavailable with a sanitized code and never leak the key or body', async (t) => {
  const cases = [
    ['HTTP 429', async () => new Response('{"error":{"message":"quota secret-detail"}}', { status: 429 }), 'PROVIDER_HTTP_429'],
    ['HTTP 500', async () => new Response('oops secret-detail', { status: 500 }), 'PROVIDER_HTTP_500'],
    ['HTTP 400', async () => new Response('{"error":{"code":400,"message":"secret-detail"}}', { status: 400 }), 'PROVIDER_HTTP_400'],
    ['HTTP 402 credits depleted', async () => new Response('{"error":{"code":402,"message":"secret-detail"}}', { status: 402 }), 'PROVIDER_HTTP_402'],
    ['network', async () => { throw new TypeError('fetch failed secret-detail'); }, 'PROVIDER_NETWORK'],
    ['timeout', async () => { throw new DOMException('secret-detail', 'TimeoutError'); }, 'PROVIDER_TIMEOUT'],
    ['MAX_TOKENS', replay('incomplete'), 'PROVIDER_INCOMPLETE'],
    ['blocked prompt', replay('safety-block'), 'PROVIDER_BLOCKED'],
    ['no candidates', async () => new Response('{"candidates":[]}', { status: 200 }), 'PROVIDER_INCOMPLETE'],
    ['finishReason SAFETY', async () => new Response('{"candidates":[{"finishReason":"SAFETY","content":{"parts":[{"text":"secret-detail"}]}}]}'), 'PROVIDER_INCOMPLETE'],
    ['HTTP 403', async () => new Response('{"error":{"message":"secret-detail"}}', { status: 403 }), 'PROVIDER_HTTP_403'],
    ['non-array parts', async () => new Response('{"candidates":[{"finishReason":"STOP","content":{"parts":"secret-detail"}}]}'), 'PROVIDER_BAD_RESPONSE'],
    ['oversized body', async () => new Response('x'.repeat(70_000) + 'secret-detail'), 'PROVIDER_BAD_RESPONSE'],
    ['timeout during body read', async () => new Response(new ReadableStream({ pull(c) { c.error(new DOMException('secret-detail', 'TimeoutError')); } })), 'PROVIDER_TIMEOUT'],
    ['non-JSON 200', async () => new Response('<html>secret-detail</html>', { status: 200 }), 'PROVIDER_BAD_RESPONSE'],
    ['endless stream, no content-length', async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(16_384)); } })), 'PROVIDER_BAD_RESPONSE'],
  ];
  for (const [name, fetch, code] of cases) {
    const svc = await service(t, { fetch: mock.fn(fetch) });
    const { text, body: { check } } = await interpret(svc);
    assert.deepEqual([check.status, check.reasons], ['unavailable', [code]], name);
    assert.equal(check.interpretation, null, name);
    assert.ok(!text.includes('secret-detail') && !text.includes(KEY), `${name} leaks provider text or key`);
  }
});

test('shape-valid answers that fail local checks clarify', async (t) => {
  for (const [fixture, reason] of [['fabricated-quote', 'QUOTE_NOT_IN_DISCLOSURE'], ['prose', 'MALFORMED_JSON']]) {
    const svc = await service(t, { fetch: replay(fixture) });
    const { body: { check } } = await interpret(svc);
    assert.deepEqual([check.status, check.reasons], ['clarify', [reason]], fixture);
  }
});

test('an injection-obeying one-off answer for the recurring checkout clarifies', async (t) => {
  const svc = await service(t, { variantId: 'trial-recurring', fetch: replay('one-off-clear') });
  const { body: { check } } = await interpret(svc);
  assert.equal(check.status, 'clarify');
});

test('an answer that arrives after the checkout changed is stale and not stored', async (t) => {
  let svc;
  const fetch = mock.fn(async () => {
    await svc.post('/api/checkout', { variantId: 'trial-recurring' });
    return new Response(JSON.stringify(REPLAY['one-off-clear'].body), { status: 200 });
  });
  svc = await service(t, { fetch });
  const { body: { check } } = await interpret(svc);
  assert.equal(check.status, 'stale');
  assert.equal(check.interpretation, null);
  const state = await (await globalThis.fetch(svc.url + '/api/state')).json();
  assert.equal(state.check, null);
});

for (const [name, change] of [
  ['reset', (svc) => svc.post('/api/reset')],
  ['intent re-confirmed', (svc) => svc.post('/api/intent', { ...INTENT, capCents: 150 })],
]) {
  test(`an answer that arrives after ${name} is stale and not stored`, async (t) => {
    let svc;
    const fetch = mock.fn(async () => {
      await change(svc);
      return new Response(JSON.stringify(REPLAY['one-off-clear'].body), { status: 200 });
    });
    svc = await service(t, { fetch });
    const { body: { check } } = await interpret(svc);
    assert.deepEqual([check.status, check.interpretation], ['stale', null]);
    const state = await (await globalThis.fetch(svc.url + '/api/state')).json();
    assert.equal(state.check, null);
  });
}

test('concurrent interprets for the same state share one provider call', async (t) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const fetch = mock.fn(async () => {
    await gate;
    return new Response(JSON.stringify(REPLAY['one-off-clear'].body), { status: 200 });
  });
  const svc = await service(t, { fetch });
  const pending = [interpret(svc), interpret(svc)];
  await new Promise((r) => setTimeout(r, 50));
  release();
  const results = await Promise.all(pending);
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(results.map((r) => r.body.check.status), ['interpreted', 'interpreted']);
});

test('the current check is exposed in state and cleared by re-confirming intent', async (t) => {
  const svc = await service(t);
  const { body: { check } } = await interpret(svc);
  const getState = async () => (await globalThis.fetch(svc.url + '/api/state')).json();
  assert.deepEqual((await getState()).check, check);
  await svc.post('/api/intent', { ...INTENT, capCents: 150 });
  assert.equal((await getState()).check, null);
});

test('interpret accepts no body fields', async (t) => {
  const svc = await service(t);
  const res = await svc.post('/api/interpret', { status: 'interpreted' });
  assert.equal(res.status, 400);
  assert.equal(svc.fetch.mock.callCount(), 0);
});
