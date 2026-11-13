// Done-when 4: provider and interpretation failures pause with zero effects, then a safe recheck recovers.
import { test, expect, open, approve, chooseVariant, pay, payButton, waitForPost, terms, effects, NO_EFFECTS } from './fixtures.js';

const FAILURES = [
  ['timeout', 'unavailable', 'PROVIDER_TIMEOUT', (stub) => stub.fail('timeout')],
  ['HTTP 500', 'unavailable', 'PROVIDER_HTTP_500', (stub) => stub.fail('http500')],
  ['malformed response body', 'unavailable', 'PROVIDER_BAD_RESPONSE', (stub) => stub.fail('malformed')],
  ['malformed model JSON', 'clarify', 'MALFORMED_JSON', (stub) => stub.replay('prose')],
  ['uncertain evidence', 'clarify', 'EVIDENCE_UNCERTAIN', (stub) => stub.answer(terms({ evidenceStatus: 'uncertain' }))],
  ['fabricated quotation', 'clarify', 'QUOTE_NOT_IN_DISCLOSURE', (stub) => stub.replay('fabricated-quote')],
];

async function expectPausedWithoutEffects(state, status, reason) {
  const s = await state();
  expect(s.check.source).toBe('replay');
  expect(s.check.status).toBe(status);
  expect(s.check.reasons).toContain(reason);
  expect(s.outcomes.attemptedSubmissions).toBe(0);
  expect(effects(s.outcomes)).toEqual(NO_EFFECTS);
}

async function expectCompletedOnce(page, state) {
  await expect(page.getByRole('region', { name: 'Done (simulated)' })).toBeVisible();
  const s = await state();
  expect(s.outcomes.executions).toBe(1);
  expect(s.outcomes.payments).toHaveLength(1);
  expect(s.outcomes.subscriptions).toEqual([]);
  expect(s.outcomes.conversionStatus).toBe('completed');
}

for (const [name, status, reason, queue] of FAILURES) {
  test(`[gate·replay] ${name} pauses with zero effects and Check again recovers`, async ({ page, stub, state }) => {
    queue(stub);
    await open(page);
    await approve(page);
    const { decision, grantId } = await pay(page);
    expect(decision.decision).toBe('CLARIFY');
    expect(grantId).toBeNull();
    await expectPausedWithoutEffects(state, status, reason);

    stub.replay('one-off-clear');
    const submitted = waitForPost(page, '/api/submit');
    await page.getByRole('button', { name: 'Check again' }).click();
    expect((await submitted).status()).toBe(200);
    await expectCompletedOnce(page, state);
  });
}

test('[gate·replay] a one-off answer for recurring terms (semantic/execution disagreement) pauses, and going back recovers', async ({ page, stub, state }) => {
  stub.answer(terms({ quotations: ['USD 1 today.'] })); // a real substring of the recurring disclosure
  await open(page);
  await approve(page);
  await chooseVariant(page, 'trial-recurring');
  const { decision } = await pay(page);
  expect(decision.decision).toBe('CLARIFY');
  await expectPausedWithoutEffects(state, 'clarify', 'COMMITMENT_MISMATCH');

  const switched = waitForPost(page, '/api/checkout');
  await page.getByRole('button', { name: 'Go back to the one-off checkout' }).click();
  await switched;
  stub.replay('one-off-clear');
  await pay(page);
  await expectCompletedOnce(page, state);
  await expect(payButton(page)).toBeEnabled();
});
