// frontend/playwright.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',

  // Max time per test
  timeout: 30_000,

  // Retry failed tests twice in CI (flaky network, slow HuggingFace cold start)
  retries: process.env.CI ? 2 : 0,

  // Run tests sequentially in CI to avoid race conditions on shared DB
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],

  use: {
    // Set by GitHub Actions to the Vercel preview/production URL
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    // Save screenshots/video on failure — invaluable for debugging CI failures
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    // Wait up to 10s for network calls (HuggingFace backend can be slow to warm up)
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    // --- Step 1: Login once and save the session ---
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },

    // --- Step 2: Run all tests reusing the saved session ---
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Load the saved login session — no re-login per test
        storageState: 'tests/playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
});
