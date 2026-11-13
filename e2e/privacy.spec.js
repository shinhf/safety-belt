// Done-when 5: what leaves the service (provider payload, served assets, API responses) and what it refuses.
import http from 'node:http';
import { VARIANTS } from '../src/domain/checkout.js';
import { test, expect, KEY, INTENT, approve, chooseVariant, pay, terms, effects, NO_EFFECTS } from './fixtures.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent';
// Values the provider must never see: the key, the approval, internal ids, grants/payments, hidden evaluation labels.
const NEVER_TO_PROVIDER = [KEY, 'doc-synthetic-001', 'paperlane-demo', 'convert-one-document', 'synthetic-report',
  'intentId', 'capCents', 'one_off_only', 'grantId', 'paymentId', 'EXPECTED', 'ALLOW', 'CONFLICT', 'CLARIFY',
  'one-off-usd1', 'trial-recurring', 'chk-paperlane-001'];
// Values no browser-facing byte may contain: the key and the hidden labels / owned commitment.
const NEVER_TO_BROWSER = [KEY, 'GEMINI_API_KEY', 'EXPECTED_DECISIONS', '"commitment"', 'x-goog-api-key'];

// Raw HTTP so the test controls Host and un-normalised paths (fetch forbids Host).
function raw(baseUrl, { method = 'GET', path = '/', headers = {}, body } = {}) {
  const { port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

// Recurring pause, then one-off completion: every API route the page uses.
async function journey(page, stub) {
  stub.replay('recurring-clear');
  stub.replay('one-off-clear');
  await page.goto('/');
  await approve(page);
  await chooseVariant(page, 'trial-recurring');
  await pay(page);
  await chooseVariant(page, 'one-off-usd1');
  await pay(page);
  await expect(page.getByRole('region', { name: 'Done (simulated)' })).toBeVisible();
}

test('[gate·replay] provider requests carry only the merchant name and disclosure', async ({ page, stub }) => {
  await journey(page, stub);
  expect(stub.requests).toHaveLength(2);
  const sent = stub.requests.map(({ url, init }) => {
    expect(url).toBe(ENDPOINT);
    for (const value of NEVER_TO_PROVIDER) expect(init.body, value).not.toContain(value);
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(['contents', 'generationConfig', 'systemInstruction']);
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].parts).toHaveLength(1);
    const [, data] = /^<data>\n(.*)\n<\/data>$/s.exec(body.contents[0].parts[0].text);
    return JSON.parse(data);
  });
  expect(sent).toEqual([
    { merchantDisplayName: 'Paperlane Demo', disclosureText: VARIANTS['trial-recurring'].disclosure },
    { merchantDisplayName: 'Paperlane Demo', disclosureText: VARIANTS['one-off-usd1'].disclosure },
  ]);
});

test('[gate·replay] served assets and every API response hold no key or hidden labels', async ({ page, stub, request }) => {
  const reads = [];
  page.on('response', (r) => { reads.push(r.text().then((text) => ({ url: r.url(), text }))); });
  await journey(page, stub);
  const fromPage = await Promise.all(reads);
  expect(fromPage.map((r) => new URL(r.url).pathname)).toEqual(expect.arrayContaining(
    ['/', '/app.js', '/styles.css', '/api/variants', '/api/state', '/api/intent', '/api/checkout', '/api/interpret', '/api/decide', '/api/submit'],
  ));
  const direct = await Promise.all(['/', '/app.js', '/styles.css', '/api/variants', '/api/state']
    .map(async (path) => ({ url: path, text: await (await request.get(path)).text() })));
  for (const { url, text } of [...fromPage, ...direct]) {
    for (const value of NEVER_TO_BROWSER) expect(text, `${url} contains ${value}`).not.toContain(value);
  }
});

test('[gate·replay] environment and source files are not served', async ({ service }) => {
  for (const path of ['/.env', '/../.env', '/%2e%2e/.env', '/public/../.env', '/src/server.js', '/package.json', '/test/fixtures/gemini-replay.json']) {
    const res = await raw(service.url, { path, headers: { Host: new URL(service.url).host } });
    expect(res.status, path).toBe(404);
    expect(JSON.parse(res.body), path).toEqual({ error: 'NOT_FOUND' });
  }
});

test('[gate·replay] cross-origin mutations are refused with 403 and change nothing', async ({ stub, state, request }) => {
  stub.replay('one-off-clear');
  await request.post('/api/intent', { data: INTENT });
  await request.post('/api/interpret', { data: {} });
  const { grantId } = await (await request.post('/api/decide', { data: {} })).json();
  expect(typeof grantId).toBe('string');
  const before = await state();

  const evil = { Origin: 'http://evil.example' };
  for (const [path, data] of [['/api/submit', { grantId }], ['/api/checkout', { variantId: 'trial-recurring' }],
    ['/api/intent', { ...INTENT, capCents: 99_999_999 }], ['/api/interpret', {}], ['/api/decide', {}], ['/api/reset', {}]]) {
    const res = await request.post(path, { headers: evil, data });
    expect(res.status(), path).toBe(403);
    expect(await res.json(), path).toEqual({ error: 'FORBIDDEN_ORIGIN' });
  }
  expect(await state()).toEqual(before);
  expect(stub.requests).toHaveLength(1);
  // The grant was valid all along: the same-origin submit still pays once.
  expect((await request.post('/api/submit', { data: { grantId } })).status()).toBe(200);
});

test('[gate·replay] an unexpected Host header is refused with 421 and changes nothing', async ({ service, state }) => {
  const before = await state();
  const port = new URL(service.url).port;
  for (const Host of ['evil.example', `evil.example:${port}`, `127.0.0.1:${Number(port) + 1}`]) {
    expect((await raw(service.url, { path: '/', headers: { Host } })).status, Host).toBe(421);
    const res = await raw(service.url, {
      method: 'POST', path: '/api/reset', headers: { Host, 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(res.status, Host).toBe(421);
    expect(JSON.parse(res.body)).toEqual({ error: 'MISDIRECTED_HOST' });
  }
  expect(await state()).toEqual(before);
});

test('[gate·replay] HTML-like quotations from the model create no element and run no script', async ({ page, stub, state }) => {
  stub.answer(terms({ quotations: ['<img src=x onerror="window.__sbXss=1">', '<script>window.__sbXss=2</script>'] }));
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto('/');
  await approve(page);
  const { decision } = await pay(page);
  expect(decision.decision).toBe('CLARIFY');
  await expect(page.getByRole('heading', { name: 'Paused: Safety Belt needs clear terms before any payment.' })).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('script')).toHaveCount(1); // only /app.js
  expect(await page.evaluate(() => window.__sbXss)).toBeUndefined();
  expect(dialogs).toEqual([]);
  const s = await state();
  expect(s.check.reasons).toContain('QUOTE_NOT_IN_DISCLOSURE');
  expect(s.outcomes.attemptedSubmissions).toBe(0);
  expect(effects(s.outcomes)).toEqual(NO_EFFECTS);
});
