import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, selectVariant, reset } from '../../src/domain/checkout.js';
import { confirmIntent } from '../../src/domain/intent.js';
import { EXPECTED_DECISIONS } from '../../src/domain/checkout.js';
import { decide, evaluate } from '../../src/domain/policy.js';

const INTENT = {
  documentId: 'doc-synthetic-001', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only', confirmed: true,
};

function setup(variant = 'one-off-usd1') {
  const s = createSession();
  selectVariant(s, variant);
  confirmIntent(s, INTENT);
  return s;
}

// A provider-independent stand-in for Task 3's validated result: the model read the commitment correctly.
const interpreted = (s, overrides = {}) => ({
  tags: { intentRevision: s.intent.revision, checkoutId: s.checkout.checkoutId, checkoutRevision: s.checkout.revision },
  status: 'interpreted',
  reasons: [],
  interpretation: { ...s.checkout.commitment, merchantName: s.checkout.merchant.name, evidenceStatus: 'clear', quotations: ['q'], ...overrides },
});

const withCommitment = (s, commitment) => ({ ...s.checkout, commitment: { ...s.checkout.commitment, ...commitment } });

test('explicit USD 1 one-off within the cap is ALLOW and mints a bound single-use grant', () => {
  const s = setup();
  const { decision: d, grantId: id } = evaluate(s, interpreted(s));
  assert.equal(d.decision, 'ALLOW');
  assert.deepEqual(d.reasons, []);
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
  const g = s.grants.get(id);
  assert.equal(g.intentId, s.intent.intentId);
  assert.equal(g.checkoutRevision, s.checkout.revision);
  assert.deepEqual(g.commitment, s.checkout.commitment);
  assert.ok(Object.isFrozen(g));
  assert.notEqual(evaluate(s, interpreted(s)).grantId, id, 'each grant id is fresh');
});

test('price boundary: exactly the cap is allowed, one cent over is a conflict', () => {
  const s = setup();
  const at = withCommitment(s, { upfrontCents: 200 });
  const over = withCommitment(s, { upfrontCents: 201 });
  const read = (snap) => ({ ...interpreted(s), interpretation: { ...interpreted(s).interpretation, upfrontCents: snap.commitment.upfrontCents } });
  assert.equal(decide(s.intent, at, read(at)).decision, 'ALLOW');
  const d = decide(s.intent, over, read(over));
  assert.equal(d.decision, 'CONFLICT');
  assert.deepEqual(d.reasons, ['OVER_CAP']);
});

test('USD 1 trial then USD 49.95 monthly is a CONFLICT although USD 1 fits the cap', () => {
  const s = setup('trial-recurring');
  const { decision: d, grantId } = evaluate(s, interpreted(s));
  assert.equal(d.decision, 'CONFLICT');
  assert.deepEqual(d.reasons, ['RECURRING_NOT_APPROVED']);
  assert.equal(grantId, null);
  assert.equal(s.grants.size, 0);
});

test('every scope mismatch pauses with a specific reason', () => {
  for (const [variant, reason] of [['one-off-usd3', 'OVER_CAP'], ['non-usd', 'CURRENCY_MISMATCH'], ['changed-merchant', 'MERCHANT_MISMATCH']]) {
    const s = setup(variant);
    const d = decide(s.intent, s.checkout, interpreted(s));
    assert.equal(d.decision, 'CONFLICT', variant);
    assert.deepEqual(d.reasons, [reason], variant);
  }
  const s = setup();
  const otherDoc = { ...s.checkout, document: { id: 'doc-other', action: 'convert-one-document' } };
  assert.deepEqual(decide(s.intent, otherDoc, interpreted(s)).reasons, ['SCOPE_MISMATCH']);
  const otherAction = { ...s.checkout, document: { ...s.checkout.document, action: 'convert-all-documents' } };
  assert.deepEqual(decide(s.intent, otherAction, interpreted(s)).reasons, ['SCOPE_MISMATCH']);
});

test('missing or invalid intent and every unusable interpretation is never ALLOW', () => {
  const s = setup();
  const ok = interpreted(s);
  const cases = [
    [null, s.checkout, ok, 'INTENT_MISSING'],
    [{ ...s.intent, billingScope: 'recurring' }, s.checkout, ok, 'INTENT_INVALID'],
    [{ ...s.intent, capCents: 1.5 }, s.checkout, ok, 'INTENT_INVALID'],
    [s.intent, s.checkout, null, 'INTERPRETATION_MISSING'],
    [s.intent, s.checkout, { ...ok, status: 'unavailable', reasons: ['PROVIDER_TIMEOUT'], interpretation: null }, 'INTERPRETATION_UNAVAILABLE'],
    [s.intent, s.checkout, { ...ok, status: 'clarify', reasons: ['EVIDENCE_CONTRADICTORY'], interpretation: null }, 'INTERPRETATION_CLARIFY'],
    [s.intent, s.checkout, { ...ok, interpretation: { ...ok.interpretation, billingKind: 'unknown' } }, 'SEMANTIC_EXECUTION_DISAGREEMENT'],
    [s.intent, s.checkout, { ...ok, interpretation: { ...ok.interpretation, upfrontCents: 50 } }, 'SEMANTIC_EXECUTION_DISAGREEMENT'],
    [s.intent, withCommitment(s, { upfrontCents: 1.5 }), ok, 'UNSUPPORTED_AMOUNT'],
    [s.intent, withCommitment(s, { billingKind: 'unknown' }), ok, 'BILLING_KIND_UNKNOWN'],
    [s.intent, withCommitment(s, { billingKind: 'subscription' }), ok, 'BILLING_KIND_UNKNOWN'],
    [s.intent, withCommitment(s, { billingKind: undefined }), ok, 'BILLING_KIND_UNKNOWN'],
    [s.intent, withCommitment(s, { renewalInterval: 'month' }), ok, 'RECURRING_NOT_APPROVED'],
    [s.intent, s.checkout, { ...ok, interpretation: { ...ok.interpretation, evidenceStatus: 'uncertain' } }, 'EVIDENCE_NOT_CLEAR'],
    [s.intent, s.checkout, { ...ok, interpretation: { ...ok.interpretation, quotations: [] } }, 'EVIDENCE_NOT_CLEAR'],
  ];
  for (const [intent, snapshot, check, reason] of cases) {
    const d = decide(intent, snapshot, check);
    assert.notEqual(d.decision, 'ALLOW', reason);
    assert.ok(d.reasons.includes(reason), `${reason} in ${d.reasons}`);
  }
  for (const check of [null, cases[4][2], cases[5][2]]) assert.equal(evaluate(s, check).grantId, null);
  assert.equal(s.grants.size, 0);
});

test('every fixture variant matches its hidden expected decision through realistic interpretation results', () => {
  // What a correct Task 3 returns: clear terms are interpreted, missing/contradictory terms come back as clarify.
  const unclear = { 'missing-terms': 'EVIDENCE_MISSING', 'contradictory-terms': 'EVIDENCE_CONTRADICTORY' };
  for (const [variant, expected] of Object.entries(EXPECTED_DECISIONS)) {
    const s = setup(variant);
    const check = unclear[variant]
      ? { ...interpreted(s), status: 'clarify', reasons: [unclear[variant]], interpretation: null }
      : interpreted(s);
    assert.equal(evaluate(s, check).decision.decision, expected, variant);
  }
});

test('missing and contradictory fixture terms pause even if a model claimed a clean one-off', () => {
  for (const variant of ['missing-terms', 'contradictory-terms']) {
    const s = setup(variant);
    const claimedOneOff = interpreted(s, { billingKind: 'one_off', renewalCents: null, renewalInterval: null, trialDays: null });
    const { decision, grantId } = evaluate(s, claimedOneOff);
    assert.equal(decision.decision, 'CLARIFY', variant);
    assert.ok(decision.reasons.includes('SEMANTIC_EXECUTION_DISAGREEMENT'));
    assert.equal(grantId, null);
  }
});

test('a grant is always bound to the real current commitment, never to terms a caller passed in', () => {
  const s = setup('trial-recurring');
  // Pretend-one-off check with the current tags: evaluate re-decides on session state, so no grant.
  const lie = interpreted(s, { billingKind: 'one_off', renewalCents: null, renewalInterval: null, trialDays: null });
  assert.equal(evaluate(s, lie).grantId, null);
  assert.equal(s.grants.size, 0);
});

test('a stale response cannot produce a verdict or grant after a state change or reset', () => {
  const s = setup();
  const oldCheck = interpreted(s);
  assert.equal(decide(s.intent, s.checkout, oldCheck).decision, 'ALLOW');

  selectVariant(s, 'trial-recurring');
  selectVariant(s, 'one-off-usd1'); // back to identical terms, new revision
  assert.deepEqual(decide(s.intent, s.checkout, oldCheck).reasons, ['INTERPRETATION_STALE']);
  assert.equal(evaluate(s, oldCheck).grantId, null);

  const preEditCheck = interpreted(s);
  confirmIntent(s, { ...INTENT, capCents: 150 });
  assert.deepEqual(decide(s.intent, s.checkout, preEditCheck).reasons, ['INTERPRETATION_STALE']);
  assert.equal(evaluate(s, preEditCheck).grantId, null);

  const preResetCheck = interpreted(s);
  reset(s);
  assert.equal(evaluate(s, preResetCheck).grantId, null);
  confirmIntent(s, INTENT); // a new approval after reset still cannot reuse the old answer
  assert.equal(evaluate(s, preResetCheck).grantId, null);
});

test('state changes revoke grants already issued', () => {
  const s = setup();
  evaluate(s, interpreted(s));
  selectVariant(s, 'one-off-usd1');
  assert.equal(s.grants.size, 0, 'checkout change');

  evaluate(s, interpreted(s));
  confirmIntent(s, INTENT);
  assert.equal(s.grants.size, 0, 'intent re-confirmation');

  evaluate(s, interpreted(s));
  reset(s);
  assert.equal(s.grants.size, 0, 'reset');

  const fresh = setup();
  evaluate(fresh, interpreted(fresh));
  const failed = { ...interpreted(fresh), status: 'unavailable', reasons: ['PROVIDER_HTTP_429'], interpretation: null };
  assert.equal(evaluate(fresh, failed).grantId, null);
  assert.equal(fresh.grants.size, 0, 'a later non-ALLOW on the same state revokes the earlier grant');
});
