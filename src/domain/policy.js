// Pure policy: compares the owned execution commitment and the validated interpretation with the
// independently approved intent. The model can explain terms; only this code can allow.
import { randomBytes } from 'node:crypto';
import { deepFreeze } from './checkout.js';

const MATERIAL = ['upfrontCents', 'currency', 'billingKind', 'renewalCents', 'renewalInterval', 'trialDays'];
const isCents = (v) => Number.isSafeInteger(v) && v >= 0;

const validIntent = (i) => i && typeof i.intentId === 'string' && Number.isSafeInteger(i.revision)
  && i.billingScope === 'one_off_only' && i.currency === 'USD' && isCents(i.capCents);

/**
 * intent: session.intent or null. snapshot: current checkout snapshot (with commitment).
 * check: Task 3 interpretation result { tags, status, reasons, interpretation } or null.
 * Returns a frozen decision. CLARIFY wins over CONFLICT: when the disclosed terms or the approval are unusable,
 * the user is asked to clarify rather than shown a conflict they could not have read. ALLOW needs zero reasons.
 */
export function decide(intent, snapshot, check) {
  const conflicts = [];
  const clarify = [];
  const c = snapshot.commitment;

  if (!intent) clarify.push('INTENT_MISSING');
  else if (!validIntent(intent)) clarify.push('INTENT_INVALID');

  if (!check) clarify.push('INTERPRETATION_MISSING');
  else if (!intent || check.tags?.intentRevision !== intent.revision || check.tags?.checkoutId !== snapshot.checkoutId
    || check.tags?.checkoutRevision !== snapshot.revision) clarify.push('INTERPRETATION_STALE');
  else if (check.status !== 'interpreted' || !check.interpretation) {
    clarify.push(`INTERPRETATION_${String(check.status).toUpperCase()}`, ...(check.reasons ?? []));
  } else if (check.interpretation.evidenceStatus !== 'clear' || !(check.interpretation.quotations?.length > 0)) {
    clarify.push('EVIDENCE_NOT_CLEAR');
  } else if (MATERIAL.some((k) => check.interpretation[k] !== c[k])) clarify.push('SEMANTIC_EXECUTION_DISAGREEMENT');

  // Deterministic checks on the owned commitment, independent of the model.
  if (!isCents(c.upfrontCents) || typeof c.currency !== 'string') clarify.push('UNSUPPORTED_AMOUNT');
  // One-off must be explicit: any renewal/trial field is recurrence; anything else that isn't 'one_off' is unknown.
  if (c.billingKind === 'recurring' || c.renewalCents != null || c.renewalInterval != null || c.trialDays != null) {
    conflicts.push('RECURRING_NOT_APPROVED');
  } else if (c.billingKind !== 'one_off') clarify.push('BILLING_KIND_UNKNOWN');
  if (validIntent(intent)) {
    if (snapshot.merchant.id !== intent.merchantId) conflicts.push('MERCHANT_MISMATCH');
    if (snapshot.document.id !== intent.documentId || snapshot.document.action !== intent.action) conflicts.push('SCOPE_MISMATCH');
    if (c.currency !== intent.currency) conflicts.push('CURRENCY_MISMATCH');
    else if (isCents(c.upfrontCents) && c.upfrontCents > intent.capCents) conflicts.push('OVER_CAP');
  }

  const decision = clarify.length ? 'CLARIFY' : conflicts.length ? 'CONFLICT' : 'ALLOW';
  return deepFreeze({
    decision,
    reasons: [...clarify, ...conflicts],
    intentRevision: intent?.revision ?? null,
    checkoutId: snapshot.checkoutId,
    checkoutRevision: snapshot.revision,
    evidence: check?.interpretation?.quotations ?? [],
  });
}

/**
 * Decides on the session's *current* intent and checkout and, only on ALLOW, mints a single-use grant.
 * Takes no decision as input, so a forged or edited verdict cannot reach grant issuance.
 * check: the server-held interpretation result. Returns { decision, grantId } with grantId null unless ALLOW.
 */
export function evaluate(session, check) {
  const { intent, checkout } = session;
  const decision = decide(intent, checkout, check);
  session.grants.clear(); // every evaluation supersedes earlier grants, so a later non-ALLOW revokes them
  if (decision.decision !== 'ALLOW') return { decision, grantId: null };
  const grantId = randomBytes(32).toString('base64url');
  session.grants.set(grantId, deepFreeze({
    intentId: intent.intentId,
    intentRevision: intent.revision,
    checkoutId: checkout.checkoutId,
    checkoutRevision: checkout.revision,
    merchantId: checkout.merchant.id,
    documentId: checkout.document.id,
    action: checkout.document.action,
    commitment: structuredClone(checkout.commitment),
  }));
  return { decision, grantId };
}
