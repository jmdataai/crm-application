"""
Nexus CRM — Complete Backend API Test Suite
============================================
Tests every single endpoint in server.py.

Usage:
    python backend_test.py
    python backend_test.py --url https://freddy-jmdataai-nexus-crm-backend.hf.space

Requires:
    pip install requests

Environment:
    Set ADMIN_EMAIL / ADMIN_PASSWORD env vars, or edit DEFAULTS below.
    The test account must have 'admin' role.
"""

import requests
import sys
import json
import os
import time
from datetime import datetime, timedelta, date

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL  = sys.argv[1] if len(sys.argv) > 1 else \
            "https://freddy-jmdataai-nexus-crm-backend.hf.space"
EMAIL     = os.environ.get("ADMIN_EMAIL",    "ravi@jmdatatalent.com")
PASSWORD  = os.environ.get("ADMIN_PASSWORD", "your_password_here")

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN = "\033[92m"; RED = "\033[91m"; YELLOW = "\033[93m"
CYAN  = "\033[96m"; BOLD = "\033[1m"; RESET = "\033[0m"


class CRMTester:
    def __init__(self):
        self.session      = requests.Session()
        self.base         = BASE_URL.rstrip("/") + "/api"
        self.passed       = 0
        self.failed       = 0
        self.skipped      = 0
        self.errors       = []
        # IDs created during this run — used for subsequent tests and cleanup
        self.lead_id      = None
        self.job_id       = None
        self.candidate_id = None
        self.task_id      = None
        self.reminder_id  = None
        self.interview_id = None
        self.expense_id   = None
        self.deal_id      = None
        self.timesheet_id = None
        self.submission_id = None

    # ── Core helpers ─────────────────────────────────────────────────────────

    def req(self, method, path, expected=200, json=None, data=None,
            files=None, params=None, label=None):
        url  = f"{self.base}/{path.lstrip('/')}"
        name = label or f"{method.upper()} /{path}"
        try:
            r = self.session.request(
                method, url, json=json, data=data,
                files=files, params=params, timeout=30
            )
        except Exception as e:
            self._fail(name, f"Network error: {e}")
            return None

        ok = (r.status_code == expected) if isinstance(expected, int) else \
             (r.status_code in expected)

        if ok:
            self._pass(name, r.status_code)
            try:    return r.json()
            except: return {}
        else:
            body = ""
            try:    body = r.json().get("detail", r.text[:120])
            except: body = r.text[:120]
            self._fail(name, f"Expected {expected}, got {r.status_code} — {body}")
            return None

    def _pass(self, name, code):
        self.passed += 1
        print(f"  {GREEN}✅ {name}{RESET}  [{code}]")

    def _fail(self, name, reason):
        self.failed += 1
        self.errors.append(f"{name}: {reason}")
        print(f"  {RED}❌ {name}{RESET}  {reason}")

    def _skip(self, name, reason="no prerequisite ID"):
        self.skipped += 1
        print(f"  {YELLOW}⏭  {name}{RESET}  ({reason})")

    def section(self, title):
        print(f"\n{BOLD}{CYAN}{'─'*55}")
        print(f"  {title}")
        print(f"{'─'*55}{RESET}")

    # ── AUTH ──────────────────────────────────────────────────────────────────

    def test_auth(self):
        self.section("AUTH")

        # Wrong credentials → 401
        self.req("POST", "auth/login",
                 json={"email": "wrong@test.com", "password": "wrong"},
                 expected=401, label="POST /auth/login — wrong credentials → 401")

        # Missing fields → 422
        self.req("POST", "auth/login",
                 json={"email": "only@email.com"},
                 expected=422, label="POST /auth/login — missing password → 422")

        # GET /auth/me without token → 401
        self.req("GET", "auth/me", expected=401,
                 label="GET /auth/me — unauthenticated → 401")

        # Correct login
        res = self.req("POST", "auth/login",
                       json={"email": EMAIL, "password": PASSWORD},
                       label="POST /auth/login — correct credentials → 200")
        if not res:
            print(f"\n{RED}❌ Login failed — all subsequent tests will fail.{RESET}")
            return False

        # GET /auth/me — authenticated
        self.req("GET", "auth/me", label="GET /auth/me — authenticated → 200")

        return True

    # ── USERS ─────────────────────────────────────────────────────────────────

    def test_users(self):
        self.section("USERS")
        res = self.req("GET", "users", label="GET /users")
        if res:
            assert isinstance(res, list), "Expected list"

    # ── SALES DASHBOARD ───────────────────────────────────────────────────────

    def test_sales_dashboard(self):
        self.section("SALES DASHBOARD")
        res = self.req("GET", "dashboard/sales", label="GET /dashboard/sales")
        if res:
            for key in ("total_leads", "status_breakdown"):
                assert key in res, f"Missing key: {key}"

    # ── LEADS ─────────────────────────────────────────────────────────────────

    def test_leads(self):
        self.section("LEADS")

        # List
        res = self.req("GET", "leads", label="GET /leads")
        if res:
            assert isinstance(res, list)

        # List with filters
        self.req("GET", "leads", params={"limit": 5, "status": "new"},
                 label="GET /leads — filtered by status")
        self.req("GET", "leads", params={"q": "test"},
                 label="GET /leads — search query")

        # Create
        payload = {
            "company_name":       "Playwright Test Corp",
            "company_type":       "client",
            "hq_location":        "Ireland",
            "status":             "new",
            "contact_person_1_name":  "Test Contact",
            "contact_person_1_email": f"test.pw.{int(time.time())}@example.com",
        }
        res = self.req("POST", "leads", json=payload, label="POST /leads — create")
        if res:
            self.lead_id = res.get("id") or (res.get("data") or [{}])[0].get("id")

        if not self.lead_id:
            self._skip("GET /leads/:id — no lead created")
            return

        # Get by ID
        self.req("GET", f"leads/{self.lead_id}", label="GET /leads/:id")

        # Get status history
        self.req("GET", f"leads/{self.lead_id}/status-history",
                 expected=[200, 404], label="GET /leads/:id/status-history")

        # Update
        self.req("PUT", f"leads/{self.lead_id}",
                 json={"company_name": "Playwright Test Corp UPDATED", "status": "contacted"},
                 label="PUT /leads/:id — update")

        # Activities
        act = self.req("POST", "activities",
                       json={"lead_id": self.lead_id, "activity_type": "call",
                             "description": "Playwright test call"},
                       label="POST /activities")
        self.req("GET", f"activities?lead_id={self.lead_id}", label="GET /activities")

        # Tasks for lead
        task_res = self.req("POST", "tasks",
                            json={"title": "PW Test Task", "lead_id": self.lead_id,
                                  "due_date": (date.today() + timedelta(days=7)).isoformat(),
                                  "priority": "medium"},
                            label="POST /tasks — for lead")
        if task_res:
            self.task_id = task_res.get("id") or \
                           (task_res.get("data") or [{}])[0].get("id")

        # Reminders
        rem_res = self.req("POST", "reminders",
                           json={"lead_id": self.lead_id, "title": "PW Test Reminder",
                                 "remind_at": (datetime.utcnow() + timedelta(days=1)).isoformat()},
                           label="POST /reminders — for lead")
        if rem_res:
            self.reminder_id = rem_res.get("id") or \
                               (rem_res.get("data") or [{}])[0].get("id")

    # ── TASKS ─────────────────────────────────────────────────────────────────

    def test_tasks(self):
        self.section("TASKS")
        self.req("GET", "tasks", label="GET /tasks")
        self.req("GET", "tasks", params={"status": "pending"}, label="GET /tasks — filtered")

        if self.task_id:
            self.req("PUT", f"tasks/{self.task_id}",
                     json={"status": "done"}, label="PUT /tasks/:id — mark done")
            self.req("DELETE", f"tasks/{self.task_id}",
                     expected=[200, 204], label="DELETE /tasks/:id")
            self.task_id = None
        else:
            self._skip("PUT /tasks/:id")
            self._skip("DELETE /tasks/:id")

    # ── REMINDERS ─────────────────────────────────────────────────────────────

    def test_reminders(self):
        self.section("REMINDERS")
        self.req("GET", "reminders", label="GET /reminders")

        if self.reminder_id:
            self.req("PUT", f"reminders/{self.reminder_id}/dismiss",
                     label="PUT /reminders/:id/dismiss")
        else:
            self._skip("PUT /reminders/:id/dismiss")

    # ── RECRUITMENT ───────────────────────────────────────────────────────────

    def test_recruitment_dashboard(self):
        self.section("RECRUITMENT DASHBOARD")
        self.req("GET", "dashboard/recruitment", label="GET /dashboard/recruitment")

    def test_jobs(self):
        self.section("JOBS")
        self.req("GET", "jobs", label="GET /jobs")
        self.req("GET", "public/jobs", label="GET /public/jobs — public endpoint (no auth)")

        payload = {
            "title":           "Playwright Test Engineer",
            "location":        "Dublin, Ireland",
            "employment_type": "Contract",
            "status":          "active",
            "description":     "E2E test job — safe to delete",
            "skills":          ["Python", "Playwright"],
        }
        res = self.req("POST", "jobs", json=payload, label="POST /jobs — create")
        if res:
            self.job_id = res.get("id") or (res.get("data") or [{}])[0].get("id")

        if not self.job_id:
            self._skip("GET/PUT/DELETE /jobs/:id"); return

        self.req("GET",  f"jobs/{self.job_id}", label="GET /jobs/:id")
        self.req("PUT",  f"jobs/{self.job_id}",
                 json={"title": "Playwright Test Engineer UPDATED"},
                 label="PUT /jobs/:id")
        self.req("GET", f"public/jobs/{self.job_id}",
                 expected=[200, 404], label="GET /public/jobs/:id")

    def test_candidates(self):
        self.section("CANDIDATES")
        self.req("GET", "candidates", label="GET /candidates")
        self.req("GET", "candidates/pipeline", label="GET /candidates/pipeline")

        payload = {
            "full_name":    "Playwright Test Candidate",
            "email":        f"pw.candidate.{int(time.time())}@example.com",
            "phone":        "+353123456789",
            "skills":       ["Python", "React"],
            "current_role": "QA Engineer",
            "work_mode":    ["remote"],
        }
        if self.job_id:
            payload["job_id"] = self.job_id

        res = self.req("POST", "candidates", json=payload, label="POST /candidates — create")
        if res:
            self.candidate_id = res.get("id") or \
                                (res.get("data") or [{}])[0].get("id")

        if not self.candidate_id:
            self._skip("GET/PUT/DELETE /candidates/:id"); return

        self.req("GET", f"candidates/{self.candidate_id}", label="GET /candidates/:id")
        self.req("PUT", f"candidates/{self.candidate_id}",
                 json={"current_role": "Senior QA Engineer"},
                 label="PUT /candidates/:id")

        # Masked resume download (no resume uploaded, expect 404 or 400)
        self.req("GET", f"candidates/{self.candidate_id}/resume/masked",
                 expected=[200, 400, 404],
                 label="GET /candidates/:id/resume/masked")

    def test_submissions(self):
        self.section("SUBMISSIONS")
        self.req("GET", "submissions", label="GET /submissions")

        if self.candidate_id and self.lead_id:
            res = self.req("POST", "submissions",
                           json={"candidate_id": self.candidate_id,
                                 "lead_id": self.lead_id,
                                 "status": "submitted"},
                           label="POST /submissions — create")
            if res:
                self.submission_id = res.get("id") or \
                                     (res.get("data") or [{}])[0].get("id")
        else:
            self._skip("POST /submissions — need lead_id + candidate_id")

        if self.submission_id:
            self.req("PUT", f"submissions/{self.submission_id}",
                     json={"status": "interviewing"},
                     label="PUT /submissions/:id")
        else:
            self._skip("PUT /submissions/:id")

    def test_interviews(self):
        self.section("INTERVIEWS")
        self.req("GET", "interviews", label="GET /interviews")

        if self.candidate_id and self.job_id:
            res = self.req("POST", "interviews",
                           json={"candidate_id": self.candidate_id,
                                 "job_id":       self.job_id,
                                 "scheduled_at": (datetime.utcnow() + timedelta(days=3)).isoformat(),
                                 "type":         "technical",
                                 "status":       "scheduled"},
                           label="POST /interviews — create")
            if res:
                self.interview_id = res.get("id") or \
                                    (res.get("data") or [{}])[0].get("id")
        else:
            self._skip("POST /interviews — need candidate_id + job_id")

        if self.interview_id:
            self.req("PUT", f"interviews/{self.interview_id}",
                     json={"status": "completed", "outcome": "pass"},
                     label="PUT /interviews/:id")
        else:
            self._skip("PUT /interviews/:id")

    # ── SALES TRACKER ─────────────────────────────────────────────────────────

    def test_sales_tracker(self):
        self.section("SALES TRACKER")

        # Dashboard — various week offsets
        self.req("GET", "sales/tracker/dashboard",
                 label="GET /sales/tracker/dashboard — current week")
        self.req("GET", "sales/tracker/dashboard",
                 params={"week_offset": -1},
                 label="GET /sales/tracker/dashboard — last week")
        self.req("GET", "sales/tracker/dashboard",
                 params={"week_offset": -3},
                 label="GET /sales/tracker/dashboard — 3 weeks ago")

        # Users list (admin only)
        self.req("GET", "sales/tracker/users", label="GET /sales/tracker/users")

        # Log daily activity
        today = date.today().isoformat()
        log_res = self.req("POST", "sales/tracker/log",
                           json={
                               "log_date":         today,
                               "emails_sent":      5,
                               "linkedin_sent":    3,
                               "calls_made":       2,
                               "replies_received": 1,
                               "meetings_booked":  0,
                               "meetings_done":    0,
                               "proposals_sent":   0,
                               "followups_done":   2,
                               "new_leads_added":  1,
                               "hours_worked":     7.5,
                               "mood":             "good",
                               "biggest_win":      "Playwright test run",
                               "biggest_blocker":  "None",
                           },
                           label="POST /sales/tracker/log")

        # Get logs
        self.req("GET", "sales/tracker/log", label="GET /sales/tracker/log")

        # Pipeline deals
        deal_res = self.req("POST", "sales/tracker/pipeline",
                            json={
                                "company":     "PW Test Deal Co",
                                "stage":       "proposal",
                                "value":       5000,
                                "probability": 60,
                                "close_date":  (date.today() + timedelta(days=30)).isoformat(),
                            },
                            label="POST /sales/tracker/pipeline — create deal")
        if deal_res:
            self.deal_id = deal_res.get("id") or \
                           (deal_res.get("data") or [{}])[0].get("id")

        self.req("GET", "sales/tracker/pipeline", label="GET /sales/tracker/pipeline")

        if self.deal_id:
            self.req("PUT", f"sales/tracker/pipeline/{self.deal_id}",
                     json={"stage": "closed_won"},
                     label="PUT /sales/tracker/pipeline/:id")
        else:
            self._skip("PUT /sales/tracker/pipeline/:id")

        # Monthly rollup
        self.req("GET", "sales/tracker/monthly-rollup",
                 label="GET /sales/tracker/monthly-rollup")

        # Weekly review
        self.req("GET", "sales/tracker/weekly-review",
                 label="GET /sales/tracker/weekly-review")

    # ── TIMESHEETS ────────────────────────────────────────────────────────────

    def test_timesheets(self):
        self.section("TIMESHEETS")

        self.req("GET", "timesheets/me", label="GET /timesheets/me")
        self.req("GET", "timesheets/me/current", label="GET /timesheets/me/current")
        self.req("GET", "timesheets/all", label="GET /timesheets/all")
        self.req("GET", "timesheet/yearly-summary",
                 params={"year": date.today().year},
                 label="GET /timesheet/yearly-summary")

        # Get current timesheet ID
        res = self.req("GET", "timesheets/me/current",
                       label="GET /timesheets/me/current (for ID)")
        if res and isinstance(res, dict):
            self.timesheet_id = res.get("id")

        if self.timesheet_id:
            # Update entries
            entries = {
                "Monday": 8, "Tuesday": 8, "Wednesday": 7.5,
                "Thursday": 8, "Friday": 7
            }
            self.req("PUT", f"timesheets/{self.timesheet_id}/entries",
                     json={"entries": entries},
                     label="PUT /timesheets/:id/entries")

            self.req("GET", f"timesheets/{self.timesheet_id}",
                     label="GET /timesheets/:id")
        else:
            self._skip("PUT /timesheets/:id/entries")
            self._skip("GET /timesheets/:id")

    # ── EXPENSES ──────────────────────────────────────────────────────────────

    def test_expenses(self):
        self.section("EXPENSES")

        self.req("GET", "expenses", label="GET /expenses")
        self.req("GET", "expenses/summary", label="GET /expenses/summary")

        res = self.req("POST", "expenses",
                       json={
                           "date":        date.today().isoformat(),
                           "category":    "travel",
                           "description": "Playwright test expense",
                           "amount_eur":  50.00,
                           "currency":    "EUR",
                       },
                       label="POST /expenses — create")
        if res:
            self.expense_id = res.get("id") or \
                              (res.get("data") or [{}])[0].get("id")

        if self.expense_id:
            self.req("PUT", f"expenses/{self.expense_id}",
                     json={"description": "Playwright test expense UPDATED"},
                     expected=[200, 404],
                     label="PUT /expenses/:id")
        else:
            self._skip("PUT/DELETE /expenses/:id")

    # ── BULK EMAIL ────────────────────────────────────────────────────────────

    def test_bulk_email(self):
        self.section("BULK EMAIL (read-only)")
        # Only test read endpoints — NEVER call send (would email real contacts)
        self.req("GET", "bulk-email/recipients", label="GET /bulk-email/recipients")
        self.req("GET", "bulk-email/sent",       label="GET /bulk-email/sent")

    # ── CEO DASHBOARD ─────────────────────────────────────────────────────────

    def test_ceo_dashboard(self):
        self.section("CEO DASHBOARD")
        self.req("GET", "dashboard/ceo", label="GET /dashboard/ceo")

    # ── AUDIT LOG ─────────────────────────────────────────────────────────────

    def test_audit_log(self):
        self.section("AUDIT LOG")
        self.req("GET", "audit-logs", label="GET /audit-logs")
        self.req("GET", "audit-logs", params={"limit": 10},
                 label="GET /audit-logs — with limit")

    # ── TUTORIALS ─────────────────────────────────────────────────────────────

    def test_tutorials(self):
        self.section("TUTORIALS")
        self.req("GET", "tutorials", label="GET /tutorials")

    # ── PUBLIC (no auth) ──────────────────────────────────────────────────────

    def test_public_endpoints(self):
        self.section("PUBLIC ENDPOINTS (no auth required)")

        # Temporarily remove auth cookie
        cookies_backup = dict(self.session.cookies)
        self.session.cookies.clear()

        self.req("GET", "public/jobs", label="GET /public/jobs — no auth")

        if self.job_id:
            self.req("GET", f"public/jobs/{self.job_id}",
                     expected=[200, 404],
                     label="GET /public/jobs/:id — no auth")

        # Restore auth
        self.session.cookies.update(cookies_backup)

    # ── CLEANUP ───────────────────────────────────────────────────────────────

    def cleanup(self):
        self.section("CLEANUP (delete test data)")

        if self.submission_id:
            self.req("DELETE", f"submissions/{self.submission_id}",
                     expected=[200, 204, 404], label="DELETE /submissions/:id")

        if self.interview_id:
            self.req("DELETE", f"interviews/{self.interview_id}",
                     expected=[200, 204, 404], label="DELETE /interviews/:id")

        if self.candidate_id:
            self.req("DELETE", f"candidates/{self.candidate_id}",
                     expected=[200, 204, 404], label="DELETE /candidates/:id")

        if self.job_id:
            self.req("DELETE", f"jobs/{self.job_id}",
                     expected=[200, 204, 404], label="DELETE /jobs/:id")

        if self.lead_id:
            self.req("DELETE", f"leads/{self.lead_id}",
                     expected=[200, 204, 404], label="DELETE /leads/:id")

        if self.expense_id:
            self.req("DELETE", f"expenses/{self.expense_id}",
                     expected=[200, 204, 404], label="DELETE /expenses/:id")

        if self.deal_id:
            self.req("DELETE", f"sales/tracker/pipeline/{self.deal_id}",
                     expected=[200, 204, 404], label="DELETE /sales/tracker/pipeline/:id")

    # ── LOGOUT ────────────────────────────────────────────────────────────────

    def test_logout(self):
        self.section("LOGOUT")
        self.req("POST", "auth/logout", label="POST /auth/logout")
        # After logout, /auth/me should return 401
        self.req("GET", "auth/me", expected=401,
                 label="GET /auth/me — after logout → 401")

    # ── RUNNER ────────────────────────────────────────────────────────────────

    def run(self):
        print(f"\n{BOLD}{'='*55}")
        print(f"  Nexus CRM — Full Backend API Test Suite")
        print(f"  {BASE_URL}")
        print(f"{'='*55}{RESET}\n")

        if not self.test_auth():
            self._print_summary(); return

        self.test_users()
        self.test_sales_dashboard()
        self.test_leads()
        self.test_tasks()
        self.test_reminders()
        self.test_recruitment_dashboard()
        self.test_jobs()
        self.test_candidates()
        self.test_submissions()
        self.test_interviews()
        self.test_sales_tracker()
        self.test_timesheets()
        self.test_expenses()
        self.test_bulk_email()
        self.test_ceo_dashboard()
        self.test_audit_log()
        self.test_tutorials()
        self.test_public_endpoints()
        self.cleanup()
        self.test_logout()
        self._print_summary()

    def _print_summary(self):
        total = self.passed + self.failed
        rate  = (self.passed / total * 100) if total else 0
        print(f"\n{BOLD}{'='*55}")
        print(f"  RESULTS")
        print(f"{'='*55}{RESET}")
        print(f"  {GREEN}✅ Passed : {self.passed}{RESET}")
        print(f"  {RED}❌ Failed : {self.failed}{RESET}")
        print(f"  {YELLOW}⏭  Skipped: {self.skipped}{RESET}")
        print(f"  📊 Rate   : {rate:.1f}%")
        if self.errors:
            print(f"\n{RED}Failed tests:{RESET}")
            for e in self.errors:
                print(f"  • {e}")
        print()


if __name__ == "__main__":
    CRMTester().run()
