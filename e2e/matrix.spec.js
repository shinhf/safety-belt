// Done-when 2: the acceptance matrix through the real page and service. Replay answers are labelled test doubles.
import { test, expect, open, approve, chooseVariant, pay, terms, effects, NO_EFFECTS } from './fixtures.js';

test('[gate·replay] USD 1 one-off completes exactly once with zero subscriptions', async ({ page, stub, state }) => {
  stub.replay('one-off-clear');
  await open(page);
  await approve(page);
  const { decision } = await pay(page);
  expect(decision.decision).toBe('ALLOW');
  const s = await state();
  expect(s.check.source).toBe('replay');
  expect(s.outcomes.attemptedSubmissions).toBe(1);
  expect(s.outcomes.executions).toBe(1);
  expect(s.outcomes.payments).toHaveLength(1);
  expect(s.outcomes.payments[0]).toMatchObject({ amountCents: 100, currency: 'USD', merchantId: 'paperlane-demo', simulated: true });
  expect(s.outcomes.subscriptions).toEqual([]);
  expect(s.outcomes.conversionStatus).toBe('completed');
});

// Each answer is what a reader of that disclosure would report; the deterministic gate must refuse all of them.
const REFUSED = [
  ['trial-recurring', 'CONFLICT', 'RECURRING_NOT_APPROVED', (stub) => stub.replay('recurring-clear')],
  ['one-off-usd3', 'CONFLICT', 'OVER_CAP',
    (stub) => stub.answer(terms({ upfrontCents: 300, quotations: ['USD 3.00 charged once to convert one document.'] }))],
  ['non-usd', 'CONFLICT', 'CURRENCY_MISMATCH',
    (stub) => stub.answer(terms({ currency: 'EUR', quotations: ['EUR 1.00 charged once to convert one document.'] }))],
  ['changed-merchant', 'CONFLICT', 'MERCHANT_MISMATCH', (stub) => stub.answer(terms({ merchantName: 'DocuQuick Demo' }))],
  ['missing-terms', 'CLARIFY', 'EVIDENCE_MISSING', (stub) => stub.answer(terms({
    upfrontCents: null, currency: null, billingKind: 'unknown', evidenceStatus: 'missing', quotations: [],
  }))],
  ['contradictory-terms', 'CLARIFY', 'EVIDENCE_CONTRADICTORY', (stub) => stub.answer(terms({
    evidenceStatus: 'contradictory',
    quotations: ['One-time payment of USD 1, no subscription.', 'After 7 days your plan renews at USD 49.95 per month.'],
  }))],
];

for (const [variant, expected, reason, queue] of REFUSED) {
  test(`[gate·replay] ${variant}: a click on Pay ends with zero executions, payments and subscriptions`, async ({ page, stub, state }) => {
    queue(stub);
    await open(page);
    await approve(page);
    await chooseVariant(page, variant);
    const { decision, grantId } = await pay(page);
    expect(decision.decision).toBe(expected);
    expect(decision.reasons).toContain(reason);
    expect(grantId).toBeNull();
    const s = await state();
    expect(s.check.source).toBe('replay');
    expect(s.outcomes.attemptedSubmissions).toBe(0);
    expect(effects(s.outcomes)).toEqual(NO_EFFECTS);
  });
}
