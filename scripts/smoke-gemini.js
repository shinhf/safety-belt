// Live smoke check (task 3): one synthetic request through the production adapter and validator.
// Never part of `npm test`. Exit 0 PASS, 1 FAIL, 2 SKIPPED (no key), 3 usage. Never prints the key or headers.
import { createSession, selectVariant, VARIANTS } from '../src/domain/checkout.js';
import { interpretCheckout, generationConfig, API, API_ROOT, MODEL } from '../src/gemini.js';

const apiKey = process.env.GEMINI_API_KEY;
const variantId = process.argv[2] ?? 'trial-recurring';

// process.exitCode, not process.exit(): exit() can drop piped stdout before it is flushed.
if (!Object.hasOwn(VARIANTS, variantId)) {
  console.error(`Unknown variant: ${variantId}. Use one of: ${Object.keys(VARIANTS).join(', ')}`);
  process.exitCode = 3;
} else if (!apiKey) {
  console.log('SKIPPED: GEMINI_API_KEY not set');
  process.exitCode = 2;
} else {
  const snapshot = selectVariant(createSession(), variantId);
  const tags = { intentRevision: 0, checkoutId: snapshot.checkoutId, checkoutRevision: snapshot.revision };
  const check = await interpretCheckout(snapshot, tags, { apiKey, fetch: globalThis.fetch, source: 'live' });
  const verdict = check.status === 'interpreted' ? 'PASS' : 'FAIL';
  console.log(JSON.stringify({
    verdict, date: new Date().toISOString(), api: API, apiRoot: API_ROOT, model: MODEL, variantId,
    generationConfigKeys: Object.keys(generationConfig()),
    status: check.status, reasons: check.reasons, provider: check.provider, interpretation: check.interpretation,
  }, null, 2));
  process.exitCode = verdict === 'PASS' ? 0 : 1;
}
