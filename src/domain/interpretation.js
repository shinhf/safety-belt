// Interpretation domain: the JSON Schema sent to Gemini and the local validator that enforces it.
// Gemini strips unsupported keywords and does not guarantee semantics, so the validator is the real gate.
import { COMMITMENT_FIELDS } from './checkout.js';

export const BILLING_KINDS = ['one_off', 'recurring', 'unknown'];
export const INTERVALS = ['day', 'week', 'month', 'year'];
export const EVIDENCE = ['clear', 'missing', 'contradictory', 'uncertain', 'unsupported'];
export const MAX_QUOTES = 5;
export const MAX_QUOTE_CHARS = 500;

const nullable = (schema) => ({ ...schema, type: [schema.type, 'null'] });
const cents = { type: 'integer', minimum: 0 };

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    upfrontCents: nullable(cents),
    currency: nullable({ type: 'string', description: 'ISO 4217 code, e.g. USD' }),
    merchantName: nullable({ type: 'string' }),
    billingKind: { type: 'string', enum: BILLING_KINDS },
    renewalCents: nullable(cents),
    renewalInterval: { type: ['string', 'null'], enum: [...INTERVALS, null] },
    trialDays: nullable({ type: 'integer', minimum: 0 }),
    evidenceStatus: { type: 'string', enum: EVIDENCE },
    quotations: { type: 'array', items: { type: 'string' }, maxItems: MAX_QUOTES },
  },
  required: ['upfrontCents', 'currency', 'merchantName', 'billingKind', 'renewalCents',
    'renewalInterval', 'trialDays', 'evidenceStatus', 'quotations'],
  additionalProperties: false,
};

const FIELDS = RESPONSE_SCHEMA.required;
const isCents = (v) => Number.isSafeInteger(v) && v >= 0;

// Shape check only: returns reason codes, [] when the object matches the contract.
function shapeErrors(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return ['NOT_OBJECT'];
  const errors = [];
  const keys = Object.keys(o);
  if (keys.some((k) => !FIELDS.includes(k))) errors.push('EXTRA_FIELD');
  if (FIELDS.some((k) => !Object.hasOwn(o, k))) errors.push('MISSING_FIELD');
  if (errors.length) return errors;

  const optCents = (v) => v === null || isCents(v);
  if (!optCents(o.upfrontCents) || !optCents(o.renewalCents) || !optCents(o.trialDays)) errors.push('BAD_INTEGER');
  if (o.currency !== null && !(typeof o.currency === 'string' && /^[A-Z]{3}$/.test(o.currency))) errors.push('BAD_CURRENCY');
  if (o.merchantName !== null && typeof o.merchantName !== 'string') errors.push('BAD_MERCHANT');
  if (!BILLING_KINDS.includes(o.billingKind)) errors.push('BAD_BILLING_KIND');
  if (o.renewalInterval !== null && !INTERVALS.includes(o.renewalInterval)) errors.push('BAD_INTERVAL');
  if (!EVIDENCE.includes(o.evidenceStatus)) errors.push('BAD_EVIDENCE_STATUS');
  if (!Array.isArray(o.quotations) || o.quotations.length > MAX_QUOTES
    || o.quotations.some((q) => typeof q !== 'string' || !q.trim() || q.length > MAX_QUOTE_CHARS)) errors.push('BAD_QUOTATIONS');
  return errors;
}

// Semantic check against the public input the model saw and the fixture's hidden commitment.
// Returns reason codes; [] means the interpretation is clear, well-supported and matches the fixture.
function semanticErrors(o, snapshot) {
  if (o.evidenceStatus !== 'clear') return [`EVIDENCE_${o.evidenceStatus.toUpperCase()}`];
  const errors = [];
  if (o.billingKind === 'unknown') errors.push('BILLING_KIND_UNKNOWN');
  if (o.upfrontCents === null || o.currency === null) errors.push('UPFRONT_MISSING');
  if (o.merchantName !== snapshot.merchant.name) errors.push('MERCHANT_NAME_MISMATCH');
  if (o.quotations.length === 0) errors.push('NO_QUOTATIONS');
  // shortcut: proves each quote is in the disclosure, not that it supports billingKind; task 8 eval measures implicit one-off wording.
  if (o.quotations.some((q) => !snapshot.disclosure.includes(q))) errors.push('QUOTE_NOT_IN_DISCLOSURE');
  if (o.billingKind === 'one_off' && (o.renewalCents !== null || o.renewalInterval !== null || o.trialDays !== null)) {
    errors.push('ONE_OFF_WITH_RENEWAL_FIELDS');
  }
  if (o.billingKind === 'recurring' && (o.renewalCents === null || o.renewalInterval === null)) errors.push('RECURRING_INCOMPLETE');
  if (errors.length) return errors;

  const c = snapshot.commitment;
  if (COMMITMENT_FIELDS.some((k) => o[k] !== c[k])) errors.push('COMMITMENT_MISMATCH');
  return errors;
}

// raw: the model's JSON text. Returns { ok, reasons, interpretation }; ok=false always means CLARIFY.
export function validateInterpretation(raw, snapshot) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, reasons: ['MALFORMED_JSON'], interpretation: null }; }
  const shape = shapeErrors(parsed);
  if (shape.length) return { ok: false, reasons: shape, interpretation: null };
  const semantic = semanticErrors(parsed, snapshot);
  return { ok: semantic.length === 0, reasons: semantic, interpretation: parsed };
}
