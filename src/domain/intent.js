// Pure intent domain: only explicit Safety Belt confirmation creates or revises approval.
import { randomUUID } from 'node:crypto';
import { deepFreeze } from './checkout.js';

// Module-wide so intent revisions never repeat across resets (a stale grant can't match a new intent).
let lastRevision = 0;
// Same bound the confirmation UI enforces (USD 999,999.99).
export const MAX_CAP_CENTS = 99_999_999;

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function confirmIntent(session, { documentId, merchantId, currency, capCents, billingScope, confirmed }) {
  if (confirmed !== true) fail('INTENT_NOT_CONFIRMED');
  if (documentId !== 'doc-synthetic-001' || merchantId !== 'paperlane-demo' || currency !== 'USD'
    || !Number.isSafeInteger(capCents) || capCents < 0 || capCents > MAX_CAP_CENTS || billingScope !== 'one_off_only') fail('INVALID_INTENT');
  session.intent = deepFreeze({
    intentId: session.intent?.intentId ?? randomUUID(),
    revision: ++lastRevision,
    documentId,
    action: 'convert-one-document',
    merchantId,
    currency,
    capCents,
    billingScope,
  });
  session.checks.clear();
  session.grants.clear();
  return session.intent;
}

export const intentView = (session) => (session.intent ? { ...session.intent } : null);
