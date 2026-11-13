import { defineConfig } from '@playwright/test';

// Live demo run: real Gemini through the production adapter, recorded on video.
// Kept apart from playwright.config.js, whose suite needs replay answers to inject failures deterministically.
// The server reads GEMINI_API_KEY from .env, exactly like `npm start`, on its own port so it never shares
// in-memory state with a server you already have running.
const PORT = 3210;

export default defineConfig({
  testDir: 'e2e-live',
  testMatch: '*.live.spec.js',
  workers: 1,
  retries: 0, // a live call that fails must show as a failure, never as a silent retry
  timeout: 180_000,
  reporter: 'list',
  outputDir: 'test-results/live',
  webServer: {
    command: 'node --env-file-if-exists=.env src/server.js',
    url: `http://127.0.0.1:${PORT}`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    browserName: 'chromium',
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    video: { mode: 'on', size: { width: 1280, height: 800 } },
    launchOptions: { slowMo: 250 }, // human pace, so the recording is watchable
  },
});
