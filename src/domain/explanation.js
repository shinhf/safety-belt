// Pure explanation: turns a policy decision into plain-text lines for the Safety Belt surface.
// It explains; it never decides. Output is data rendered with textContent, never HTML.

export const GENERIC_REASON = 'Safety Belt could not confirm this checkout. Check again.';

const UNUSABLE = 'The terms check returned an answer Safety Belt cannot use.';
const INCONSISTENT = 'The billing terms are incomplete or inconsistent.';
const NO_ANSWER = 'The terms service returned no usable answer. Check again.';

const REASONS = {
  // Conflicts: the disclosed commitment is outside the approval.
  RECURRING_NOT_APPROVED: 'This checkout starts recurring charges. You approved a one-off payment only.',
  OVER_CAP: 'The charge is above the maximum you approved.',
  CURRENCY_MISMATCH: 'The charge is not in US dollars, the currency you approved.',
  MERCHANT_MISMATCH: 'This checkout is for a different merchant than the one you approved.',
  SCOPE_MISMATCH: 'This checkout is for a different document or action than the one you approved.',
  // Approval and freshness.
  INTENT_MISSING: 'Confirm what you approve in Safety Belt first.',
  INTENT_INVALID: 'Your approval is incomplete. Confirm it again.',
  INTERPRETATION_MISSING: 'The current checkout terms have not been checked yet, or they changed since the last check. Check again.',
  INTERPRETATION_STALE: 'The checkout or your approval changed after the last check. Check again.',
  INTERPRETATION_CLARIFY: 'The disclosed terms could not be confirmed.',
  INTERPRETATION_UNAVAILABLE: 'The terms check could not run.',
  // Evidence in the disclosure.
  EVIDENCE_MISSING: 'The checkout does not state its billing terms.',
  EVIDENCE_CONTRADICTORY: "The checkout's billing terms contradict each other.",
  EVIDENCE_UNCERTAIN: 'The billing terms are too vague to rely on.',
  EVIDENCE_UNSUPPORTED: 'The checkout uses amounts or billing periods Safety Belt does not support.',
  EVIDENCE_NOT_CLEAR: 'The billing terms are not clear enough to rely on.',
  // Commitment-derived codes are worded neutrally: only disclosed terms are observable (OC3).
  UNSUPPORTED_AMOUNT: 'Safety Belt could not confirm these terms for this checkout. Check again.',
  QUOTE_NOT_IN_DISCLOSURE: "The terms check could not point to the checkout's own words.",
  NO_QUOTATIONS: "The terms check could not point to the checkout's own words.",
  COMMITMENT_MISMATCH: 'Safety Belt could not confirm these terms for this checkout. Check again.',
  SEMANTIC_EXECUTION_DISAGREEMENT: 'Safety Belt could not confirm these terms for this checkout. Check again.',
  MERCHANT_NAME_MISMATCH: 'The terms check named a different merchant than this checkout shows.',
  INPUT_TOO_LARGE: 'The checkout text is too long to check.',
  BILLING_KIND_UNKNOWN: INCONSISTENT,
  UPFRONT_MISSING: INCONSISTENT,
  ONE_OFF_WITH_RENEWAL_FIELDS: INCONSISTENT,
  RECURRING_INCOMPLETE: INCONSISTENT,
  MALFORMED_JSON: UNUSABLE,
  NOT_OBJECT: UNUSABLE,
  EXTRA_FIELD: UNUSABLE,
  MISSING_FIELD: UNUSABLE,
  BAD_INTEGER: UNUSABLE,
  BAD_CURRENCY: UNUSABLE,
  BAD_MERCHANT: UNUSABLE,
  BAD_BILLING_KIND: UNUSABLE,
  BAD_INTERVAL: UNUSABLE,
  BAD_EVIDENCE_STATUS: UNUSABLE,
  BAD_QUOTATIONS: UNUSABLE,
  // Provider.
  NO_API_KEY: 'No model key is configured, so the terms cannot be checked.',
  PROVIDER_TIMEOUT: 'The terms check timed out. Check again.',
  PROVIDER_NETWORK: 'The terms service could not be reached. Check again.',
  PROVIDER_BLOCKED: NO_ANSWER,
  PROVIDER_INCOMPLETE: NO_ANSWER,
  PROVIDER_BAD_RESPONSE: NO_ANSWER,
};

const CONFLICT_CODES = new Set(['RECURRING_NOT_APPROVED', 'OVER_CAP', 'CURRENCY_MISMATCH', 'MERCHANT_MISMATCH', 'SCOPE_MISMATCH']);

export function reasonText(code) {
  if (Object.hasOwn(REASONS, code)) return REASONS[code];
  const http = /^PROVIDER_HTTP_(\d{3})$/.exec(code);
  if (http) return `The terms service returned an error (HTTP ${http[1]}). Check again later.`;
  return GENERIC_REASON;
}

function reasonsFor(tone, codes) {
  // A clarification hides conflict reasons: they come from the owned commitment, which the disclosure may not state.
  const texts = [...new Set(codes.filter((r) => tone !== 'clarify' || !CONFLICT_CODES.has(r)).map(reasonText))];
  return tone !== 'allow' && texts.length === 0 ? [GENERIC_REASON] : texts;
}

const money = (cents, currency) => `${currency} ${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

function describeTerms(t) {
  const now = money(t.upfrontCents, t.currency);
  if (t.billingKind === 'one_off') return `This checkout charges ${now} once.`;
  const after = t.trialDays ? ` after ${t.trialDays} days` : '';
  return `This checkout charges ${now} today, then ${money(t.renewalCents, t.currency)} each ${t.renewalInterval}${after}.`;
}

const HEADLINES = {
  ALLOW: 'The terms match your approval.',
  CONFLICT: 'Paused: this checkout does not match what you approved.',
  CLARIFY: 'Paused: Safety Belt needs clear terms before any payment.',
};

/** intent: session.intent or null. decision: policy decide() result. check: interpretation result or null. */
export function explain(intent, decision, check) {
  const tone = decision.decision === 'ALLOW' ? 'allow' : decision.decision === 'CONFLICT' ? 'pause' : 'clarify';
  // Terms are shown as fact only when they passed validation and the decision is not a clarification.
  const terms = tone !== 'clarify' && check?.status === 'interpreted' ? check.interpretation : null;
  return {
    tone,
    headline: HEADLINES[decision.decision] ?? HEADLINES.CLARIFY,
    approved: intent && !decision.reasons.includes('INTENT_INVALID') && Number.isSafeInteger(intent.capCents)
      ? `You approved one document conversion, at most ${money(intent.capCents, intent.currency)}, once (one-off only).`
      : 'You have not approved anything valid yet.',
    disclosed: terms ? describeTerms(terms) : null,
    recurringDisclosed: terms?.billingKind === 'recurring',
    merchant: check?.input?.merchantDisplayName ?? null,
    reasons: reasonsFor(tone, decision.reasons),
    evidence: [...decision.evidence],
    source: check?.source ?? null,
  };
}
