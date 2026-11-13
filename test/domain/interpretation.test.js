import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, selectVariant } from '../../src/domain/checkout.js';
import { RESPONSE_SCHEMA, validateInterpretation, MAX_QUOTE_CHARS } from '../../src/domain/interpretation.js';

const snap = (variantId) => selectVariant(createSession(), variantId);
const oneOff = snap('one-off-usd1');
const trial = snap('trial-recurring');

const ONE_OFF = {
  upfrontCents: 100, currency: 'USD', merchantName: 'Paperlane Demo', billingKind: 'one_off',
  renewalCents: null, renewalInterval: null, trialDays: null, evidenceStatus: 'clear',
  quotations: ['USD 1.00 charged once to convert one document.', 'No subscription and no further charges.'],
};
const RECURRING = {
  upfrontCents: 100, currency: 'USD', merchantName: 'Paperlane Demo', billingKind: 'recurring',
  renewalCents: 4995, renewalInterval: 'month', trialDays: 7, evidenceStatus: 'clear',
  quotations: ['Free 7-day trial, then USD 49.95 per month until cancelled.'],
};
const run = (answer, snapshot = oneOff) => validateInterpretation(JSON.stringify(answer), snapshot);
const reasons = (answer, snapshot) => run(answer, snapshot).reasons;

test('clear one-off answer that matches the fixture is accepted', () => {
  assert.deepEqual(run(ONE_OFF), { ok: true, reasons: [], interpretation: ONE_OFF });
});

test('clear recurring answer that matches the fixture is accepted', () => {
  assert.equal(run(RECURRING, trial).ok, true);
});

test('schema and validator share one closed field list', () => {
  assert.equal(RESPONSE_SCHEMA.additionalProperties, false);
  assert.deepEqual(Object.keys(RESPONSE_SCHEMA.properties).sort(), [...RESPONSE_SCHEMA.required].sort());
  assert.deepEqual(Object.keys(ONE_OFF).sort(), [...RESPONSE_SCHEMA.required].sort());
});

test('non-JSON, truncated and empty answers are malformed', () => {
  for (const raw of ['The plan is one-off.', '{"upfrontCents": 1', '', 'null', '[]']) {
    const r = validateInterpretation(raw, oneOff);
    assert.equal(r.ok, false, raw);
    assert.equal(r.interpretation, null);
  }
});

test('a smuggled decision field is rejected', () => {
  assert.deepEqual(reasons({ ...ONE_OFF, decision: 'ALLOW' }), ['EXTRA_FIELD']);
});

test('a missing field is rejected', () => {
  const { trialDays, ...rest } = ONE_OFF;
  assert.deepEqual(reasons(rest), ['MISSING_FIELD']);
});

test('negative, fractional, unsafe and string cents are rejected', () => {
  for (const v of [-1, 1.5, 2 ** 53, '100']) assert.deepEqual(reasons({ ...ONE_OFF, upfrontCents: v }), ['BAD_INTEGER'], String(v));
});

test('bad enums, currency and quotation shapes are rejected', () => {
  assert.deepEqual(reasons({ ...ONE_OFF, billingKind: 'lifetime' }), ['BAD_BILLING_KIND']);
  assert.deepEqual(reasons({ ...ONE_OFF, evidenceStatus: 'certain' }), ['BAD_EVIDENCE_STATUS']);
  assert.deepEqual(reasons({ ...RECURRING, renewalInterval: 'fortnight' }, trial), ['BAD_INTERVAL']);
  assert.deepEqual(reasons({ ...ONE_OFF, currency: 'usd' }), ['BAD_CURRENCY']);
  assert.deepEqual(reasons({ ...ONE_OFF, quotations: [''] }), ['BAD_QUOTATIONS']);
  assert.deepEqual(reasons({ ...ONE_OFF, quotations: ['x'.repeat(MAX_QUOTE_CHARS + 1)] }), ['BAD_QUOTATIONS']);
  assert.deepEqual(reasons({ ...ONE_OFF, quotations: Array(6).fill('USD 1.00') }), ['BAD_QUOTATIONS']);
});

test('a fabricated or altered quotation is rejected', () => {
  assert.deepEqual(reasons({ ...ONE_OFF, quotations: ['Charged once, never again.'] }), ['QUOTE_NOT_IN_DISCLOSURE']);
  assert.deepEqual(reasons({ ...ONE_OFF, quotations: ['usd 1.00 charged once'] }), ['QUOTE_NOT_IN_DISCLOSURE']);
});

test('clear evidence needs at least one quotation', () => {
  assert.deepEqual(reasons({ ...ONE_OFF, quotations: [] }), ['NO_QUOTATIONS']);
});

test('non-clear evidence is never accepted, even with plausible values', () => {
  for (const s of ['missing', 'contradictory', 'uncertain', 'unsupported']) {
    assert.deepEqual(reasons({ ...ONE_OFF, evidenceStatus: s }), [`EVIDENCE_${s.toUpperCase()}`]);
  }
});

test('internally inconsistent answers are rejected', () => {
  assert.deepEqual(reasons({ ...ONE_OFF, trialDays: 7 }), ['ONE_OFF_WITH_RENEWAL_FIELDS']);
  assert.deepEqual(reasons({ ...RECURRING, renewalCents: null }, trial), ['RECURRING_INCOMPLETE']);
  assert.deepEqual(reasons({ ...ONE_OFF, billingKind: 'unknown' }), ['BILLING_KIND_UNKNOWN']);
  assert.deepEqual(reasons({ ...ONE_OFF, upfrontCents: null }), ['UPFRONT_MISSING']);
  assert.deepEqual(reasons({ ...ONE_OFF, merchantName: 'DocuQuick Demo' }), ['MERCHANT_MISMATCH']);
});

test('an injection-obeying one-off answer for the recurring checkout is a commitment mismatch', () => {
  // Shape-valid, quotes verbatim from the disclosure, but contradicts what the fixture would execute.
  const obeyed = { ...ONE_OFF, quotations: ['USD 1 today.'] };
  assert.deepEqual(reasons(obeyed, trial), ['COMMITMENT_MISMATCH']);
});

test('an amount that disagrees with the fixture commitment is a mismatch', () => {
  assert.deepEqual(reasons({ ...ONE_OFF, upfrontCents: 300 }), ['COMMITMENT_MISMATCH']);
});
