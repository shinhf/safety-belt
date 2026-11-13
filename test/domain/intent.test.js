import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, selectVariant, reset } from '../../src/domain/checkout.js';
import { confirmIntent, intentView } from '../../src/domain/intent.js';

const VALID = {
  documentId: 'doc-synthetic-001', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only', confirmed: true,
};

test('confirmation stores a deep-frozen intent record', () => {
  const s = createSession();
  assert.equal(intentView(s), null);
  confirmIntent(s, VALID);
  const { intentId, revision, ...rest } = intentView(s);
  assert.match(intentId, /^[0-9a-f-]{36}$/);
  assert.ok(Number.isSafeInteger(revision) && revision > 0);
  assert.deepEqual(rest, {
    documentId: 'doc-synthetic-001', action: 'convert-one-document', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only',
  });
  assert.ok(Object.isFrozen(s.intent));
  assert.throws(() => { s.intent.billingScope = 'recurring'; }, TypeError);
});

test('invalid input is rejected with a stable code and keeps the previous intent', () => {
  const s = createSession();
  confirmIntent(s, VALID);
  const prev = s.intent;
  const cases = [
    [{ confirmed: false }, 'INTENT_NOT_CONFIRMED'],
    [{ confirmed: undefined }, 'INTENT_NOT_CONFIRMED'],
    [{ confirmed: 'true' }, 'INTENT_NOT_CONFIRMED'],
    [{ capCents: -1 }, 'INVALID_INTENT'],
    [{ capCents: 1.5 }, 'INVALID_INTENT'],
    [{ capCents: '200' }, 'INVALID_INTENT'],
    [{ capCents: Number.MAX_SAFE_INTEGER + 1 }, 'INVALID_INTENT'],
    [{ capCents: undefined }, 'INVALID_INTENT'],
    [{ billingScope: 'recurring' }, 'INVALID_INTENT'],
    [{ merchantId: 'docuquick-demo' }, 'INVALID_INTENT'],
    [{ currency: 'EUR' }, 'INVALID_INTENT'],
    [{ documentId: 'doc-other' }, 'INVALID_INTENT'],
  ];
  for (const [patch, code] of cases) {
    assert.throws(() => confirmIntent(s, { ...VALID, ...patch }), { code }, JSON.stringify(patch));
  }
  const { confirmed, ...missing } = VALID;
  assert.throws(() => confirmIntent(s, missing), { code: 'INTENT_NOT_CONFIRMED' });
  assert.equal(s.intent, prev);
});

test('zero cap is accepted', () => {
  const s = createSession();
  assert.equal(confirmIntent(s, { ...VALID, capCents: 0 }).capCents, 0);
});

test('re-confirmation keeps intentId, bumps revision and clears checks/grants', () => {
  const s = createSession();
  const first = confirmIntent(s, VALID);
  s.checks.set('c', {});
  s.grants.set('g', {});
  const second = confirmIntent(s, { ...VALID, capCents: 150 });
  assert.equal(second.intentId, first.intentId);
  assert.ok(second.revision > first.revision);
  assert.equal(second.capCents, 150);
  assert.equal(s.checks.size + s.grants.size, 0);
});

test('checkout variant switching does not modify intent', () => {
  const s = createSession();
  const intent = confirmIntent(s, VALID);
  selectVariant(s, 'trial-recurring');
  selectVariant(s, 'changed-merchant');
  assert.equal(s.intent, intent);
});

test('reset discards intent; next confirmation gets a new id and a higher revision', () => {
  const s = createSession();
  const first = confirmIntent(s, VALID);
  reset(s);
  assert.equal(s.intent, null);
  const next = confirmIntent(s, VALID);
  assert.notEqual(next.intentId, first.intentId);
  assert.ok(next.revision > first.revision);
});
