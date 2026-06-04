// frontend/tests/auth.setup.js
// Runs once before all tests. Logs in as admin, saves session to disk.
// All other tests reuse this session — no login per test = much faster CI.

const { test: setup, expect } = require('@playwright/test');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'playwright/.auth/admin.json');

setup('authenticate as admin', async ({ page }) => {
  const email    = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set.\n' +
      'In local dev: create a .env.test file in frontend/.\n' +
      'In CI: add them as GitHub Secrets.'
    );
  }

  await page.goto('/login');

  // Use data-testid selectors — these already exist in Login.js
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();

  // Admin role redirects to /sales after login
  await expect(page).toHaveURL(/\/sales/, { timeout: 20_000 });

  // Save session (cookies + localStorage with JWT)
  await page.context().storageState({ path: AUTH_FILE });

  console.log(`✅ Authenticated as ${email}`);
});
