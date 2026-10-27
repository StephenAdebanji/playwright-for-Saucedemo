import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';
import { env } from './src/config/env';

const STANDARD_USER_STATE = '.auth/standard_user.json';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: env.isCI,
  retries: env.isCI ? 2 : 0,
  workers: env.isCI ? 4 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_000 },

  // Locally: readable output + HTML report + AI triage.
  // CI: blob reports per shard; AI triage runs once after merge (see merge.config.ts).
  reporter: env.isCI
    ? [['blob'], ['github'], ['list']]
    : [['list'], ['html', { open: 'never' }], ['./src/ai/ai-triage-reporter.ts']],

  use: {
    baseURL: env.uiBaseUrl,
    testIdAttribute: 'data-test',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // ---------- Auth bootstrap (runs once, shared by UI projects) ----------
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ---------- UI: cross-browser ----------
    {
      name: 'chromium',
      testDir: './tests/ui',
      use: { ...devices['Desktop Chrome'], storageState: STANDARD_USER_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      testDir: './tests/ui',
      use: { ...devices['Desktop Firefox'], storageState: STANDARD_USER_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      testDir: './tests/ui',
      grep: /@smoke/,
      use: { ...devices['Pixel 7'], storageState: STANDARD_USER_STATE },
      dependencies: ['setup'],
    },

    // ---------- Accessibility (WCAG 2.1 AA via axe-core) ----------
    {
      name: 'a11y',
      testDir: './tests/a11y',
      use: { ...devices['Desktop Chrome'], storageState: STANDARD_USER_STATE },
      dependencies: ['setup'],
    },

    // ---------- API contract + data integrity (no browser) ----------
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: env.apiBaseUrl },
    },

    // ---------- Unit tests for framework code (AI triage, utils) ----------
    {
      name: 'unit',
      testDir: './tests/unit',
    },

    // ---------- AI-assisted checks (need ANTHROPIC_API_KEY; nightly) ----------
    {
      name: 'ai',
      testDir: './tests/ai',
      timeout: 180_000,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
