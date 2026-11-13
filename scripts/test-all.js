// Runs node:test, then Playwright, with the current node binary (no shell syntax: TC13).
// Exits non-zero if either suite fails; both always run.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const run = (args) => spawnSync(process.execPath, args, { cwd, stdio: 'inherit' }).status;

const unit = run(['--test', 'test/**/*.test.js']);
const e2e = run([createRequire(import.meta.url).resolve('@playwright/test/cli'), 'test']);
console.log(`\ntest:all  node:test ${unit === 0 ? 'passed' : 'FAILED'}  playwright ${e2e === 0 ? 'passed' : 'FAILED'}`);
process.exit(unit === 0 && e2e === 0 ? 0 : 1);
