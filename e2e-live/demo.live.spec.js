// Live demo: happy path and dangerous path against the real Gemini model, recorded on video.
// Unlike e2e/, nothing here is a replay. A pass is one live observation, not a measured accuracy result.
import { test, expect } from '@playwright/test';

const RETRYABLE = /^PROVIDER_(HTTP_(429|5\d\d)|TIMEOUT|NETWORK)$/;
const isPost = (path) => (r) => new URL(r.url()).pathname === path && r.request().method() === 'POST';
const usd = (cents) => `USD ${(cents / 100).toFixed(2)}`;

// On-screen caption for the recording. CSSOM writes, not a style attribute, so the page's CSP still holds.
async function caption(page, title, lines = []) {
  await page.evaluate(({ title, lines }) => {
    let box = document.getElementById('demo-caption');
    if (!box) {
      box = document.createElement('div');
      box.id = 'demo-caption';
      Object.assign(box.style, {
        position: 'fixed', left: '16px', right: '16px', bottom: '16px', zIndex: '9999', padding: '14px 18px',
        background: 'rgba(17, 24, 39, 0.92)', color: '#fff', font: '16px/1.45 system-ui, sans-serif',
        borderRadius: '10px', boxShadow: '0 6px 24px rgba(0,0,0,.35)', pointerEvents: 'none',
      });
      document.body.append(box);
    }
    const h = Object.assign(document.createElement('div'), { textContent: title });
    h.style.fontWeight = '700';
    h.style.fontSize = '18px';
    box.replaceChildren(h, ...lines.map((t) => Object.assign(document.createElement('div'), { textContent: t })));
  }, { title, lines });
}

// Holds the current caption on screen. The recorder only stores frames when something repaints, so a still
// page would be cut from the video; a progress bar under the caption keeps the hold in the recording.
async function hold(page, ms) {
  await page.evaluate((ms) => {
    const box = document.getElementById('demo-caption');
    const bar = document.createElement('div');
    Object.assign(bar.style, { height: '3px', width: '0%', marginTop: '8px', background: '#fbbf24', transition: `width ${ms}ms linear` });
    box.append(bar);
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '100%'; }));
  }, ms);
  await page.waitForTimeout(ms);
}

const scrollTo = (locator) => locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));

async function approve(page) {
  await scrollTo(page.getByRole('heading', { name: /Safety Belt — confirm what you approve/ }));
  await page.getByRole('checkbox', { name: /I approve one conversion/ }).check();
  const saved = page.waitForResponse(isPost('/api/intent'));
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  expect((await saved).status()).toBe(200);
}

// Pays and returns the live interpretation and decision. A rate limit or provider outage pauses the
// checkout (fail closed); the recording shows that and retries through "Check again", at most twice.
async function payLive(page) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const interpreted = page.waitForResponse(isPost('/api/interpret'));
    const decided = page.waitForResponse(isPost('/api/decide'));
    if (attempt === 1) await page.getByRole('button', { name: 'Pay and convert' }).click();
    else await page.getByRole('button', { name: 'Check again' }).click();
    const { check } = await (await interpreted).json();
    const decide = await (await decided).json();
    expect(check.source, 'the server must use the live provider').toBe('live');
    if (check.status !== 'unavailable') return { check, decide };
    const reason = check.reasons?.[0] ?? 'unknown';
    if (!RETRYABLE.test(reason) || attempt === 3) throw new Error(`Gemini unavailable: ${reason}. Is GEMINI_API_KEY set in .env?`);
    await caption(page, `Gemini unavailable (${reason}) — Safety Belt paused, no payment made`, ['Retrying the live check in 20 seconds…']);
    await hold(page, 20_000);
  }
  throw new Error('unreachable');
}

function readout(i) {
  const lines = [`Billing: ${i.billingKind}, ${usd(i.upfrontCents)} today`];
  if (i.billingKind === 'recurring') lines[0] += `, then ${usd(i.renewalCents)} per ${i.renewalInterval} after a ${i.trialDays}-day trial`;
  return [...lines, `Quotes Gemini cited (verified word for word in the checkout text): ${i.quotations.map((q) => `"${q}"`).join('  ')}`];
}

async function outcomes(request) {
  return (await (await request.get('/api/state')).json()).outcomes;
}

test('live Gemini: one-off checkout completes once, trial-then-monthly checkout pauses', async ({ page, request }) => {
  await request.post('/api/reset');
  await page.goto('/');
  await expect(page.locator('#revision')).not.toBeEmpty();

  // Intro
  await caption(page, 'Safety Belt — live demo (real Gemini call, simulated payments)', [
    'You approve one PDF conversion at Paperlane Demo: at most USD 2.00, once, no subscription.',
  ]);
  await hold(page, 4000);

  // 1. Happy path
  await caption(page, '1 / 2  Happy path: USD 1 one-off checkout', ['Approve on Safety Belt’s own form, then pay.']);
  await approve(page);
  await scrollTo(page.locator('#disclosure'));
  await hold(page, 1500);
  await caption(page, '1 / 2  Happy path: checking the terms with Gemini…', ['Gemini reads only the checkout’s disclosure text.']);
  const happy = await payLive(page);
  expect(happy.check.status).toBe('interpreted');
  expect(happy.decide.decision.decision).toBe('ALLOW');
  const done = page.getByRole('region', { name: 'Done (simulated)' });
  await expect(done).toBeVisible();
  await scrollTo(done);
  await caption(page, '1 / 2  Allowed: terms match the approval → paid once', [
    ...readout(happy.check.interpretation),
    'Result: 1 simulated payment of USD 1.00, 0 subscriptions.',
  ]);
  const afterHappy = await outcomes(request);
  expect(afterHappy.payments).toHaveLength(1);
  expect(afterHappy.subscriptions).toEqual([]);
  await hold(page, 7000);

  // 2. Dangerous path
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('#payments')).toHaveText('0');
  await caption(page, '2 / 2  Dangerous path: USD 1 today, then USD 49.95 every month', ['Same approval: at most USD 2.00, once.']);
  await approve(page);
  const switched = page.waitForResponse(isPost('/api/checkout'));
  await page.getByLabel('Checkout variant').selectOption('trial-recurring');
  expect((await switched).status()).toBe(200);
  await scrollTo(page.locator('#disclosure'));
  await hold(page, 2000);
  await caption(page, '2 / 2  Dangerous path: checking the terms with Gemini…', ['Gemini reads only the checkout’s disclosure text.']);
  const danger = await payLive(page);
  expect(danger.check.status).toBe('interpreted');
  expect(danger.check.interpretation.billingKind).toBe('recurring');
  expect(danger.decide.decision.decision).toBe('CONFLICT');
  expect(danger.decide.decision.reasons).toContain('RECURRING_NOT_APPROVED');
  const paused = page.getByRole('heading', { name: 'Paused: this checkout does not match what you approved.' });
  await expect(paused).toBeVisible();
  await page.getByText('Review subscription terms (read-only)').click();
  await scrollTo(page.locator('#decision-evidence'));
  await caption(page, '2 / 2  Paused before payment: recurring charge was never approved', [
    ...readout(danger.check.interpretation),
    `Deterministic rule fired: ${danger.decide.decision.reasons.join(', ')} — the model explains, only code decides.`,
  ]);
  const afterDanger = await outcomes(request);
  expect(afterDanger.payments).toEqual([]);
  expect(afterDanger.subscriptions).toEqual([]);
  await hold(page, 10_000);
});
