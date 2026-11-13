import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSession, selectVariant } from '../../src/domain/checkout.js';
import { confirmIntent } from '../../src/domain/intent.js';
import { decide } from '../../src/domain/policy.js';
import { explain, reasonText, GENERIC_REASON } from '../../src/domain/explanation.js';

const INTENT = { documentId: 'doc-synthetic-001', merchantId: 'paperlane-demo', currency: 'USD', capCents: 200, billingScope: 'one_off_only', confirmed: true };

// Builds the real decision for a variant from a check whose interpretation equals the fixture commitment.
function scenario(variantId, checkOverride) {
  const session = createSession();
  const snapshot = selectVariant(session, variantId);
  const intent = confirmIntent(session, INTENT);
  const tags = { intentRevision: intent.revision, checkoutId: snapshot.checkoutId, checkoutRevision: snapshot.revision };
  const check = checkOverride === undefined ? {
    tags, source: 'live', status: 'interpreted', reasons: [],
    input: { merchantDisplayName: snapshot.merchant.name, disclosureText: snapshot.disclosure },
    interpretation: { ...snapshot.commitment, merchantName: snapshot.merchant.name, evidenceStatus: 'clear', quotations: [snapshot.disclosure] },
  } : checkOverride && { tags, input: { merchantDisplayName: snapshot.merchant.name, disclosureText: snapshot.disclosure }, ...checkOverride };
  return explain(intent, decide(intent, snapshot, check), check);
}

const text = (e) => JSON.stringify(Object.values(e)); // user-visible values, not key names

test('recurring checkout pause states the approved limit against the disclosed renewal, without alleging fraud', () => {
  const e = scenario('trial-recurring');
  assert.equal(e.tone, 'pause');
  assert.match(e.approved, /at most USD 2\.00, once/);
  assert.match(e.disclosed, /USD 1\.00 today, then USD 49\.95 each month after 7 days/);
  assert.equal(e.merchant, 'Paperlane Demo');
  assert.deepEqual(e.evidence, ['USD 1 today. Free 7-day trial, then USD 49.95 per month until cancelled.']);
  assert.ok(e.reasons.some((r) => /recurring/i.test(r)));
  assert.equal(e.source, 'live');
  assert.doesNotMatch(text(e), /fraud|scam|criminal/i);
});

test('one-off checkout within the cap is the only allow tone', () => {
  const e = scenario('one-off-usd1');
  assert.equal(e.tone, 'allow');
  assert.match(e.disclosed, /USD 1\.00 once/);
  assert.deepEqual(e.reasons, []);
});

test('other conflicts explain over-cap, currency and merchant mismatches', () => {
  assert.match(text(scenario('one-off-usd3')), /above the maximum you approved/);
  assert.match(scenario('non-usd').disclosed, /EUR 1\.00 once/);
  assert.match(text(scenario('non-usd')), /not in US dollars/);
  assert.match(text(scenario('changed-merchant')), /different merchant/);
  for (const v of ['one-off-usd3', 'non-usd', 'changed-merchant']) assert.equal(scenario(v).tone, 'pause', v);
});

test('clarify states give a distinct readable reason and never an allow tone', () => {
  const cases = {
    missing: { source: 'live', status: 'clarify', reasons: ['EVIDENCE_MISSING'], interpretation: null },
    contradictory: { source: 'live', status: 'clarify', reasons: ['EVIDENCE_CONTRADICTORY'], interpretation: null },
    timeout: { source: 'live', status: 'unavailable', reasons: ['PROVIDER_TIMEOUT'], interpretation: null },
    unsupported: { source: 'live', status: 'clarify', reasons: ['EVIDENCE_UNSUPPORTED'], interpretation: null },
    'not checked': null,
  };
  const seen = new Set();
  for (const [name, check] of Object.entries(cases)) {
    const e = scenario('missing-terms', check);
    assert.equal(e.tone, 'clarify', name);
    assert.equal(e.disclosed, null, `${name}: no unvalidated terms are shown as fact`);
    const specific = e.reasons.filter((r) => r !== GENERIC_REASON);
    assert.ok(specific.length > 0, `${name} has a specific reason`);
    seen.add(specific.join('|'));
  }
  assert.equal(seen.size, Object.keys(cases).length, 'each clarify cause reads differently');
});

test('a clarification never reveals undisclosed terms from the hidden commitment', () => {
  // missing-terms executes a recurring commitment, but its disclosure states nothing; only disclosed terms are observable.
  const e = scenario('missing-terms', { source: 'live', status: 'clarify', reasons: ['EVIDENCE_MISSING'], interpretation: null });
  assert.doesNotMatch(text(e), /recurring|49\.95|each month/i);
});

test('a stale check explains that the checkout or approval changed', () => {
  const session = createSession();
  const intent = confirmIntent(session, INTENT);
  const old = selectVariant(session, 'one-off-usd1');
  const check = { tags: { intentRevision: intent.revision, checkoutId: old.checkoutId, checkoutRevision: old.revision }, status: 'interpreted', source: 'replay', reasons: [], interpretation: null };
  const now = selectVariant(session, 'trial-recurring');
  const e = explain(intent, decide(intent, now, check), check);
  assert.equal(e.tone, 'clarify');
  assert.match(text(e), /changed after the last check/);
  assert.equal(e.source, 'replay');
});

test('every reason code the policy and validator can emit has its own text', () => {
  const src = ['src/domain/policy.js', 'src/domain/interpretation.js', 'src/gemini.js']
    .map((f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')).join('\n');
  const literal = [...src.matchAll(/'([A-Z][A-Z_]{3,})'/g)].map((m) => m[1])
    .filter((c) => !['USD', 'STOP', 'LOW', 'POST', 'ALLOW', 'CLARIFY', 'CONFLICT'].includes(c));
  const dynamic = ['INTERPRETATION_CLARIFY', 'INTERPRETATION_UNAVAILABLE', 'EVIDENCE_MISSING',
    'EVIDENCE_CONTRADICTORY', 'EVIDENCE_UNCERTAIN', 'EVIDENCE_UNSUPPORTED', 'PROVIDER_HTTP_429', 'PROVIDER_HTTP_402', 'PROVIDER_HTTP_500'];
  for (const code of new Set([...literal, ...dynamic])) {
    assert.notEqual(reasonText(code), GENERIC_REASON, `${code} needs plain-language text`);
  }
  assert.equal(reasonText('SOMETHING_NEW'), GENERIC_REASON, 'unknown codes fall back safely');
});

test('model and merchant strings pass through as plain data, never markup', () => {
  const e = scenario('one-off-usd1', {
    source: 'replay', status: 'clarify', reasons: ['QUOTE_NOT_IN_DISCLOSURE'], interpretation: null,
    input: { merchantDisplayName: '<img src=x onerror=alert(1)>', disclosureText: 'x' },
  });
  assert.equal(e.merchant, '<img src=x onerror=alert(1)>', 'kept verbatim; the browser renders it with textContent');
});

test('N1: a clarification makes no claim about what the checkout would actually charge', () => {
  const answer = { source: 'live', status: 'clarify', reasons: ['COMMITMENT_MISMATCH'], interpretation: null };
  const e = scenario('missing-terms', answer);
  assert.equal(e.tone, 'clarify');
  assert.doesNotMatch(text(e), /actually charge|would charge|recurring|49\.95/i);
  for (const code of ['COMMITMENT_MISMATCH', 'SEMANTIC_EXECUTION_DISAGREEMENT', 'UNSUPPORTED_AMOUNT']) {
    assert.doesNotMatch(reasonText(code), /actually charge|would charge/i, code);
  }
});

test('N3: missing interpretation also reads as a recheck after a change', () => {
  assert.match(reasonText('INTERPRETATION_MISSING'), /changed since the last check/);
});

test('N4: the allow headline does not claim the payment is happening', () => {
  assert.doesNotMatch(scenario('one-off-usd1').headline, /complet|paying|payment/i);
});

test('N5: a non-allow decision always carries at least one reason', () => {
  const session = createSession();
  const intent = confirmIntent(session, INTENT);
  const e = explain(intent, { decision: 'CLARIFY', reasons: [], evidence: [] }, null);
  assert.deepEqual(e.reasons, [GENERIC_REASON]);
  const conflictOnly = explain(intent, { decision: 'CLARIFY', reasons: ['RECURRING_NOT_APPROVED'], evidence: [] }, null);
  assert.deepEqual(conflictOnly.reasons, [GENERIC_REASON]);
});

test('N6: a model merchant-name mismatch keeps its own reason under clarify', () => {
  const e = scenario('one-off-usd1', { source: 'live', status: 'clarify', reasons: ['MERCHANT_NAME_MISMATCH'], interpretation: null });
  assert.ok(e.reasons.includes(reasonText('MERCHANT_NAME_MISMATCH')));
  assert.notEqual(reasonText('MERCHANT_NAME_MISMATCH'), GENERIC_REASON);
});

test('N7: an invalid intent is not described as an approval', () => {
  const e = explain({ revision: 1 }, { decision: 'CLARIFY', reasons: ['INTENT_INVALID'], evidence: [] }, null);
  assert.doesNotMatch(e.approved, /NaN|at most/);
});

test('W6: the explanation says whether recurring terms were disclosed', () => {
  assert.equal(scenario('trial-recurring').recurringDisclosed, true);
  assert.equal(scenario('one-off-usd3').recurringDisclosed, false);
  assert.equal(scenario('missing-terms', { source: 'live', status: 'clarify', reasons: ['EVIDENCE_MISSING'], interpretation: null }).recurringDisclosed, false);
});

test('money formatting covers small, zero and large amounts and recurring without a trial', () => {
  const session = createSession();
  const intent = confirmIntent(session, { ...INTENT, capCents: 99_999_999 });
  assert.match(explain(intent, { decision: 'CLARIFY', reasons: ['X'], evidence: [] }, null).approved, /USD 999999\.99/);
  const allow = (t) => explain(intent, { decision: 'CONFLICT', reasons: ['OVER_CAP'], evidence: [] },
    { source: 'live', status: 'interpreted', interpretation: { currency: 'USD', ...t } }).disclosed;
  assert.equal(allow({ upfrontCents: 105, billingKind: 'one_off' }), 'This checkout charges USD 1.05 once.');
  assert.equal(allow({ upfrontCents: 0, billingKind: 'one_off' }), 'This checkout charges USD 0.00 once.');
  assert.equal(allow({ upfrontCents: 0, billingKind: 'recurring', renewalCents: 999, renewalInterval: 'week', trialDays: null }),
    'This checkout charges USD 0.00 today, then USD 9.99 each week.');
  assert.equal(allow({ upfrontCents: 0, billingKind: 'recurring', renewalCents: 999, renewalInterval: 'week', trialDays: 0 }),
    'This checkout charges USD 0.00 today, then USD 9.99 each week.');
});
