// Done-when 6: Task 6 browser behaviours — keyboard path, focus, read-only review, network failure, refused submit.
import { test, expect, approve, chooseVariant, pay, payButton, waitForPost, effects, NO_EFFECTS } from './fixtures.js';

const pausedHeading = (page) => page.getByRole('heading', { name: 'Paused: this checkout does not match what you approved.' });
const allowHeading = (page) => page.getByRole('heading', { name: 'The terms match your approval.' });

test('[gate·replay] Enter on Pay and convert reaches the gate and completes once, focusing the result', async ({ page, stub, state }) => {
  stub.replay('one-off-clear');
  await page.goto('/');
  await approve(page);
  const submitted = waitForPost(page, '/api/submit');
  await pay(page, { key: true });
  expect((await submitted).status()).toBe(200);
  await expect(page.getByRole('region', { name: 'Done (simulated)' })).toBeFocused();
  const s = await state();
  expect(s.outcomes.attemptedSubmissions).toBe(1);
  expect(s.outcomes.executions).toBe(1);
  expect(s.outcomes.payments).toHaveLength(1);
  expect(s.outcomes.subscriptions).toEqual([]);
});

test('[gate·replay] a pause moves focus to the decision heading', async ({ page, stub, state }) => {
  stub.replay('recurring-clear');
  await page.goto('/');
  await approve(page);
  await chooseVariant(page, 'trial-recurring');
  await pay(page);
  await expect(pausedHeading(page)).toBeFocused();
  expect(effects((await state()).outcomes)).toEqual(NO_EFFECTS);
});

test('[gate·replay] opening the subscription review sends no request and changes nothing', async ({ page, stub, state }) => {
  stub.replay('recurring-clear');
  await page.goto('/');
  await approve(page);
  await chooseVariant(page, 'trial-recurring');
  await pay(page);
  await expect(pausedHeading(page)).toBeFocused();
  const before = await state();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.getByText('Review subscription terms (read-only)').click();
  await expect(page.getByText('Free 7-day trial, then USD 49.95 per month until cancelled.', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  expect(await state()).toEqual(before);
});

test('[gate·replay] a network failure on the terms check re-enables Pay and focuses it', async ({ page, stub, state }) => {
  await page.route('**/api/interpret', (route) => route.abort());
  await page.goto('/');
  await approve(page);
  await payButton(page).click();
  await expect(page.getByText('Network error. No payment was made.')).toBeVisible();
  await expect(payButton(page)).toBeEnabled();
  await expect(payButton(page)).toBeFocused();
  expect(stub.requests).toEqual([]);
  const s = await state();
  expect(s.outcomes.attemptedSubmissions).toBe(0);
  expect(effects(s.outcomes)).toEqual(NO_EFFECTS);
});

test('[gate·replay] a refused submit leaves no allow panel visible and focuses Pay', async ({ page, stub, state, request }) => {
  stub.replay('one-off-clear');
  await page.goto('/');
  await approve(page);
  await page.route('**/api/submit', async (route) => {
    await request.post('/api/checkout', { data: { variantId: 'trial-recurring' } }); // checkout changes after the ALLOW check
    await route.continue();
  });
  const { decision } = await pay(page);
  expect(decision.decision).toBe('ALLOW');
  await expect(page.getByText('That approval check is no longer valid. No payment was made. Check again.')).toBeVisible();
  await expect(allowHeading(page)).toBeHidden();
  await expect(payButton(page)).toBeFocused();
  const s = await state();
  expect(s.outcomes.attemptedSubmissions).toBe(1);
  expect(effects(s.outcomes)).toEqual(NO_EFFECTS);
});

// Tests rendering, not the gate: the validator never lets such a quotation through, so /api/decide is rewritten.
test('[dom-safety·mocked-api] a quotation is rendered as literal text', async ({ page, stub }) => {
  const quotes = ['<img src=x onerror="window.__sbXss=1">', '<script>window.__sbXss=2</script>'];
  stub.replay('recurring-clear');
  await page.route('**/api/decide', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.explanation.evidence = quotes;
    await route.fulfill({ response, json });
  });
  await page.goto('/');
  await approve(page);
  await chooseVariant(page, 'trial-recurring');
  await pay(page);
  await page.getByText('Review subscription terms (read-only)').click();
  for (const q of quotes) await expect(page.getByText(q, { exact: true })).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('script')).toHaveCount(1); // only /app.js
  expect(await page.evaluate(() => window.__sbXss)).toBeUndefined();
});
