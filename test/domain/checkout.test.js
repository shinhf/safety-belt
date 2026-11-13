import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, selectVariant, publicSnapshot, outcomeView, reset,
} from '../../src/domain/checkout.js';

test('revision increments on every change, including away and back', () => {
  const s = createSession();
  const r0 = s.checkout.revision;
  selectVariant(s, 'trial-recurring');
  const r1 = s.checkout.revision;
  selectVariant(s, 'one-off-usd1');
  const r2 = s.checkout.revision;
  assert.ok(r1 > r0 && r2 > r1);
  assert.equal(s.checkout.disclosure.includes('charged once'), true);
});

test('snapshot is deeply frozen', () => {
  const { checkout } = createSession();
  assert.ok(Object.isFrozen(checkout) && Object.isFrozen(checkout.commitment) && Object.isFrozen(checkout.merchant));
  assert.throws(() => { 'use strict'; checkout.commitment.upfrontCents = 0; }, TypeError);
});

test('publicSnapshot omits commitment and hidden labels', () => {
  const s = createSession();
  selectVariant(s, 'trial-recurring');
  const pub = publicSnapshot(s.checkout);
  assert.deepEqual(Object.keys(pub).sort(), ['checkoutId', 'disclosure', 'document', 'merchant', 'revision']);
  assert.equal(pub.disclosure, 'USD 1 today. Free 7-day trial, then USD 49.95 per month until cancelled.');
});

test('reset zeroes outcomes and clears intent/checks/grants', () => {
  const s = createSession();
  s.outcomes.attemptedSubmissions = 3;
  s.grants.set('g', {});
  selectVariant(s, 'non-usd');
  reset(s);
  assert.deepEqual(outcomeView(s), { attemptedSubmissions: 0, executions: 0, payments: [], subscriptions: [], conversionStatus: 'not_started' });
  assert.equal(s.grants.size + s.checks.size, 0);
  assert.equal(s.intent, null);
  assert.equal(s.checkout.variantId, 'one-off-usd1');
});

test('unknown variant throws', () => {
  const s = createSession();
  assert.throws(() => selectVariant(s, 'nope'));
  assert.throws(() => selectVariant(s, '__proto__'));
});
