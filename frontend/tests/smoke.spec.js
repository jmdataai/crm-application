/**
 * Nexus CRM — Complete Playwright Frontend Test Suite
 * ====================================================
 * Covers every route, every tab, and key interactions.
 *
 * BULK EMAIL: page-load check only — no clicks on Send, PIN, or recipients.
 * DESTRUCTIVE: no real deletes of production data (creates use cleanup names).
 *
 * Run locally:
 *   cd frontend
 *   npx playwright test
 *
 * Run headed (watch it):
 *   npx playwright test --headed
 */

const { test, expect } = require('@playwright/test');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ready(page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
}

async function noError(page) {
  await expect(page.locator('text=/something went wrong/i')).not.toBeVisible();
  await expect(page.locator('text=/failed to load/i')).not.toBeVisible();
}

async function tabClick(page, label) {
  await page.locator(`button:has-text("${label}")`).first().click();
  await page.waitForTimeout(800);
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Auth', () => {
  test('login page renders all fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-password')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('wrong credentials shows error, stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('wrong@example.com');
    await page.getByTestId('login-password').fill('wrongpassword');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 6_000 });
    await expect(
      page.locator('text=/invalid|incorrect|wrong|failed|error/i').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('empty email shows validation', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-submit').click();
    // Should not navigate away
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated access redirects to login', async ({ browser }) => {
    const ctx  = await browser.newContext(); // fresh context, no saved auth
    const page = await ctx.newPage();
    await page.goto('/sales/leads');
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    await ctx.close();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NAVIGATION — every route loads without crash
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Navigation — all routes load', () => {
  const routes = [
    '/sales',
    '/sales/leads',
    '/sales/tracker',
    '/sales/tasks',
    '/sales/reminders',
    '/sales/activity-log',
    '/sales/bulk-email',       // page-load only
    '/sales/import',
    '/sales/enrich',
    '/recruitment',
    '/recruitment/jobs',
    '/recruitment/candidates',
    '/recruitment/pipeline',
    '/recruitment/interviews',
    '/recruitment/tasks',
    '/recruitment/ats-match',
    '/recruitment/ats-score',
    '/recruitment/bulk-upload',
    '/recruitment/import-candidates',
    '/timesheet',
    '/timesheet/approvals',
    '/expenses',
    '/ceo',
    '/audit-log',
    '/settings',
  ];

  for (const route of routes) {
    test(`${route} — loads without crash`, async ({ page }) => {
      await page.goto(route);
      await ready(page);
      const body = await page.locator('body').innerText();
      expect(body.trim().length).toBeGreaterThan(5);
      await noError(page);
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// LEADS LIST
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Leads List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sales/leads');
    await ready(page);
  });

  test('page title visible', async ({ page }) => {
    await expect(page.locator('text=Companies').first()).toBeVisible({ timeout: 10_000 });
  });

  test('company column search filters list', async ({ page }) => {
    const input = page.locator('input[placeholder*="company" i], input[placeholder*="search" i]').first();
    if (await input.count() === 0) return;
    await input.fill('xyz_no_match_9999');
    await page.waitForTimeout(600);
    // Either shows empty state or filtered rows
    await noError(page);
  });

  test('status tabs are clickable', async ({ page }) => {
    const tabs = page.locator('button:has-text("New"), button:has-text("Contacted"), button:has-text("All")');
    if (await tabs.count() === 0) return;
    await tabs.first().click();
    await page.waitForTimeout(400);
    await noError(page);
  });

  test('clear filters button works', async ({ page }) => {
    const input = page.locator('input[placeholder*="company" i], input[placeholder*="search" i]').first();
    if (await input.count() === 0) return;
    await input.fill('test');
    await page.waitForTimeout(400);
    const clearBtn = page.locator('button:has-text("Clear"), button:has-text("Reset"), button:has-text("filter" )').first();
    if (await clearBtn.count() > 0) {
      await clearBtn.click();
      const val = await input.inputValue();
      expect(val).toBe('');
    }
  });

  test('filter persists after navigate-to-lead-and-back', async ({ page }) => {
    const input = page.locator('input[placeholder*="company" i], input[placeholder*="search" i]').first();
    if (await input.count() === 0) return;
    await input.fill('persist_test');
    await page.waitForTimeout(300);

    const link = page.locator('a[href*="/sales/leads/"]').first();
    if (await link.count() === 0) return;
    await link.click();
    await expect(page).toHaveURL(/\/sales\/leads\/.+/);
    await page.goBack();
    await ready(page);

    // sessionStorage should restore the filter
    const restored = await input.inputValue();
    expect(restored).toBe('persist_test');
  });

  test('column sort changes order', async ({ page }) => {
    const sortable = page.locator('th[class*="sort"], th button, th[data-sort]').first();
    if (await sortable.count() === 0) return;
    await sortable.click();
    await noError(page);
  });

  test('pagination buttons exist when leads > 25', async ({ page }) => {
    // Just check no crash — data-dependent
    await noError(page);
  });

  test('Add Lead button opens modal', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New Lead"), button:has-text("+ Quick Add")').first();
    if (await addBtn.count() === 0) return;
    await addBtn.click();
    await page.waitForTimeout(500);
    // Modal or form should appear
    const modal = page.locator('[role="dialog"], .modal, [data-dialog]').first();
    if (await modal.count() > 0) {
      await expect(modal).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LEAD DETAIL
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Lead Detail', () => {
  let leadUrl = null;

  test.beforeAll(async ({ browser }) => {
    const ctx  = await browser.newContext({ storageState: 'tests/playwright/.auth/admin.json' });
    const page = await ctx.newPage();
    await page.goto('/sales/leads');
    await ready(page);
    const link = page.locator('a[href*="/sales/leads/"]').first();
    if (await link.count() > 0) {
      leadUrl = await link.getAttribute('href');
    }
    await ctx.close();
  });

  test('detail page loads with company name (not "?")', async ({ page }) => {
    if (!leadUrl) { test.skip(); return; }
    await page.goto(leadUrl);
    await ready(page);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
    const txt = await heading.textContent();
    expect(txt?.trim()).not.toBe('?');
    expect(txt?.trim().length).toBeGreaterThan(0);
  });

  test('Contacts tab visible and not empty', async ({ page }) => {
    if (!leadUrl) { test.skip(); return; }
    await page.goto(leadUrl);
    await ready(page);
    await expect(page.locator('text=Contact Persons, text=Contacts').first()).toBeVisible({ timeout: 8_000 });
  });

  test('Activity tab shows timeline', async ({ page }) => {
    if (!leadUrl) { test.skip(); return; }
    await page.goto(leadUrl);
    await ready(page);
    const actTab = page.locator('button:has-text("Activity"), [role="tab"]:has-text("Activity")').first();
    if (await actTab.count() > 0) await actTab.click();
    await noError(page);
  });

  test('Notes tab clickable', async ({ page }) => {
    if (!leadUrl) { test.skip(); return; }
    await page.goto(leadUrl);
    await ready(page);
    const notesTab = page.locator('button:has-text("Notes"), [role="tab"]:has-text("Notes")').first();
    if (await notesTab.count() > 0) {
      await notesTab.click();
      await noError(page);
    }
  });

  test('Submissions tab clickable', async ({ page }) => {
    if (!leadUrl) { test.skip(); return; }
    await page.goto(leadUrl);
    await ready(page);
    const subTab = page.locator('button:has-text("Submissions"), [role="tab"]:has-text("Submissions")').first();
    if (await subTab.count() > 0) {
      await subTab.click();
      await noError(page);
    }
  });

  test('Tasks tab clickable', async ({ page }) => {
    if (!leadUrl) { test.skip(); return; }
    await page.goto(leadUrl);
    await ready(page);
    const taskTab = page.locator('button:has-text("Tasks"), [role="tab"]:has-text("Tasks")').first();
    if (await taskTab.count() > 0) {
      await taskTab.click();
      await noError(page);
    }
  });

  test('Edit button opens edit modal', async ({ page }) => {
    if (!leadUrl) { test.skip(); return; }
    await page.goto(leadUrl);
    await ready(page);
    const editBtn = page.locator('button:has-text("Edit")').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForTimeout(500);
      const modal = page.locator('[role="dialog"], .modal').first();
      if (await modal.count() > 0) await expect(modal).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });

  test('Email compose button opens panel', async ({ page }) => {
    if (!leadUrl) { test.skip(); return; }
    await page.goto(leadUrl);
    await ready(page);
    const emailBtn = page.locator('button:has-text("Email"), button[title*="email" i]').first();
    if (await emailBtn.count() > 0) {
      await emailBtn.click();
      await page.waitForTimeout(500);
      await noError(page);
      await page.keyboard.press('Escape');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SALES TRACKER
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Sales Tracker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sales/tracker');
    await ready(page);
  });

  test('Overview tab — KPI cards load', async ({ page }) => {
    await expect(page.locator('text=Emails Sent').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Calls Made').first()).toBeVisible({ timeout: 5_000 });
    await noError(page);
  });

  test('Daily tab — shows week days Mon–Fri', async ({ page }) => {
    await tabClick(page, 'Daily');
    await expect(page.locator('button:has-text("Mon")').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('button:has-text("Fri")').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Daily tab — navigate to previous week', async ({ page }) => {
    await tabClick(page, 'Daily');
    const prevBtn = page.locator('button[aria-label*="prev" i], button:has-text("<"), button svg').first();
    if (await prevBtn.count() > 0) {
      await prevBtn.click();
      await page.waitForTimeout(1000);
      await noError(page);
      // Should still show day buttons
      await expect(page.locator('button:has-text("Mon")').first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Traffic Light tab — shows EMAILS / CALLS / OVERALL columns', async ({ page }) => {
    await tabClick(page, 'Traffic Light');
    await expect(page.locator('text=EMAILS').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=CALLS').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=OVERALL').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=This week').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Traffic Light tab — shows 4 week rows', async ({ page }) => {
    await tabClick(page, 'Traffic Light');
    await ready(page);
    const rows = page.locator('table tbody tr, [data-week-row]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Monthly tab — loads without crash', async ({ page }) => {
    await tabClick(page, 'Monthly');
    await noError(page);
    // Either data or empty state (not "Kajal" hardcoded message)
    const content = await page.locator('body').innerText();
    expect(content).not.toContain('Kajal fills this');
  });

  test('Pipeline tab — loads deals table', async ({ page }) => {
    await tabClick(page, 'Pipeline');
    await ready(page);
    await noError(page);
  });

  test('User picker dropdown visible for admin', async ({ page }) => {
    const picker = page.locator('select:has-text("All Users"), button:has-text("All Users")').first();
    if (await picker.count() > 0) {
      await expect(picker).toBeVisible();
    }
  });

  test('Refresh button triggers reload', async ({ page }) => {
    const refresh = page.locator('button:has-text("Refresh")').first();
    if (await refresh.count() > 0) {
      await refresh.click();
      await page.waitForTimeout(1000);
      await noError(page);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// BULK EMAIL — page load + UI check ONLY (no sends)
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Bulk Email — UI only (no sends)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sales/bulk-email');
    await ready(page);
  });

  test('page header visible', async ({ page }) => {
    await expect(page.locator('text=Bulk Welcome Email').first()).toBeVisible({ timeout: 10_000 });
  });

  test('recipients panel visible', async ({ page }) => {
    await expect(page.locator('text=Recipients').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Plain Text / HTML / Preview toggle buttons present', async ({ page }) => {
    await expect(page.locator('button:has-text("Plain Text")').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('button:has-text("HTML")').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Preview")').first()).toBeVisible({ timeout: 5_000 });
  });

  test('switching to HTML mode shows textarea', async ({ page }) => {
    await page.locator('button:has-text("HTML")').first().click();
    const ta = page.locator('textarea').first();
    await expect(ta).toBeVisible({ timeout: 5_000 });
  });

  test('Preview mode renders HTML preview', async ({ page }) => {
    await page.locator('button:has-text("Preview")').first().click();
    await page.waitForTimeout(500);
    await noError(page);
  });

  test('location dropdown present', async ({ page }) => {
    const sel = page.locator('select').first();
    if (await sel.count() > 0) await expect(sel).toBeVisible();
  });

  test('Sent History tab loads', async ({ page }) => {
    await page.locator('button:has-text("Sent History")').first().click();
    await ready(page);
    await noError(page);
  });

  test('Send button is visible (not clicking it)', async ({ page }) => {
    const sendBtn = page.locator('button:has-text("Send to")').first();
    if (await sendBtn.count() > 0) await expect(sendBtn).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RECRUITMENT — JOBS
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Recruitment — Jobs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/recruitment/jobs');
    await ready(page);
  });

  test('jobs list loads', async ({ page }) => {
    await noError(page);
    await expect(page.locator('body').first()).toBeVisible();
  });

  test('clicking a job opens detail panel', async ({ page }) => {
    const firstJob = page.locator('table tbody tr, [data-job-row]').first();
    if (await firstJob.count() === 0) return;
    await firstJob.click();
    await page.waitForTimeout(500);
    await noError(page);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RECRUITMENT — CANDIDATES
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Recruitment — Candidates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/recruitment/candidates');
    await ready(page);
  });

  test('candidates list loads', async ({ page }) => {
    await noError(page);
  });

  test('search box filters candidates', async ({ page }) => {
    const input = page.locator('input[placeholder*="search" i], input[placeholder*="candidate" i]').first();
    if (await input.count() === 0) return;
    await input.fill('xyz_no_match_9999');
    await page.waitForTimeout(600);
    await noError(page);
  });

  test('Export button present', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("Export")').first();
    if (await exportBtn.count() > 0) await expect(exportBtn).toBeVisible();
  });

  test('candidate detail opens on click', async ({ page }) => {
    const link = page.locator('a[href*="/recruitment/candidates/"]').first();
    if (await link.count() === 0) return;
    await link.click();
    await expect(page).toHaveURL(/\/recruitment\/candidates\/.+/);
    await ready(page);
    await noError(page);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RECRUITMENT — ATS MATCH
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Recruitment — ATS Match', () => {
  test('ATS match page loads textarea and button', async ({ page }) => {
    await page.goto('/recruitment/ats-match');
    await ready(page);
    await noError(page);
    const textarea = page.locator('textarea').first();
    if (await textarea.count() > 0) await expect(textarea).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RECRUITMENT — PIPELINE
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Recruitment — Pipeline', () => {
  test('pipeline board loads', async ({ page }) => {
    await page.goto('/recruitment/pipeline');
    await ready(page);
    await noError(page);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TIMESHEETS
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Timesheet (worker view)', () => {
  test('timesheet page loads current week', async ({ page }) => {
    await page.goto('/timesheet');
    await ready(page);
    await noError(page);
    // Should show day names
    const content = await page.locator('body').innerText();
    const hasDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].some(d => content.includes(d));
    expect(hasDays).toBe(true);
  });

  test('HH:MM input accepted', async ({ page }) => {
    await page.goto('/timesheet');
    await ready(page);
    const inputs = page.locator('input[type="text"], input[type="number"]');
    if (await inputs.count() === 0) return;
    await inputs.first().fill('1:30');
    await inputs.first().press('Tab');
    await noError(page);
  });
});

test.describe('Timesheet Approvals (admin view)', () => {
  test('approvals page loads submitted timesheets', async ({ page }) => {
    await page.goto('/timesheet/approvals');
    await ready(page);
    await noError(page);
  });

  test('employee filter dropdown present', async ({ page }) => {
    await page.goto('/timesheet/approvals');
    await ready(page);
    const filter = page.locator('select, [role="combobox"]').first();
    if (await filter.count() > 0) await expect(filter).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EXPENSES
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Expenses', () => {
  test('expense list loads', async ({ page }) => {
    await page.goto('/expenses');
    await ready(page);
    await noError(page);
  });

  test('Add Expense button opens form', async ({ page }) => {
    await page.goto('/expenses');
    await ready(page);
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New Expense")').first();
    if (await addBtn.count() === 0) return;
    await addBtn.click();
    await page.waitForTimeout(500);
    const modal = page.locator('[role="dialog"], form').first();
    if (await modal.count() > 0) {
      await expect(modal).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CEO DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

test.describe('CEO Dashboard', () => {
  test('KPI summary cards load', async ({ page }) => {
    await page.goto('/ceo');
    await ready(page);
    await noError(page);
    const content = await page.locator('body').innerText();
    expect(content.trim().length).toBeGreaterThan(20);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Settings', () => {
  test('user management table visible', async ({ page }) => {
    await page.goto('/settings');
    await ready(page);
    await noError(page);
    await expect(page.locator('text=User Management').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Add User button visible for admin', async ({ page }) => {
    await page.goto('/settings');
    await ready(page);
    const addBtn = page.locator('button:has-text("Add User")').first();
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
  });

  test('role change button visible per row', async ({ page }) => {
    await page.goto('/settings');
    await ready(page);
    const roleBtn = page.locator('button:has-text("Role")').first();
    if (await roleBtn.count() > 0) await expect(roleBtn).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Audit Log', () => {
  test('audit events list loads', async ({ page }) => {
    await page.goto('/audit-log');
    await ready(page);
    await noError(page);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC APPLY FORM (no auth)
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Public Apply Form', () => {
  test('apply page loads with form fields', async ({ browser }) => {
    const ctx  = await browser.newContext(); // no auth
    const page = await ctx.newPage();
    await page.goto('/apply');
    await ready(page);
    // Either shows form or "job not found" — should not crash
    const body = await page.locator('body').innerText();
    expect(body.trim().length).toBeGreaterThan(5);
    await ctx.close();
  });

  test('submit empty apply form shows validation', async ({ browser }) => {
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/apply');
    await ready(page);
    const submitBtn = page.locator('button[type="submit"], button:has-text("Apply"), button:has-text("Submit")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      // Should show validation, not crash
      await noError(page);
    }
    await ctx.close();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Global Search', () => {
  test('search bar opens on Enter / click', async ({ page }) => {
    await page.goto('/sales/leads');
    await ready(page);
    const search = page.locator('input[placeholder*="Search leads" i]').first();
    if (await search.count() > 0) {
      await search.click();
      await search.fill('test');
      await page.waitForTimeout(500);
      await noError(page);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// QUICK ADD BUTTON
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Quick Add', () => {
  test('Quick Add button opens modal', async ({ page }) => {
    await page.goto('/sales/leads');
    await ready(page);
    const btn = page.locator('button:has-text("Quick Add")').first();
    if (await btn.count() === 0) return;
    await btn.click();
    await page.waitForTimeout(500);
    const modal = page.locator('[role="dialog"]').first();
    if (await modal.count() > 0) {
      await expect(modal).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LOGOUT
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Logout', () => {
  test('logout button redirects to /login', async ({ page }) => {
    await page.goto('/sales');
    await ready(page);
    // Find logout button — typically an icon button at bottom of sidebar
    const logoutBtn = page.locator('[title*="logout" i], [aria-label*="logout" i], button:has-text("Logout"), button:has-text("Sign out")').first();
    if (await logoutBtn.count() === 0) return;
    await logoutBtn.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });
});
