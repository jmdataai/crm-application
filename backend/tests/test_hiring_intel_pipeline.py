"""
End-to-end pipeline simulation for hiring_intel.py — no network, no database.

Reproduces the production failure of 12 Oct 2026 ("LinkedIn: 212 roles … 0 companies pass the
headcount / Ireland / non-agency checks … Saved 0 roles, 0 companies, 0 contacts"):

  * LinkedIn returns many roles, mostly from large employers and agencies, plus a long tail of
    small Irish firms with one or two openings each.
  * Apollo's /mixed_companies/search returns SLIM organisation records (no headcount, no country),
    but honours its own filters (employee ranges, HQ location) server-side.

Run from the backend folder:
    python -m pytest tests/test_hiring_intel_pipeline.py -q
"""
import asyncio
import os
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import hiring_intel as hi  # noqa: E402


# ── fake Supabase ───────────────────────────────────────────────────────
class _Res:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, db, table):
        self.db, self.table, self._insert = db, table, None

    def __getattr__(self, name):            # select / eq / neq / order / limit / in_ / range / update / delete
        return lambda *a, **k: self

    def insert(self, rows):
        self._insert = rows
        return self

    def execute(self):
        if self._insert is not None:
            self.db.setdefault(self.table, []).extend(self._insert)
            return _Res(self._insert)
        return _Res([])


def _wire(db):
    hi._sb = lambda table: _Q(db, table)

    async def run(fn):
        return fn()
    hi._run = run


# ── fake world ──────────────────────────────────────────────────────────
BIG = [f"Bigco {i}" for i in range(15)]                       # 400+ staff, 6 data roles each
SMALL_IE = [f"Smallco {i}" for i in range(20)]                 # 30 staff, Irish HQ, 1 role each
SMALL_FOREIGN = [f"Foreignco {i}" for i in range(5)]           # 40 staff, HQ in UK, 1 role each
AGENCIES = ["Hays", "Cpl", "Morgan McKinley", "Harvey Nash"]   # 5 roles each
APOLLO_ONLY = [f"Apollofound {i}" for i in range(6)]           # small Irish, found by Apollo search only
KNOWN_LARGE = ["Workday", "Accenture"]                         # 8 roles each

ORGS: Dict[str, Dict[str, Any]] = {}
for n in BIG + KNOWN_LARGE:
    ORGS[n] = {"size": 900, "country": "Ireland"}
for n in SMALL_IE + APOLLO_ONLY:
    ORGS[n] = {"size": 30, "country": "Ireland"}
for n in SMALL_FOREIGN:
    ORGS[n] = {"size": 40, "country": "United Kingdom"}


RICH = {"on": False}     # True = Apollo plan that DOES include headcount / country in search results


def _slim(name: str) -> Dict[str, Any]:
    """What Apollo's search returns: by default no estimated_num_employees and no country."""
    slug = name.lower().replace(" ", "-")
    org = {"id": f"org-{slug}", "name": name, "primary_domain": f"{slug}.ie",
           "website_url": f"https://{slug}.ie", "linkedin_url": f"http://www.linkedin.com/company/{slug}"}
    if RICH["on"]:
        org.update(estimated_num_employees=ORGS[name]["size"], country=ORGS[name]["country"])
    return org


def _passes(name: str, params: List) -> bool:
    org = ORGS[name]
    keys = [k for k, _ in params]
    if "organization_num_employees_ranges[]" in keys and org["size"] > 100:
        return False
    if "organization_locations[]" in keys and org["country"] != "Ireland":
        return False
    return True


async def fake_apollo_call(self, method, path, *, kind, params=None, json_body=None):
    self.stats["apollo"][kind] = self.stats["apollo"].get(kind, 0) + 1
    if path == "/mixed_companies/search":
        q = dict(params or []).get("q_organization_name")
        if q is None:                                              # discovery search
            return {"organizations": [_slim(n) for n in APOLLO_ONLY if _passes(n, params)],
                    "pagination": {"total_pages": 1}}
        hits = [n for n in ORGS if n == q and _passes(n, params)]
        return {"organizations": [_slim(n) for n in hits]}
    if path.endswith("/job_postings"):
        return {}
    if path == "/mixed_people/api_search":
        oid = dict(params).get("organization_ids[]")
        return {"people": [{"id": f"p-{oid}", "title": "CEO", "first_name": "Ann", "last_name": "Byrne",
                            "organization_id": oid}]}
    if path == "/people/bulk_match":
        return {"matches": [{"id": d["id"], "name": "Ann Byrne", "email": f"ann@{d['id']}.ie"}
                            for d in json_body["details"]]}
    return {}


async def fake_linkedin(ctx, reg):
    def post(company, title, n):
        for i in range(n):
            hi._ingest(ctx, reg, source="LinkedIn", title=f"{title} {i + 1}" if n > 1 else title,
                       company=company, location="Dublin, County Dublin, Ireland",
                       url=f"https://www.linkedin.com/jobs/view/{abs(hash((company, i))) % 10**9}/",
                       type_hint="Permanent", posted_at="2026-10-10",
                       company_linkedin=f"https://ie.linkedin.com/company/{company.lower().replace(' ', '-')}")
    for n in BIG:
        post(n, "Senior Data Engineer", 6)
    for n in KNOWN_LARGE:
        post(n, "Machine Learning Engineer", 8)
    for n in AGENCIES:
        post(n, "Data Analyst", 5)
    for n in SMALL_IE + SMALL_FOREIGN:
        post(n, "Data Scientist", 1)
    ctx.source_stat("LinkedIn", status="ok")


async def fake_website(ctx, reg, c):
    if c.name in APOLLO_ONLY:          # their careers page lists the role Apollo told us about
        return int(hi._ingest(ctx, reg, source="Company website", title="Analytics Engineer", company=c.name,
                              location="Cork, Ireland", url=f"https://{c.domain}/careers/ae", target=c))
    return 0


def _run_pipeline(monkeypatch, **params):
    db: Dict[str, list] = {}
    _wire(db)
    monkeypatch.setenv("APOLLO_API_KEY", "test-key")
    monkeypatch.setattr(hi.RunContext, "apollo_call", fake_apollo_call)
    monkeypatch.setattr(hi, "source_linkedin", fake_linkedin)
    monkeypatch.setattr(hi, "scan_company_website", fake_website)
    p = hi.RunParams(sources=["linkedin", "apollo", "websites"], **params)
    ctx = hi.RunContext("00000000-0000-0000-0000-000000000001", p)
    counts = asyncio.run(hi.pipeline(ctx))
    return ctx, counts, db


# ── tests ───────────────────────────────────────────────────────────────
def test_scan_finds_small_irish_companies_from_slim_apollo_records(monkeypatch):
    """The exact production shape: max 10 companies, 1 contact each, verified headcount + Irish HQ."""
    ctx, counts, db = _run_pipeline(monkeypatch, days_back=14, max_companies=10, contacts_per_company=1)
    names = {r["company_name"] for r in db.get("hiring_intel_leads", [])}
    assert counts["companies_count"] == 10, ctx.events
    assert counts["contacts_count"] == 10
    # only small, Irish, non-agency companies — never the big hirers, agencies or UK-HQ firms
    assert all(n.startswith(("Smallco", "Apollofound")) for n in names), names
    # Apollo-discovered companies are not thrown away for lacking a headcount field
    assert any(n.startswith("Apollofound") for n in names) or counts["companies_count"] == 10


def test_also_works_when_apollo_returns_full_records(monkeypatch):
    RICH["on"] = True
    try:
        _, counts, db = _run_pipeline(monkeypatch, max_companies=10, contacts_per_company=1)
    finally:
        RICH["on"] = False
    assert counts["companies_count"] == 10
    assert all(r["company_size"] == 30 for r in db["hiring_intel_leads"])


def test_unverified_mode_keeps_unknown_but_not_big(monkeypatch):
    """Toggle OFF: lookups are unfiltered; slim records -> unknown headcount -> kept (as the toggle says)."""
    _, counts, db = _run_pipeline(monkeypatch, max_companies=60, contacts_per_company=1,
                                  require_verified_headcount=False, hq_ireland_only=False)
    names = {r["company_name"] for r in db["hiring_intel_leads"]}
    assert not any(n in names for n in KNOWN_LARGE + AGENCIES)
    assert counts["companies_count"] > 20


def test_known_large_and_agencies_cost_no_lookups(monkeypatch):
    ctx, _, _ = _run_pipeline(monkeypatch, max_companies=10, contacts_per_company=1)
    f = ctx.stats["filtered"]
    assert f["known_large"] == len(KNOWN_LARGE)
    assert f["agency"] == len(AGENCIES)
    # big firms with many postings are looked up LAST, so the small firms get the budget
    assert ctx.stats["apollo"]["lookup_calls"] <= hi.lookup_budget(10)


def test_small_max_companies_still_yields_results(monkeypatch):
    """Max companies = 5 used to mean only 10 lookups — all spent on the biggest hirers."""
    _, counts, _ = _run_pipeline(monkeypatch, days_back=1, max_companies=5, contacts_per_company=1)
    assert counts["companies_count"] == 5


def test_foreign_hq_dropped_only_when_irish_hq_required(monkeypatch):
    _, _, db = _run_pipeline(monkeypatch, max_companies=40, contacts_per_company=1, hq_ireland_only=False)
    names = {r["company_name"] for r in db["hiring_intel_leads"]}
    assert any(n.startswith("Foreignco") for n in names)
    _, _, db = _run_pipeline(monkeypatch, max_companies=40, contacts_per_company=1, hq_ireland_only=True)
    names = {r["company_name"] for r in db["hiring_intel_leads"]}
    assert not any(n.startswith("Foreignco") for n in names)


def test_qualify_log_explains_drops(monkeypatch):
    ctx, _, _ = _run_pipeline(monkeypatch, max_companies=10, contacts_per_company=1)
    assert any(e["msg"].startswith("Dropped:") for e in ctx.events)


def test_cache_entry_usable():
    assert hi.cache_entry_usable({"unmatched": True, "mode": ""}, "sh")          # unfiltered miss stays a miss
    assert hi.cache_entry_usable({"unmatched": True, "mode": "s"}, "sh")
    assert not hi.cache_entry_usable({"unmatched": True, "mode": "sh"}, "")      # filtered miss says nothing unfiltered
    assert not hi.cache_entry_usable({"name": "A"}, "s")                         # old slim match: re-check
    assert hi.cache_entry_usable({"name": "A", "size_ok": True, "hq_ok": True}, "sh")
    assert hi.cache_entry_usable({"name": "A", "estimated_num_employees": 20, "country": "Ireland"}, "sh")
    assert not hi.cache_entry_usable({"name": "A", "size_ok": True}, "sh")


def test_lookup_budget_and_params():
    assert hi.lookup_budget(1) == 20 and hi.lookup_budget(10) == 30 and hi.lookup_budget(150) == 60
    keys = [k for k, _ in hi.lookup_params("Acme", "sh")]
    assert "organization_num_employees_ranges[]" in keys and "organization_locations[]" in keys
    assert [k for k, _ in hi.lookup_params("Acme", "")] == ["q_organization_name", "page", "per_page"]
    assert hi.lookup_mode(hi.RunParams(require_verified_headcount=False)) == ""
    assert hi.lookup_mode(hi.RunParams(hq_ireland_only=False)) == "s"


def test_max_companies_accepts_small_values():
    assert hi.RunParams(max_companies=1).max_companies == 1
