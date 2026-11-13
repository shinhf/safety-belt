// Task 8 eval runner: each labelled case goes through the same adapter, validator and policy as the service.
import { interpretWithAnswer } from './gemini.js';
import { decide } from './domain/policy.js';
import { caseSnapshot, EVAL_INTENT, scoreCase, summarize } from './domain/evaluation.js';

/**
 * set: parsed eval/billing-cases.json. gemini: { apiKey, fetch, source }. Calls run one at a time,
 * `pauseMs` apart, to stay under the key's rate limit (eval only; the service makes one call per check).
 * `onRecord(record, recordsSoFar)` runs after each case.
 */
export async function runEval(set, gemini, { pauseMs = 0, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRecord = () => {} } = {}) {
  const records = [];
  for (const [i, c] of set.cases.entries()) {
    if (i > 0 && pauseMs > 0) await sleep(pauseMs);
    const snapshot = caseSnapshot(c, i, set.merchantDisplayName);
    const tags = { intentRevision: EVAL_INTENT.revision, checkoutId: snapshot.checkoutId, checkoutRevision: snapshot.revision };
    const { check, answerText } = await interpretWithAnswer(snapshot, tags, gemini);
    const record = { ...scoreCase(c, { answerText, check, decision: decide(EVAL_INTENT, snapshot, check) }), source: gemini.source, disclosureText: c.disclosureText };
    records.push(record);
    onRecord(record, records); // lets the caller persist evidence as it arrives
  }
  return { source: gemini.source, records, summary: summarize(records) };
}
