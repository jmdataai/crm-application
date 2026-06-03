"""
Nexus CRM — Backend API Test Suite
====================================
Tests every endpoint returns the expected HTTP status code.
No structural assertions — only status codes are checked.

Usage:
    python backend/backend_test.py
    python backend/backend_test.py https://your-url.hf.space

Credentials via env vars:
    ADMIN_EMAIL / ADMIN_PASSWORD  (or TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD)
"""

import requests, sys, os, time
from datetime import date, datetime, timedelta

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL = (sys.argv[1] if len(sys.argv) > 1
            else "https://freddy-jmdataai-nexus-crm-backend.hf.space")
EMAIL    = (os.environ.get("ADMIN_EMAIL")
            or os.environ.get("TEST_ADMIN_EMAIL")
            or "ravi@jmdatatalent.com")
PASSWORD = (os.environ.get("ADMIN_PASSWORD")
            or os.environ.get("TEST_ADMIN_PASSWORD")
            or "your_password_here")

G = "\033[92m"; R = "\033[91m"; Y = "\033[93m"; C = "\033[96m"
B = "\033[1m";  E = "\033[0m"


class T:
    def __init__(self):
        self.s = requests.Session()
        self.base = BASE_URL.rstrip("/") + "/api"
        self.ok = self.fail = self.skip = 0
        self.errors = []
        # IDs created during run — used for chained tests and cleanup
        self.lead_id = self.job_id = self.candidate_id = None
        self.task_id = self.reminder_id = self.interview_id = None
        self.expense_id = self.deal_id = self.submission_id = None

    def req(self, method, path, expected=200, label=None, **kw):
        url  = f"{self.base}/{path.lstrip('/')}"
        name = label or f"{method.upper()} /{path}"
        try:
            r = self.s.request(method, url, timeout=30, **kw)
        except Exception as e:
            self._fail(name, f"Network error: {e}"); return None

        exp  = [expected] if isinstance(expected, int) else list(expected)
        body = {}
        try: body = r.json()
        except: pass

        if r.status_code in exp:
            self.ok += 1
            print(f"  {G}✅ {name}{E}  [{r.status_code}]")
            return body
        else:
            detail = body.get("detail", str(body))[:100] if body else r.text[:100]
            self._fail(name, f"expected {exp}, got {r.status_code} — {detail}")
            return None

    def _fail(self, name, reason):
        self.fail += 1
        self.errors.append(f"{name}: {reason}")
        print(f"  {R}❌ {name}{E}  {reason}")

    def _skip(self, name, why="prerequisite missing"):
        self.skip += 1
        print(f"  {Y}⏭  {name}{E}  ({why})")

    def sec(self, title):
        print(f"\n{B}{C}{'─'*52}\n  {title}\n{'─'*52}{E}")

    # ── AUTH ──────────────────────────────────────────────────────────────────

    def auth(self):
        self.sec("AUTH")
        self.req("POST","auth/login", 401, label="POST /auth/login — wrong creds",
                 json={"email":"x@x.com","password":"wrong"})
        self.req("POST","auth/login", 422, label="POST /auth/login — missing password",
                 json={"email":"x@x.com"})
        self.req("GET", "auth/me",    401, label="GET /auth/me — no token")
        r = self.req("POST","auth/login", 200, label="POST /auth/login — correct",
                     json={"email":EMAIL,"password":PASSWORD})
        if not r:
            print(f"\n{R}Login failed — stopping.{E}")
            return False
        self.req("GET","auth/me", 200, label="GET /auth/me — authenticated")
        return True

    # ── USERS ─────────────────────────────────────────────────────────────────

    def users(self):
        self.sec("USERS")
        self.req("GET","users", label="GET /users")

    # ── DASHBOARDS ────────────────────────────────────────────────────────────

    def dashboards(self):
        self.sec("DASHBOARDS")
        self.req("GET","dashboard/sales",       label="GET /dashboard/sales")
        self.req("GET","dashboard/recruitment", label="GET /dashboard/recruitment")
        self.req("GET","dashboard/ceo",         label="GET /dashboard/ceo")

    # ── LEADS ─────────────────────────────────────────────────────────────────

    def leads(self):
        self.sec("LEADS")
        self.req("GET","leads",                     label="GET /leads")
        self.req("GET","leads",params={"limit":5},  label="GET /leads — limit=5")
        self.req("GET","leads",params={"status":"new"}, label="GET /leads — status filter")

        r = self.req("POST","leads", 200, label="POST /leads — create",
                     json={"company":f"PW Test {int(time.time())}",
                           "company_type":"client","hq_location":"Ireland","status":"new"})
        if r:
            self.lead_id = (r.get("id")
                            or (r.get("data") or [{}])[0].get("id"))

        if not self.lead_id:
            for n in ("GET/PUT /leads/:id","POST /activities","POST /tasks","POST /reminders"):
                self._skip(n); return

        self.req("GET", f"leads/{self.lead_id}",   label="GET /leads/:id")
        self.req("PUT", f"leads/{self.lead_id}", [200,204], label="PUT /leads/:id",
                 json={"company_name":"PW Test Updated","status":"contacted"})
        self.req("GET", f"leads/{self.lead_id}/status-history", [200,404],
                 label="GET /leads/:id/status-history")
        self.req("GET", "activities",params={"lead_id":self.lead_id},
                 label="GET /activities")
        self.req("POST","activities", [200,201], label="POST /activities",
                 json={"lead_id":self.lead_id,"activity_type":"call","description":"PW test"})

    # ── TASKS ─────────────────────────────────────────────────────────────────

    def tasks(self):
        self.sec("TASKS")
        if not self.lead_id:
            self._skip("POST /tasks — need lead_id"); return
        r = self.req("POST","tasks",[200,201], label="POST /tasks",
                     json={"title":"PW Task","lead_id":self.lead_id,
                           "due_date":(date.today()+timedelta(days=7)).isoformat(),
                           "priority":"medium"})
        if r: self.task_id = r.get("id") or (r.get("data") or [{}])[0].get("id")

        if self.task_id:
            self.req("GET", f"tasks/{self.task_id}",    [200,404], label="GET /tasks/:id")
            self.req("PUT", f"tasks/{self.task_id}",    [200,204], label="PUT /tasks/:id",
                     json={"priority":"high"})
            self.req("DELETE",f"tasks/{self.task_id}",  [200,204,404], label="DELETE /tasks/:id")
        else:
            self._skip("GET/PUT/DELETE /tasks/:id")

    # ── REMINDERS ─────────────────────────────────────────────────────────────

    def reminders(self):
        self.sec("REMINDERS")
        self.req("GET","reminders", label="GET /reminders")
        if self.reminder_id:
            self.req("PUT",f"reminders/{self.reminder_id}/dismiss",[200,204],
                     label="PUT /reminders/:id/dismiss")
        else:
            self._skip("PUT /reminders/:id/dismiss")

    # ── JOBS ──────────────────────────────────────────────────────────────────

    def jobs(self):
        self.sec("JOBS")
        self.req("GET","jobs",        label="GET /jobs")
        self.req("GET","public/jobs", label="GET /public/jobs — no auth")

        r = self.req("POST","jobs",[200,201], label="POST /jobs — create",
                     json={"title":"PW Test Role","location":"Dublin",
                           "employment_type":"Contract","status":"active",
                           "description":"Test","skills":["Python"]})
        if r: self.job_id = r.get("id") or (r.get("data") or [{}])[0].get("id")

        if not self.job_id:
            self._skip("GET/PUT /jobs/:id"); return

        self.req("GET",f"jobs/{self.job_id}", [200,404], label="GET /jobs/:id")
        self.req("PUT",f"jobs/{self.job_id}", [200,204], label="PUT /jobs/:id",
                 json={"title":"PW Test Role Updated"})

    # ── CANDIDATES ────────────────────────────────────────────────────────────

    def candidates(self):
        self.sec("CANDIDATES")
        self.req("GET","candidates",          label="GET /candidates")
        self.req("GET","candidates/pipeline", label="GET /candidates/pipeline")

        payload = {"full_name":"PW Candidate","skills":["Python"],
                   "email":f"pw.{int(time.time())}@example.com","work_mode":["remote"]}
        if self.job_id: payload["job_id"] = self.job_id

        r = self.req("POST","candidates",[200,201], label="POST /candidates — create",
                     json=payload)
        if r: self.candidate_id = r.get("id") or (r.get("data") or [{}])[0].get("id")

        if not self.candidate_id:
            self._skip("GET/PUT /candidates/:id"); return

        self.req("GET",f"candidates/{self.candidate_id}", label="GET /candidates/:id")
        self.req("PUT",f"candidates/{self.candidate_id}",[200,204],
                 label="PUT /candidates/:id", json={"current_role":"Senior Dev"})
        self.req("GET",f"candidates/{self.candidate_id}/resume/masked",[200,400,404],
                 label="GET /candidates/:id/resume/masked")

    # ── SUBMISSIONS ───────────────────────────────────────────────────────────

    def submissions(self):
        self.sec("SUBMISSIONS")
        self.req("GET","submissions", label="GET /submissions")
        if self.candidate_id and self.lead_id:
            r = self.req("POST","submissions",[200,201], label="POST /submissions",
                         json={"candidate_id":self.candidate_id,
                               "lead_id":self.lead_id,"status":"submitted"})
            if r: self.submission_id = r.get("id") or (r.get("data") or [{}])[0].get("id")
            if self.submission_id:
                self.req("PUT",f"submissions/{self.submission_id}",[200,204],
                         label="PUT /submissions/:id",json={"status":"interviewing"})
            else: self._skip("PUT /submissions/:id")
        else: self._skip("POST/PUT /submissions — need lead + candidate")

    # ── INTERVIEWS ────────────────────────────────────────────────────────────

    def interviews(self):
        self.sec("INTERVIEWS")
        self.req("GET","interviews", label="GET /interviews")
        if self.candidate_id and self.job_id:
            r = self.req("POST","interviews",[200,201], label="POST /interviews",
                         json={"candidate_id":self.candidate_id,"job_id":self.job_id,
                               "scheduled_at":(datetime.utcnow()+timedelta(days=3)).isoformat(),
                               "interview_type":"technical","status":"scheduled"})
            if r: self.interview_id = r.get("id") or (r.get("data") or [{}])[0].get("id")
            if self.interview_id:
                self.req("PUT",f"interviews/{self.interview_id}",[200,204],
                         label="PUT /interviews/:id",json={"status":"completed"})
            else: self._skip("PUT /interviews/:id")
        else: self._skip("POST /interviews — need candidate + job")

    # ── SALES TRACKER ─────────────────────────────────────────────────────────

    def tracker(self):
        self.sec("SALES TRACKER")
        self.req("GET","sales/tracker/dashboard",             label="GET /tracker/dashboard — week 0")
        self.req("GET","sales/tracker/dashboard",params={"week_offset":-1},
                 label="GET /tracker/dashboard — week -1")
        self.req("GET","sales/tracker/dashboard",params={"week_offset":-3},
                 label="GET /tracker/dashboard — week -3")
        self.req("GET","sales/tracker/users",                 label="GET /tracker/users")
        self.req("GET","sales/tracker/log",                   label="GET /tracker/log")
        self.req("POST","sales/tracker/log",[200,201],        label="POST /tracker/log",
                 json={"log_date":date.today().isoformat(),"emails_sent":5,
                       "linkedin_sent":3,"calls_made":2,"replies_received":1,
                       "meetings_booked":0,"meetings_done":0,"proposals_sent":0,
                       "followups_done":2,"new_leads_added":1,"hours_worked":7.5,
                       "mood":3,"biggest_win":"PW test","biggest_blocker":"None"})
        self.req("GET","sales/tracker/pipeline",              label="GET /tracker/pipeline")
        r = self.req("POST","sales/tracker/pipeline",[200,201],label="POST /tracker/pipeline",
                     json={"client_name":"PW Deal Co","stage":"proposal","value":5000,
                           "probability":60,
                           "close_date":(date.today()+timedelta(days=30)).isoformat()})
        if r: self.deal_id = r.get("id") or (r.get("data") or [{}])[0].get("id")
        if self.deal_id:
            self.req("PUT",f"sales/tracker/pipeline/{self.deal_id}",[200,204],
                     label="PUT /tracker/pipeline/:id",json={"stage":"closed_won"})
        else: self._skip("PUT /tracker/pipeline/:id")
        self.req("GET","sales/tracker/monthly-rollup", label="GET /tracker/monthly-rollup")
        self.req("GET","sales/tracker/weekly-review",  [200,404], label="GET /tracker/weekly-review")

    # ── TIMESHEETS ────────────────────────────────────────────────────────────

    def timesheets(self):
        self.sec("TIMESHEETS")
        self.req("GET","timesheets/me",      [200,404], label="GET /timesheets/me")
        self.req("GET","timesheets/me/current",[200,404], label="GET /timesheets/me/current")
        self.req("GET","timesheets/all",     [200,403], label="GET /timesheets/all")
        self.req("GET","timesheet/yearly-summary",[200,404],
                 params={"year":date.today().year}, label="GET /timesheet/yearly-summary")

    # ── EXPENSES ──────────────────────────────────────────────────────────────

    def expenses(self):
        self.sec("EXPENSES")
        self.req("GET","expenses",         label="GET /expenses")
        self.req("GET","expenses/summary", [200,404], label="GET /expenses/summary")

    # ── BULK EMAIL (read-only) ────────────────────────────────────────────────

    def bulk_email(self):
        self.sec("BULK EMAIL — read-only")
        self.req("GET","bulk-email/recipients", label="GET /bulk-email/recipients")
        self.req("GET","bulk-email/sent",       label="GET /bulk-email/sent")

    # ── OTHER ─────────────────────────────────────────────────────────────────

    def other(self):
        self.sec("OTHER ENDPOINTS")
        self.req("GET","audit-logs",  label="GET /audit-logs")
        self.req("GET","tutorials",   label="GET /tutorials")
        self.req("GET","public/jobs", label="GET /public/jobs — no auth")

    # ── CLEANUP ───────────────────────────────────────────────────────────────

    def cleanup(self):
        self.sec("CLEANUP")
        for path, attr in [
            (f"submissions/{self.submission_id}", "submission_id"),
            (f"candidates/{self.candidate_id}",   "candidate_id"),
            (f"jobs/{self.job_id}",               "job_id"),
            (f"leads/{self.lead_id}",             "lead_id"),
            (f"sales/tracker/pipeline/{self.deal_id}", "deal_id"),
        ]:
            _id = getattr(self, attr)
            if _id:
                self.req("DELETE", path, [200,204,404],
                         label=f"DELETE /{path.split('/')[0]}/:id")

    # ── LOGOUT ────────────────────────────────────────────────────────────────

    def logout(self):
        self.sec("LOGOUT")
        self.req("POST","auth/logout", label="POST /auth/logout")
        self.req("GET", "auth/me", 401, label="GET /auth/me — after logout → 401")

    # ── RUN ───────────────────────────────────────────────────────────────────

    def run(self):
        print(f"\n{B}{'='*52}\n  Nexus CRM — Full Backend API Test Suite\n"
              f"  {BASE_URL}\n{'='*52}{E}\n")
        if not self.auth(): self._summary(); return
        self.users()
        self.dashboards()
        self.leads()
        self.tasks()
        self.reminders()
        self.jobs()
        self.candidates()
        self.submissions()
        self.interviews()
        self.tracker()
        self.timesheets()
        self.expenses()
        self.bulk_email()
        self.other()
        self.cleanup()
        self.logout()
        self._summary()

    def _summary(self):
        total = self.ok + self.fail
        rate  = self.ok/total*100 if total else 0
        print(f"\n{B}{'='*52}\n  RESULTS\n{'='*52}{E}")
        print(f"  {G}✅ Passed : {self.ok}{E}")
        print(f"  {R}❌ Failed : {self.fail}{E}")
        print(f"  {Y}⏭  Skipped: {self.skip}{E}")
        print(f"  📊 Rate   : {rate:.1f}%")
        if self.errors:
            print(f"\n{R}Failures:{E}")
            for e in self.errors: print(f"  • {e}")
        # Exit with code 1 if any failures — GitHub Actions will catch this
        if self.fail > 0:
            sys.exit(1)


if __name__ == "__main__":
    T().run()
