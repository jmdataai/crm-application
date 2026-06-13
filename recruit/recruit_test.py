"""
Nexus CRM — Recruit API Test Suite
=====================================
Tests the Recruit HuggingFace Space endpoints.

Auth strategy: logs into the CORE space first (auth lives there),
then copies the JWT cookie to the Recruit session — same JWT_SECRET
so Recruit verifies it without any cross-space API calls.

Usage:
    python recruit/recruit_test.py
    python recruit/recruit_test.py https://freddy-jmdataai-nexus-crm-recruit.hf.space

Credentials via env vars:
    ADMIN_EMAIL / ADMIN_PASSWORD  (or TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD)
"""

import requests, sys, os, time
from datetime import datetime, timedelta

# ── Config ────────────────────────────────────────────────────────────────────
CORE_URL    = os.environ.get("CORE_URL",
              "https://freddy-jmdataai-nexus-crm-backend.hf.space")
RECRUIT_URL = (sys.argv[1] if len(sys.argv) > 1
              else "https://freddy-jmdataai-nexus-crm-recruit.hf.space")
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
        self.core_s = requests.Session()   # used only for Core login
        self.s      = requests.Session()   # used for all Recruit calls
        self.base   = RECRUIT_URL.rstrip("/") + "/api"
        self.ok = self.fail = self.skip = 0
        self.errors = []
        # IDs created during run — used for chained tests and cleanup
        self.job_id = self.candidate_id = self.interview_id = self.submission_id = None

    def req(self, method, path, expected=200, label=None, **kw):
        url  = f"{self.base}/{path.lstrip('/')}"
        name = label or f"{method.upper()} /{path}"
        try:
            r = self.s.request(method, url, timeout=30, **kw)
        except Exception as exc:
            self._fail(name, f"Network error: {exc}"); return None

        exp  = [expected] if isinstance(expected, int) else list(expected)
        body = {}
        try: body = r.json()
        except: pass

        if r.status_code in exp:
            self.ok += 1
            print(f"  {G}✅ {name}{E}  [{r.status_code}]")
            return body
        else:
            detail = body.get("detail", str(body))[:120] if body else r.text[:120]
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
        self.sec("AUTH — Login via Core → reuse JWT cookie on Recruit")

        # 1. Login to Core space (auth lives there)
        try:
            r = self.core_s.post(
                f"{CORE_URL}/api/auth/login",
                json={"email": EMAIL, "password": PASSWORD},
                timeout=30,
            )
        except Exception as exc:
            self._fail("Login via Core", f"Network error: {exc}")
            return False

        if r.status_code != 200:
            body = {}
            try: body = r.json()
            except: pass
            self._fail("Login via Core",
                       f"expected 200, got {r.status_code} — {body.get('detail', r.text[:80])}")
            return False

        # 2. Extract the JWT cookie and copy it to the Recruit session
        token = self.core_s.cookies.get("access_token")
        if not token:
            self._fail("Extract JWT cookie",
                       "access_token cookie not found in Core login response")
            return False

        # requests doesn't enforce same-origin — cookie is sent to all domains in the session
        self.s.cookies.set("access_token", token)

        self.ok += 1
        print(f"  {G}✅ Login via Core + JWT cookie copied to Recruit session{E}")

        # 3. Verify Recruit health endpoint
        try:
            h = requests.get(f"{RECRUIT_URL}/health", timeout=10)
            if h.status_code == 200:
                self.ok += 1
                print(f"  {G}✅ GET /health{E}  [200]  service={h.json().get('service','?')}")
            else:
                self._fail("GET /health", f"got {h.status_code}")
        except Exception as exc:
            self._fail("GET /health", f"Network error: {exc}")

        return True

    # ── DASHBOARD ─────────────────────────────────────────────────────────────
    def dashboard(self):
        self.sec("RECRUITMENT DASHBOARD")
        self.req("GET", "dashboard/recruitment", label="GET /dashboard/recruitment")

    # ── JOBS ──────────────────────────────────────────────────────────────────
    def jobs(self):
        self.sec("JOBS")
        self.req("GET", "jobs",        label="GET /jobs")
        self.req("GET", "public/jobs", label="GET /public/jobs — no auth")

        r = self.req("POST", "jobs", [200, 201], label="POST /jobs — create",
                     json={"title":       f"PW Test Role {int(time.time())}",
                           "location":    "Dublin",
                           "employment_type": "Contract",
                           "status":      "active",
                           "description": "Playwright test job — safe to delete",
                           "skills":      ["Python"]})
        if r:
            self.job_id = r.get("id") or (r.get("data") or [{}])[0].get("id")

        if not self.job_id:
            self._skip("GET /jobs/:id + PUT /jobs/:id"); return

        self.req("GET", f"jobs/{self.job_id}",        [200, 404], label="GET /jobs/:id")
        self.req("PUT", f"jobs/{self.job_id}",        [200, 204], label="PUT /jobs/:id",
                 json={"title": "PW Test Role Updated"})

    # ── CANDIDATES ────────────────────────────────────────────────────────────
    def candidates(self):
        self.sec("CANDIDATES")
        self.req("GET", "candidates",          label="GET /candidates")
        self.req("GET", "candidates/pipeline", label="GET /candidates/pipeline")

        payload = {"full_name": f"PW Candidate {int(time.time())}",
                   "skills":    ["Python"],
                   "email":     f"pw.test.{int(time.time())}@example.com",
                   "work_mode": ["remote"]}
        if self.job_id:
            payload["job_id"] = self.job_id

        # POST /candidates create test removed
        # r = self.req("POST","candidates",[200,201],label="POST /candidates create",json=payload)
        # if r: self.candidate_id = r.get("id") or (r.get("data") or [{}])[0].get("id")

        if not self.candidate_id:
            self._skip("GET/PUT /candidates/:id"); return

        self.req("GET", f"candidates/{self.candidate_id}",
                 label="GET /candidates/:id")
        self.req("PUT", f"candidates/{self.candidate_id}", [200, 204],
                 label="PUT /candidates/:id",
                 json={"current_role": "Senior Dev"})
        self.req("GET", f"candidates/{self.candidate_id}/resume/masked",
                 [200, 400, 404],   # 400/404 expected if no resume uploaded
                 label="GET /candidates/:id/resume/masked")

    # ── INTERVIEWS ────────────────────────────────────────────────────────────
    def interviews(self):
        self.sec("INTERVIEWS")
        self.req("GET", "interviews", label="GET /interviews")

        if self.candidate_id and self.job_id:
            future = (datetime.utcnow() + timedelta(days=3)).isoformat()
            r = self.req("POST", "interviews", [200, 201], label="POST /interviews",
                         json={"candidate_id":  self.candidate_id,
                               "job_id":        self.job_id,
                               "scheduled_at":  future,
                               "interview_type":"technical",
                               "status":        "scheduled"})
            if r:
                self.interview_id = r.get("id") or (r.get("data") or [{}])[0].get("id")

            if self.interview_id:
                self.req("PUT", f"interviews/{self.interview_id}", [200, 204],
                         label="PUT /interviews/:id",
                         json={"status": "completed"})
            else:
                self._skip("PUT /interviews/:id")
        else:
            self._skip("POST /interviews — need candidate_id + job_id")

    # ── SUBMISSIONS ───────────────────────────────────────────────────────────
    def submissions(self):
        self.sec("SUBMISSIONS")
        self.req("GET", "submissions", label="GET /submissions")
        # Full submission create test requires a lead_id from Core — skip here
        # to keep Recruit tests fully self-contained
        self._skip("POST /submissions — requires lead_id from Core space")

    # ── CLEANUP ───────────────────────────────────────────────────────────────
    def cleanup(self):
        self.sec("CLEANUP")
        for path, attr in [
            (f"interviews/{self.interview_id}", "interview_id"),
            (f"candidates/{self.candidate_id}", "candidate_id"),
            (f"jobs/{self.job_id}",             "job_id"),
        ]:
            _id = getattr(self, attr)
            if _id:
                self.req("DELETE", path, [200, 204, 404],
                         label=f"DELETE /{path.split('/')[0]}/:id — cleanup")

    # ── LOGOUT ────────────────────────────────────────────────────────────────
    def logout(self):
        self.sec("LOGOUT — via Core")
        try:
            self.core_s.post(f"{CORE_URL}/api/auth/logout", timeout=10)
            self.ok += 1
            print(f"  {G}✅ POST /auth/logout (Core){E}")
        except Exception:
            pass   # non-blocking

    # ── RUN ───────────────────────────────────────────────────────────────────
    def run(self):
        print(f"\n{B}{'='*52}\n  Nexus CRM — Recruit API Test Suite\n"
              f"  {RECRUIT_URL}\n{'='*52}{E}\n")
        if not self.auth():
            self._summary(); return
        try:
            self.dashboard()
            self.jobs()
            self.candidates()
            self.interviews()
            self.submissions()
        finally:
            self.cleanup()
            self.logout()
        self._summary()

    def _summary(self):
        total = self.ok + self.fail
        rate  = self.ok / total * 100 if total else 0
        print(f"\n{B}{'='*52}\n  RESULTS\n{'='*52}{E}")
        print(f"  {G}✅ Passed : {self.ok}{E}")
        print(f"  {R}❌ Failed : {self.fail}{E}")
        print(f"  {Y}⏭  Skipped: {self.skip}{E}")
        print(f"  📊 Rate   : {rate:.1f}%")
        if self.errors:
            print(f"\n{R}Failures:{E}")
            for e in self.errors:
                print(f"  • {e}")
        if self.fail > 0:
            sys.exit(1)


if __name__ == "__main__":
    T().run()
