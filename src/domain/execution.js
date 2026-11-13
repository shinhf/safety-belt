// Execution boundary: the only place a simulated payment or conversion happens.
// Everything below is synchronous on purpose: check, consume and side effect form one critical section.
import { randomUUID } from 'node:crypto';
import { deepFreeze, COMMITMENT_FIELDS as MATERIAL } from './checkout.js';

const fail = (reason) => ({ ok: false, reason });

/**
 * Every supported submit path (button, Enter, direct API) ends here. Counts the attempt, then either rejects with
 * a reason and zero side effects, or consumes the grant and executes exactly the commitment it captured.
 * MUST stay synchronous: an `await` anywhere in here would let a concurrent request reuse the grant.
 */
export function submit(session, grantId) {
  const { outcomes, intent, checkout } = session;
  outcomes.attemptedSubmissions += 1;

  // One payment per run; checked first so response-loss retries get a clear answer.
  if (outcomes.payments.length > 0) return fail('ALREADY_COMPLETED');
  if (typeof grantId !== 'string' || grantId === '') return fail('GRANT_REQUIRED');
  const grant = session.grants.get(grantId);
  if (!grant) return fail('GRANT_UNKNOWN');

  const current = intent && grant.intentId === intent.intentId && grant.intentRevision === intent.revision
    && grant.checkoutId === checkout.checkoutId && grant.checkoutRevision === checkout.revision
    && grant.merchantId === checkout.merchant.id && grant.merchantId === intent.merchantId
    && grant.documentId === checkout.document.id && grant.documentId === intent.documentId
    && grant.action === checkout.document.action && grant.action === intent.action
    && MATERIAL.every((k) => grant.commitment[k] === checkout.commitment[k]);
  if (!current) {
    session.grants.clear();
    return fail('GRANT_STALE');
  }
  // The handler never creates a subscription in this MVP, whatever a grant says.
  const c = grant.commitment;
  if (c.billingKind !== 'one_off' || c.renewalCents !== null || c.renewalInterval !== null || c.trialDays !== null) {
    session.grants.clear();
    return fail('NOT_ONE_OFF');
  }

  session.grants.clear(); // consume: single use, and no other grant survives an execution
  const payment = deepFreeze({
    paymentId: randomUUID(),
    amountCents: c.upfrontCents,
    currency: c.currency,
    merchantId: grant.merchantId,
    intentId: grant.intentId,
    documentId: grant.documentId,
    simulated: true,
  });
  outcomes.executions += 1;
  outcomes.payments.push(payment);
  outcomes.conversionStatus = 'completed';
  return { ok: true, payment };
}
