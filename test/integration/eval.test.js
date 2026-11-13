// Task 8 runner over the real labelled case file, with a REPLAY transport (synthetic answers, never live evidence).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { runEval } from '../../src/eval.js';

const SET = JSON.parse(readFileSync(new URL('../../eval/billing-cases.json', import.meta.url), 'utf8'));

// A replay "model" that answers each disclosure with that case's expected fields (or abstains), quoting it verbatim.
function replayFor(set) {
  return mock.fn(async (_url, init) => {
    const data = JSON.parse(init.body).contents[0].parts[0].text;
    const c = set.cases.find((x) => data.includes(JSON.stringify(x.disclosureText)));
    const e = c.expected;
    const answer = e.billingKind
      ? { ...e, merchantName: set.merchantDisplayName, quotations: [c.disclosureText] }
      : { upfrontCents: null, currency: null, merchantName: set.merchantDisplayName, billingKind: 'unknown', renewalCents: null,
        renewalInterval: null, trialDays: null, evidenceStatus: e.evidenceStatus, quotations: [] };
    const ordered = Object.fromEntries(['upfrontCents', 'currency', 'merchantName', 'billingKind', 'renewalCents', 'renewalInterval',
      'trialDays', 'evidenceStatus', 'quotations'].map((k) => [k, answer[k] ?? null]));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(ordered) }] }, finishReason: 'STOP' }], modelVersion: 'replay', responseId: `replay-${c.id}` }));
  });
}

test('runner scores every labelled case through the production pipeline and labels the run replay', async () => {
  const fetch = replayFor(SET);
  const run = await runEval(SET, { apiKey: 'test-key-not-real', fetch, source: 'replay' });
  assert.equal(run.source, 'replay');
  assert.equal(run.records.length, SET.cases.length);
  assert.ok(SET.cases.length >= 8);
  assert.deepEqual(run.summary, {
    total: 10, passed: 10, failed: 0, corePassed: 5, coreTotal: 5, notMeasured: 0,
    abstentions: 4, validatorRejections: 0, forbiddenAuthorizations: 0, classMatches: 10,
  });
  assert.ok(run.records.every((r) => r.source === 'replay'), 'every record carries its own source label');
  assert.deepEqual(run.records.filter((r) => r.authorized).map((r) => r.id).sort(), ['one-off-explicit-a', 'one-off-explicit-b']);
});

test('labels and the local commitment never reach the model', async () => {
  const fetch = replayFor(SET);
  await runEval(SET, { apiKey: 'test-key-not-real', fetch, source: 'replay' });
  assert.equal(fetch.mock.callCount(), SET.cases.length);
  for (const call of fetch.mock.calls) {
    const sent = JSON.parse(call.arguments[1].body);
    const data = JSON.parse(sent.contents[0].parts[0].text.replace(/^<data>\n|\n<\/data>$/g, ''));
    assert.deepEqual(Object.keys(data).sort(), ['disclosureText', 'merchantDisplayName']);
    for (const leak of ['expected', 'mayAuthorize', 'commitment', 'core', 'evidenceStatus":"missing']) {
      assert.ok(!sent.contents[0].parts[0].text.includes(leak), leak);
    }
  }
});

test('a missing key skips every call and leaves every case not measured', async () => {
  const fetch = replayFor(SET);
  const run = await runEval(SET, { apiKey: '', fetch, source: 'live' });
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(run.summary.passed, 0);
  assert.equal(run.summary.notMeasured, SET.cases.length);
});

test('rate limiting partway through fails those cases and every finished record is reported as it completes', async () => {
  const answer = replayFor(SET);
  let calls = 0;
  const fetch = mock.fn(async (url, init) => (++calls > 6 ? new Response('{}', { status: 429 }) : answer(url, init)));
  const seen = [];
  const run = await runEval(SET, { apiKey: 'test-key-not-real', fetch, source: 'replay' }, { onRecord: (r) => seen.push(r.id) });
  assert.deepEqual(seen, SET.cases.map((c) => c.id), 'onRecord fires once per case, in order');
  assert.equal(run.summary.notMeasured, 4);
  assert.equal(run.summary.passed, 6);
});

test('the live script without a key prints SKIPPED, exits 2 and writes no run record', () => {
  const runs = new URL('../../eval/runs/', import.meta.url);
  const before = existsSync(runs) ? readdirSync(runs).length : 0;
  let status = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [new URL('../../scripts/eval-gemini.js', import.meta.url).pathname], {
      env: { PATH: process.env.PATH }, encoding: 'utf8',
    });
  } catch (err) { status = err.status; out = err.stdout; }
  assert.equal(status, 2);
  assert.match(out, /^SKIPPED/);
  assert.equal(existsSync(runs) ? readdirSync(runs).length : 0, before);
});
