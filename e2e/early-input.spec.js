// Task 6 regression: input before the page script has finished init() must never fall back to a native form submit.
import { test, expect, approve, payButton } from './fixtures.js';

test('[ui·replay] clicking the submit buttons before state loads does not reload the page', async ({ page, stub }) => {
  stub.replay('one-off-clear');
  let release;
  const stateGate = new Promise((r) => { release = r; });
  await page.route('**/api/state', async (route) => { await stateGate; await route.continue(); });
  const navigations = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
  const intentPosts = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/intent')) intentPosts.push(r.url()); });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const loadedAt = navigations.length;
  await page.getByRole('checkbox').check({ force: true });
  await page.getByRole('button', { name: 'Confirm approval' }).click({ force: true });
  await payButton(page).click({ force: true });
  await page.getByLabel('Maximum charge (USD)').press('Enter');
  await page.waitForTimeout(300); // give a native submit time to start navigating
  expect(navigations.slice(loadedAt)).toEqual([]);
  expect(intentPosts).toEqual([]);

  release();
  await expect(payButton(page)).toBeEnabled();
  expect(page.url()).not.toContain('?');
  await approve(page);
  expect(intentPosts).toHaveLength(1);
});
