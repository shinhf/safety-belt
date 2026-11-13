// Task 8 live eval: runs eval/billing-cases.json against the live model with the application's prompt and schema.
// Never part of `npm test`. Exit 0 every case measured and passed, 1 a case failed or was not measured,
// 2 SKIPPED (no key), 3 runner or input error. The record is rewritten after every case, so a crash keeps the evidence.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runEval } from '../src/eval.js';
import { generationConfig, SYSTEM_INSTRUCTION, API, API_ROOT, MODEL } from '../src/gemini.js';
import { RESPONSE_SCHEMA } from '../src/domain/interpretation.js';
import { runPassed, summarize, validateCaseSet } from '../src/domain/evaluation.js';

const CASES = new URL('../eval/billing-cases.json', import.meta.url);
const RUNS = new URL('../eval/runs/', import.meta.url);
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function git(...args) {
  try { return execFileSync('git', args, { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim(); } catch { return null; }
}

function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.log('SKIPPED: GEMINI_API_KEY not set. No live evidence recorded.');
    return 2;
  }
  const pauseText = process.env.EVAL_PAUSE_MS ?? '15000';
  const pauseMs = Number(pauseText);
  if (!/^\d+$/.test(pauseText) || !Number.isSafeInteger(pauseMs)) {
    console.error(`EVAL_PAUSE_MS must be a non-negative integer of milliseconds, got "${pauseText}".`);
    return 3;
  }
  const raw = readFileSync(CASES);
  const set = JSON.parse(raw);
  const problems = validateCaseSet(set);
  if (problems.length) {
    console.error(`Case file is not usable:\n- ${problems.join('\n- ')}`);
    return 3;
  }
  return { set, raw, pauseMs };
}

const input = main();
if (typeof input === 'number') process.exitCode = input;
else {
  const startedAt = new Date().toISOString();
  mkdirSync(RUNS, { recursive: true });
  const file = new URL(`${startedAt.replace(/[:.]/g, '-')}.json`, RUNS);
  const status = git('status', '--porcelain');
  const header = {
    startedAt,
    source: 'live',
    api: API,
    apiRoot: API_ROOT,
    model: MODEL,
    generationConfig: { ...generationConfig(), responseJsonSchema: '(see responseSchemaSha256)' },
    systemInstructionSha256: sha256(SYSTEM_INSTRUCTION),
    responseSchemaSha256: sha256(JSON.stringify(RESPONSE_SCHEMA)),
    gitCommit: git('rev-parse', 'HEAD'),
    gitDirty: status === null ? null : status.length > 0,
    pauseMs: input.pauseMs,
    casesSha256: sha256(input.raw),
  };
  const save = (records, extra) => writeFileSync(file, `${JSON.stringify({
    ...header,
    modelVersions: [...new Set(records.map((r) => r.modelVersion).filter(Boolean))],
    summary: summarize(records),
    ...extra,
    records,
  }, null, 2)}\n`);
  let records = [];
  try {
    const run = await runEval(input.set, { apiKey: process.env.GEMINI_API_KEY, fetch: globalThis.fetch, source: 'live' }, {
      pauseMs: input.pauseMs,
      onRecord: (_r, soFar) => { records = soFar; save(soFar, { complete: false }); },
    });
    save(run.records, { complete: true, finishedAt: new Date().toISOString() });
    for (const r of run.records) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(30)} ${r.status.padEnd(12)} ${r.decision.padEnd(9)} ${r.failures.join('; ')}`);
    }
    console.log(JSON.stringify(run.summary));
    console.log(`Run record: eval/runs/${file.pathname.split('/').pop()}`);
    process.exitCode = runPassed(run.summary) ? 0 : 1;
  } catch (err) {
    save(records, { complete: false, aborted: `${err?.name ?? 'Error'}: ${err?.message ?? err}` });
    console.error(`Eval aborted after ${records.length} case(s); partial record kept in eval/runs/${file.pathname.split('/').pop()}`);
    process.exitCode = 3;
  }
}
