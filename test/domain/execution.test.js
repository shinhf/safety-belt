import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, selectVariant, reset, outcomeView } from '../../src/domain/checkout.js';
import { confirmIntent } from '../../src/domain/intent.js';
import { evaluate } from '../../src/domain/policy.js';
import { submit } from '../../src/domain/execution.js';

const INTENT = {
  documentId: 'doc-synthetic-001', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only', confirmed: true,
};
const NO_EFFECTS = { executions: 0, payments: [], subscriptions: [], conversionStatus: 'not_started' };

// Stand-in for a correct Task 3 result on the current state.
const interpreted = (s) => ({
  tags: { intentRevision: s.intent.revision, checkoutId: s.checkout.checkoutId, checkoutRevision: s.checkout.revision },
  status: 'interpreted',
  reasons: [],
  interpretation: { ...s.checkout.commitment, merchantName: s.checkout.merchant.name, evidenceStatus: 'clear', quotations: ['q'] },
});

function allowed() {
  const s = createSession();
  confirmIntent(s, INTENT);
  const { grantId } = evaluate(s, interpreted(s));
  assert.ok(grantId);
  return { s, grantId };
}

const effects = (s) => { const { attemptedSubmissions, ...rest } = outcomeView(s); return rest; };

test('an allowed USD 1 one-off creates exactly one payment, completes the conversion and no subscription', () => {
  const { s, grantId } = allowed();
  const r = submit(s, grantId);
  assert.equal(r.ok, true);
  assert.equal(r.payment.amountCents, 100);
  assert.equal(r.payment.currency, 'USD');
  assert.equal(r.payment.merchantId, 'paperlane-demo');
  assert.equal(r.payment.intentId, s.intent.intentId);
  const o = outcomeView(s);
  assert.equal(o.attemptedSubmissions, 1);
  assert.equal(o.executions, 1);
  assert.equal(o.payments.length, 1);
  assert.deepEqual(o.subscriptions, []);
  assert.equal(o.conversionStatus, 'completed');
  assert.equal(s.grants.size, 0, 'grant consumed');
});

test('submit is synchronous, so check, consume and execute cannot interleave with another request', () => {
  const { s, grantId } = allowed();
  const r = submit(s, grantId);
  assert.ok(!(r instanceof Promise));
});

test('replays, retries and a second grant after completion never create a second payment', () => {
  const { s, grantId } = allowed();
  assert.equal(submit(s, grantId).ok, true);
  assert.deepEqual(submit(s, grantId), { ok: false, reason: 'ALREADY_COMPLETED' });
  const second = evaluate(s, interpreted(s)).grantId; // policy still allows the terms; execution must not
  assert.ok(second);
  assert.deepEqual(submit(s, second), { ok: false, reason: 'ALREADY_COMPLETED' });
  const o = outcomeView(s);
  assert.equal(o.attemptedSubmissions, 3, 'attempts counted separately');
  assert.equal(o.executions, 1);
  assert.equal(o.payments.length, 1);
});

test('missing, unknown, altered, revoked and reset grants fail with zero side effects', () => {
  const { s, grantId } = allowed();
  for (const [g, reason] of [[undefined, 'GRANT_REQUIRED'], ['', 'GRANT_REQUIRED'], [42, 'GRANT_REQUIRED'],
    ['unknown', 'GRANT_UNKNOWN'], [`${grantId.slice(0, -1)}${grantId.at(-1) === 'A' ? 'B' : 'A'}`, 'GRANT_UNKNOWN']]) {
    assert.deepEqual(submit(s, g), { ok: false, reason }, String(g));
  }
  assert.deepEqual(effects(s), NO_EFFECTS);

  selectVariant(s, 'one-off-usd1'); // same terms, new revision: revokes
  assert.deepEqual(submit(s, grantId), { ok: false, reason: 'GRANT_UNKNOWN' });

  const again = allowed();
  reset(again.s);
  assert.deepEqual(submit(again.s, again.grantId), { ok: false, reason: 'GRANT_UNKNOWN' });
  assert.deepEqual(effects(again.s), NO_EFFECTS);
});

test('any mismatch between grant and current state rejects before execution, even if the grant was not revoked', () => {
  // These bypass selectVariant/confirmIntent (which revoke grants) to prove the execution check stands on its own.
  const mutations = {
    'checkout revision': (s) => { s.checkout = { ...s.checkout, revision: s.checkout.revision + 1 }; },
    'checkout id': (s) => { s.checkout = { ...s.checkout, checkoutId: 'chk-other' }; },
    merchant: (s) => { s.checkout = { ...s.checkout, merchant: { id: 'docuquick-demo', name: 'DocuQuick Demo' } }; },
    document: (s) => { s.checkout = { ...s.checkout, document: { ...s.checkout.document, id: 'doc-other' } }; },
    action: (s) => { s.checkout = { ...s.checkout, document: { ...s.checkout.document, action: 'convert-all' } }; },
    price: (s) => { s.checkout = { ...s.checkout, commitment: { ...s.checkout.commitment, upfrontCents: 101 } }; },
    currency: (s) => { s.checkout = { ...s.checkout, commitment: { ...s.checkout.commitment, currency: 'EUR' } }; },
    recurrence: (s) => { s.checkout = { ...s.checkout, commitment: { ...s.checkout.commitment, billingKind: 'recurring' } }; },
    renewal: (s) => { s.checkout = { ...s.checkout, commitment: { ...s.checkout.commitment, renewalCents: 4995 } }; },
    interval: (s) => { s.checkout = { ...s.checkout, commitment: { ...s.checkout.commitment, renewalInterval: 'month' } }; },
    trial: (s) => { s.checkout = { ...s.checkout, commitment: { ...s.checkout.commitment, trialDays: 7 } }; },
    'intent revision': (s) => { s.intent = { ...s.intent, revision: s.intent.revision + 1 }; },
    'intent id': (s) => { s.intent = { ...s.intent, intentId: 'other' }; },
    'no intent': (s) => { s.intent = null; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const { s, grantId } = allowed();
    mutate(s);
    assert.deepEqual(submit(s, grantId), { ok: false, reason: 'GRANT_STALE' }, name);
    assert.deepEqual(effects(s), NO_EFFECTS, name);
    assert.equal(s.grants.size, 0, `${name}: stale grant is discarded`);
  }
});

test('the handler never creates a subscription, even for a grant that somehow carries recurring terms', () => {
  const s = createSession();
  selectVariant(s, 'trial-recurring');
  confirmIntent(s, INTENT);
  const c = s.checkout;
  s.grants.set('forged', {
    intentId: s.intent.intentId, intentRevision: s.intent.revision, checkoutId: c.checkoutId, checkoutRevision: c.revision,
    merchantId: c.merchant.id, documentId: c.document.id, action: c.document.action, commitment: c.commitment,
  });
  assert.deepEqual(submit(s, 'forged'), { ok: false, reason: 'NOT_ONE_OFF' });
  assert.deepEqual(effects(s), NO_EFFECTS);
});

test('execution uses the commitment captured in the grant', () => {
  const { s, grantId } = allowed();
  const captured = s.grants.get(grantId).commitment;
  assert.ok(Object.isFrozen(captured));
  assert.equal(submit(s, grantId).payment.amountCents, captured.upfrontCents);
});
