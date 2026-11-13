// Done-when 3: the gate holds against check-to-submit mutation, late model answers, duplicates and grant replay.
// page.route only delays the browser's own /api/submit so the test can change real service state in that window.
import { test, expect, approve, chooseVariant, pay, payButton, waitForPost, effects, NO_EFFECTS } from './fixtures.js';

const isSubmit = (r) => new URL(r.url()).pathname === '/api/submit' && r.method() === 'POST';

for (const variant of ['trial-recurring', 'changed-merchant']) {
  for (const key of [false, true]) {
    test(`[gate·replay] checkout switched to ${variant} after an ALLOW check: ${key ? 'Enter' : 'click'} on Pay makes no payment`, async ({ page, stub, state, request }) => {
      stub.replay('one-off-clear');
      await page.goto('/');
      await approve(page);
      await page.route('**/api/submit', async (route) => {
        await request.post('/api/checkout', { data: { variantId: variant } }); // mutate after decide, before submit
        await route.continue();
      });
      const submitted = waitForPost(page, '/api/submit');
      const { decision, grantId } = await pay(page, { key });
      expect(decision.decision).toBe('ALLOW');
      expect(typeof grantId).toBe('string');
      const res = await submitted;
      expect(res.status()).toBe(409);
      expect(await res.json()).toEqual({ error: 'GRANT_UNKNOWN' }); // a variant switch revokes every grant
      const s = await state();
      expect(s.outcomes.attemptedSubmissions).toBe(1);
      expect(effects(s.outcomes)).toEqual(NO_EFFECTS);
    });
  }
}

test('[gate·replay] a model answer released after switching away and back makes no payment', async ({ page, stub, state }) => {
  const release = stub.hold('one-off-clear');
  await page.goto('/');
  await approve(page);
  const interpreted = waitForPost(page, '/api/interpret');
  const decided = waitForPost(page, '/api/decide');
  await payButton(page).click();
  await expect.poll(() => stub.requests.length).toBe(1);
  await chooseVariant(page, 'trial-recurring');
  await chooseVariant(page, 'one-off-usd1'); // same terms as checked, but a new revision
  release();
  expect((await (await interpreted).json()).check.status).toBe('stale');
  expect((await (await decided).json()).decision.decision).toBe('CLARIFY');
  await expect(payButton(page)).toBeEnabled();
  const s = await state();
  expect(s.outcomes.attemptedSubmissions).toBe(0);
  expect(effects(s.outcomes)).toEqual(NO_EFFECTS);
});

test('[gate·replay] a model answer released after Reset makes no payment', async ({ page, stub, state }) => {
  const release = stub.hold('one-off-clear');
  await page.goto('/');
  await approve(page);
  const interpreted = waitForPost(page, '/api/interpret');
  const decided = waitForPost(page, '/api/decide');
  await payButton(page).click();
  await expect.poll(() => stub.requests.length).toBe(1);
  const wasReset = waitForPost(page, '/api/reset');
  await page.getByRole('button', { name: 'Reset' }).click();
  await wasReset;
  release();
  expect((await (await interpreted).json()).check.status).toBe('stale');
  expect((await (await decided).json()).decision.decision).toBe('CLARIFY');
  await expect(payButton(page)).toBeEnabled();
  const s = await state();
  expect(s.intent).toBeNull();
  expect(s.outcomes.attemptedSubmissions).toBe(0);
  expect(effects(s.outcomes)).toEqual(NO_EFFECTS);
});

for (const [how, act] of [
  ['double-click', (page) => payButton(page).dblclick()],
  ['rapid Enter', async (page) => {
    await payButton(page).press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
  }],
]) {
  test(`[gate·replay] ${how} on Pay makes exactly one payment`, async ({ page, stub, state }) => {
    stub.replay('one-off-clear');
    stub.replay('one-off-clear'); // a second check, if the page sent one, would be answered too
    const submits = [];
    page.on('request', (r) => { if (isSubmit(r)) submits.push(r); });
    await page.goto('/');
    await approve(page);
    await act(page);
    await expect(page.getByRole('region', { name: 'Done (simulated)' })).toBeVisible();
    await expect(payButton(page)).toBeEnabled();
    const s = await state();
    expect(s.outcomes.attemptedSubmissions).toBe(submits.length);
    expect(s.outcomes.executions).toBe(1);
    expect(s.outcomes.payments).toHaveLength(1);
    expect(s.outcomes.subscriptions).toEqual([]);
    expect(s.outcomes.conversionStatus).toBe('completed');
  });
}

test('[gate·replay] the browser grant replayed concurrently and later through the API pays once', async ({ page, stub, state, request }) => {
  stub.replay('one-off-clear');
  await page.goto('/');
  await approve(page);
  let replays = [];
  await page.route('**/api/submit', async (route) => {
    const { grantId } = route.request().postDataJSON();
    replays = Array.from({ length: 5 }, () => request.post('/api/submit', { data: { grantId } }));
    await route.continue();
  });
  const submitted = waitForPost(page, '/api/submit');
  const { grantId } = await pay(page);
  const statuses = [(await submitted).status(), ...(await Promise.all(replays)).map((r) => r.status())];
  expect(statuses.filter((st) => st === 200)).toHaveLength(1);

  const late = await request.post('/api/submit', { data: { grantId } });
  expect(late.status()).toBe(409);
  expect(await late.json()).toEqual({ error: 'ALREADY_COMPLETED' });
  const s = await state();
  expect(s.outcomes.attemptedSubmissions).toBe(7);
  expect(s.outcomes.executions).toBe(1);
  expect(s.outcomes.payments).toHaveLength(1);
  expect(s.outcomes.subscriptions).toEqual([]);
});
