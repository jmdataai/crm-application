# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.setup.js >> authenticate as admin
- Location: tests\auth.setup.js:10:1

# Error details

```
Error: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set.
In local dev: create a .env.test file in frontend/.
In CI: add them as GitHub Secrets.
```

# Test source

```ts
  1  | // frontend/tests/auth.setup.js
  2  | // Runs once before all tests. Logs in as admin, saves session to disk.
  3  | // All other tests reuse this session — no login per test = much faster CI.
  4  | 
  5  | const { test: setup, expect } = require('@playwright/test');
  6  | const path = require('path');
  7  | 
  8  | const AUTH_FILE = path.join(__dirname, 'playwright/.auth/admin.json');
  9  | 
  10 | setup('authenticate as admin', async ({ page }) => {
  11 |   const email    = process.env.TEST_ADMIN_EMAIL;
  12 |   const password = process.env.TEST_ADMIN_PASSWORD;
  13 | 
  14 |   if (!email || !password) {
> 15 |     throw new Error(
     |           ^ Error: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set.
  16 |       'TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set.\n' +
  17 |       'In local dev: create a .env.test file in frontend/.\n' +
  18 |       'In CI: add them as GitHub Secrets.'
  19 |     );
  20 |   }
  21 | 
  22 |   await page.goto('/login');
  23 | 
  24 |   // Use data-testid selectors — these already exist in Login.js
  25 |   await page.getByTestId('login-email').fill(email);
  26 |   await page.getByTestId('login-password').fill(password);
  27 |   await page.getByTestId('login-submit').click();
  28 | 
  29 |   // Admin role redirects to /sales after login
  30 |   await expect(page).toHaveURL(/\/sales/, { timeout: 20_000 });
  31 | 
  32 |   // Save session (cookies + localStorage with JWT)
  33 |   await page.context().storageState({ path: AUTH_FILE });
  34 | 
  35 |   console.log(`✅ Authenticated as ${email}`);
  36 | });
  37 | 
```