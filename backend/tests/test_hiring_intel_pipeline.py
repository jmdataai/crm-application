"""
End-to-end pipeline simulation for hiring_intel.py — no network, no database.

Reproduces the two production failures of 12 Oct 2026:

  1. "LinkedIn: 212 roles … 0 companies pass" — Apollo's /mixed_companies/search returns SLIM records
     (no headcount, no country) and only the biggest hirers were ever looked up.
  2. The first scan after that fix returned staffing / HR firms (Sabeo, RITTS, IT Search, Barden,
     DOMINO HR), a namesake (LinkedIn 'emagine' = Danish consultancy, Apollo matched a small Irish
     'Emagine'), a subsidiary of a large group (Ardonagh) and a company that matched Apollo's
     "< 100" search filter while really having 500+ staff.

The fake world below models each of those shapes.

Run from the backend folder:
    python -m pytest tests/test_hiring_intel_pipeline.py -q
"""
import asyncio
import os
import re
import sys
from typing import Any, Dict, List, Optional

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
def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def org(name, size, country="Ireland", slug=None, domain=None, industry="computer software", parent=None,
        search_size=None, keywords=None, description=""):
    s = slug or _slug(name)
    return {"id": f"org-{s}", "name": name, "slug": s, "domain": domain or f"{s}.ie", "size": size,
            "search_size": size if search_size is None else search_size, "country": country,
            "industry": industry, "parent": parent, "keywords": keywords or ["saas"], "description": description}


# Companies seen on LinkedIn: name -> {roles, li_slug, locale, li_industry, li_text, apollo: [records]}
WORLD: Dict[str, Dict[str, Any]] = {}


def posting(name, roles=1, li_slug=None, locale="ie", li_industry="Software Development", li_text="",
            apollo: Optional[List[dict]] = None, title="Data Scientist"):
    WORLD[name] = {"roles": roles, "li_slug": li_slug or _slug(name), "locale": locale, "title": title,
                   "li_industry": li_industry, "li_text": li_text,
                   "apollo": apollo if apollo is not None else []}


BIG = [f"Bigco {i}" for i in range(15)]
SMALL_IE = [f"Smallco {i}" for i in range(20)]
SMALL_FOREIGN = [f"Foreignco {i}" for i in range(5)]
AGENCIES = ["Hays", "Cpl", "Morgan McKinley", "Harvey Nash"]
KNOWN_LARGE = ["Workday", "Accenture"]
for n in BIG:
    posting(n, roles=6, apollo=[org(n, 900)], title="Senior Data Engineer")
for n in KNOWN_LARGE:
    posting(n, roles=8, apollo=[org(n, 9000)], title="Machine Learning Engineer")
for n in AGENCIES:
    posting(n, roles=5, li_industry="Staffing and Recruiting", apollo=[org(n, 3000, industry="staffing & recruiting")])
for n in SMALL_IE:
    posting(n, apollo=[org(n, 30)])
for n in SMALL_FOREIGN:
    posting(n, apollo=[org(n, 40, country="United Kingdom")])

# ── Vikky's findings, as the data really looked ──
posting("Sabeo", li_slug="sabeoitresourcing", title="Artificial Intelligence Engineer",
        apollo=[org("Sabeo", 25, slug="sabeoitresourcing", domain="sabeo.com")])
posting("RITTS", li_slug="rittsrecruitment", title="Principal AI Platform Engineer",
        apollo=[org("RITTS", 15, slug="rittsrecruitment", domain="rittsrecruitment.ie")])
posting("IT Search", li_slug="it-search---dublin-2", title="Senior Data Engineer",
        apollo=[org("IT Search", 20, slug="it-search---dublin-2", domain="itsearch.ie")])
posting("Barden | B Corp", li_slug="barden-ie", title="Director Business Systems and AI Enablement",
        apollo=[org("Barden", 60, slug="barden-ie", domain="barden.ie")])
posting("DOMINO HR Ireland", li_slug="domino-hr-international-ireland", title="Data Analyst – Market Research",
        apollo=[org("DOMINO HR Ireland", 40, slug="domino-hr-international-ireland", domain="domino-hr.ie",
                    parent="DOMINO HR International")])
# emagine: LinkedIn shows the Danish consultancy; Apollo's name search finds a small Irish namesake
posting("emagine", li_slug="emagine", locale="dk", title="Data Warehouse Manager",
        apollo=[org("Emagine", 12, slug="emagine-media-ireland", domain="emagine.ie"),
                org("emagine", 1500, country="Denmark", slug="emagine", domain="emagine.com")])
# same shape with a name that is on no list: only the LinkedIn-page identity check can catch it
posting("Nimbus Data", li_slug="nimbus-data-global", locale="www",
        apollo=[org("Nimbus Data", 15, slug="nimbusdata-ie", domain="nimbusdata.ie"),
                org("Nimbus Data", 800, country="United States", slug="nimbus-data-global", domain="nimbusdata.com")])
# Ardonagh-style: small Irish arm of a big group
posting("Ardlow Analytics Lab", title="AI Engineer",
        apollo=[org("Ardlow Analytics Lab", 30, parent="The Ardlow Group")])
# matched Apollo's "< 100" search filter, but the enriched record says 520 staff
posting("Stalecount", apollo=[org("Stalecount", 520, search_size=60)])
# agencies with innocent names: caught by the LinkedIn job page
posting("Zenith Partners", li_industry="Staffing and Recruiting", apollo=[org("Zenith Partners", 20)])
posting("Northstar Consulting", li_industry="IT Services and IT Consulting",
        li_text="We are delighted to be recruiting on behalf of our client, a leading fintech in Dublin.",
        apollo=[org("Northstar Consulting", 18)])
# agency caught only by Apollo enrichment (industry)
posting("Bluepeak", li_industry="", apollo=[org("Bluepeak", 22, industry="staffing & recruiting")])
# genuine prospects from the real sheet
posting("Meili", li_slug="meilitravel", title="Senior Data Engineer",
        apollo=[org("Meili", 45, slug="meilitravel", domain="meili.travel")])
posting("Scurri", li_slug="scurri", locale="www", title="AI Platform Engineer",
        apollo=[org("Scurri", 80, slug="scurri", domain="scurri.com")])

BAD = (BIG + KNOWN_LARGE + AGENCIES + SMALL_FOREIGN +
       ["Sabeo", "RITTS", "IT Search", "Barden", "Barden | B Corp", "DOMINO HR Ireland", "Emagine", "emagine", "Nimbus Data",
        "Ardlow Analytics Lab", "Stalecount", "Zenith Partners", "Northstar Consulting", "Bluepeak"])

APOLLO_ONLY = [org(f"Apollofound {i}", 30) for i in range(6)]
ALL_RECORDS = [r for w in WORLD.values() for r in w["apollo"]] + APOLLO_ONLY

RICH = {"on": False}      # True = Apollo plan that DOES include headcount / country in search results
ENRICH = {"on": True}     # False = bulk_enrich unavailable (plan / credits)
JOB_PAGES: Dict[str, str] = {}   # LinkedIn job id -> company name


def _search_record(r: dict) -> dict:
    out = {"id": r["id"], "name": r["name"], "primary_domain": r["domain"], "website_url": f"https://{r['domain']}",
           "linkedin_url": f"http://www.linkedin.com/company/{r['slug']}"}
    if RICH["on"]:
        out.update(estimated_num_employees=r["search_size"], country=r["country"])
    return out


def _enriched_record(r: dict) -> dict:
    out = {**_search_record(r), "estimated_num_employees": r["size"], "country": r["country"], "city": "Dublin",
           "industry": r["industry"], "keywords": r["keywords"], "short_description": r["description"]}
    if r["parent"]:
        out["owned_by_organization"] = {"id": "org-parent", "name": r["parent"]}
    return out


def _passes(r: dict, params: List) -> bool:
    keys = [k for k, _ in params]
    if "organization_num_employees_ranges[]" in keys and r["search_size"] > 100:
        return False
    if "organization_locations[]" in keys and r["country"] != "Ireland":
        return False
    return True


async def fake_apollo_call(self, method, path, *, kind, params=None, json_body=None):
    self.stats["apollo"][kind] = self.stats["apollo"].get(kind, 0) + 1
    if path == "/mixed_companies/search":
        q = dict(params or []).get("q_organization_name")
        if q is None:                                              # discovery search
            return {"organizations": [_search_record(r) for r in APOLLO_ONLY if _passes(r, params)],
                    "pagination": {"total_pages": 1}}
        qk = hi.company_key(q)
        return {"organizations": [_search_record(r) for r in ALL_RECORDS
                                  if hi.company_key(r["name"]) == qk and _passes(r, params)]}
    if path == "/organizations/bulk_enrich":
        if not ENRICH["on"]:
            return None
        out = []
        for d in json_body["details"]:
            slug = hi.linkedin_company_slug(d.get("linkedin_url"))
            rec = (next((r for r in ALL_RECORDS if d.get("domain") and r["domain"] == d["domain"]), None)
                   or next((r for r in ALL_RECORDS if slug and r["slug"] == slug), None))
            if rec:
                out.append(_enriched_record(rec))
        return {"organizations": out}
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


def _job_page_html(company: str) -> str:
    w = WORLD[company]
    return (f'<section><a class="topcard__org-name-link" href="https://{w["locale"]}.linkedin.com/company/'
            f'{w["li_slug"]}?trk=x">{company}</a>'
            f'<div class="show-more-less-html__markup">{w["li_text"] or "Join our data team."}</div>'
            f'<ul class="description__job-criteria-list">'
            f'<li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">'
            f'Employment type</h3><span class="description__job-criteria-text">Full-time</span></li>'
            f'<li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">'
            f'Industries</h3><span class="description__job-criteria-text">{w["li_industry"]}</span></li>'
            f'</ul></section>')


async def fake_web_get(self, url, **kw):
    m = re.search(r"jobPosting/(\d+)", url)
    if m and m.group(1) in JOB_PAGES:
        return hi.WebResponse(200, _job_page_html(JOB_PAGES[m.group(1)]).encode(), url, "utf-8")
    return None


async def fake_linkedin(ctx, reg):
    for name, w in WORLD.items():
        for i in range(w["roles"]):
            jid = str(10**8 + abs(hash((name, i))) % 10**8)
            JOB_PAGES[jid] = name
            hi._ingest(ctx, reg, source="LinkedIn", title=f"{w['title']} {i + 1}" if w["roles"] > 1 else w["title"],
                       company=name, location="Dublin, County Dublin, Ireland",
                       url=f"https://www.linkedin.com/jobs/view/{jid}/", type_hint="Permanent", posted_at="2026-10-10",
                       company_linkedin=f"https://{w['locale']}.linkedin.com/company/{w['li_slug']}")
    ctx.source_stat("LinkedIn", status="ok")


async def fake_website(ctx, reg, c):
    if c.name.startswith("Apollofound"):     # their careers page lists the role Apollo told us about
        return int(hi._ingest(ctx, reg, source="Company website", title="Analytics Engineer", company=c.name,
                              location="Cork, Ireland", url=f"https://{c.domain}/careers/ae", target=c))
    return 0


def _run_pipeline(monkeypatch, **params):
    db: Dict[str, list] = {}
    _wire(db)
    monkeypatch.setenv("APOLLO_API_KEY", "test-key")
    monkeypatch.setattr(hi.RunContext, "apollo_call", fake_apollo_call)
    monkeypatch.setattr(hi.RunContext, "web_get", fake_web_get)
    monkeypatch.setattr(hi, "source_linkedin", fake_linkedin)
    monkeypatch.setattr(hi, "scan_company_website", fake_website)

    async def no_sleep(*_a, **_k):
        return None
    monkeypatch.setattr(hi.asyncio, "sleep", no_sleep)
    p = hi.RunParams(sources=["linkedin", "apollo", "websites"], **params)
    ctx = hi.RunContext("00000000-0000-0000-0000-000000000001", p)
    counts = asyncio.run(hi.pipeline(ctx))
    return ctx, counts, db


def _run_pipeline_keep_apollo(monkeypatch, apollo, **params):
    """Same as _run_pipeline but with a custom Apollo fake (e.g. a spy)."""
    monkeypatch.setattr(hi.RunContext, "apollo_call", apollo)
    db: Dict[str, list] = {}
    _wire(db)
    p = hi.RunParams(sources=["linkedin", "apollo", "websites"], **params)
    ctx = hi.RunContext("00000000-0000-0000-0000-000000000002", p)
    counts = asyncio.run(hi.pipeline(ctx))
    return ctx, counts, db


def _names(db) -> set:
    return {r["company_name"] for r in db.get("hiring_intel_leads", [])}


def _rejected(ctx) -> Dict[str, str]:
    return {r["company"]: r["reason"] for r in ctx.stats["rejected"]}


# ── tests ───────────────────────────────────────────────────────────────
def test_production_settings_return_only_genuine_small_irish_companies(monkeypatch):
    """Max 10 companies, 1 contact each, verified headcount + Irish HQ (the settings used on 12 Oct)."""
    ctx, counts, db = _run_pipeline(monkeypatch, days_back=14, max_companies=10, contacts_per_company=1)
    names = _names(db)
    assert counts["companies_count"] == 10, ctx.events
    assert counts["contacts_count"] == 10
    assert not names & set(BAD), names & set(BAD)
    # every saved company carries a real, verified headcount under 100
    assert all(r["company_size"] is not None and r["company_size"] < 100 for r in db["hiring_intel_leads"])


def test_every_bad_company_is_rejected_with_the_right_reason(monkeypatch):
    ctx, _, db = _run_pipeline(monkeypatch, max_companies=60, contacts_per_company=1)
    names, rej = _names(db), _rejected(ctx)
    assert not names & set(BAD), names & set(BAD)
    assert {"Meili", "Scurri"} <= names
    assert all(f"Smallco {i}" in names for i in range(20))
    for agency in ["Sabeo", "RITTS", "IT Search", "Barden | B Corp", "DOMINO HR Ireland", "Hays", "Cpl"]:
        assert "staffing/recruitment" in rej[agency], (agency, rej.get(agency))
    assert "LinkedIn industry" in rej["Zenith Partners"]
    assert "on behalf of a client" in rej["Northstar Consulting"]
    assert "staffing" in rej["Bluepeak"]
    assert "part of The Ardlow Group" == rej["Ardlow Analytics Lab"]
    assert rej["Stalecount"] == "520 staff (Apollo)"
    # namesake: Apollo's small Irish "Nimbus Data" is a different LinkedIn page -> never used
    assert "Nimbus Data" in rej and "Nimbus Data" not in names
    # emagine: rejected, and its row never carried the Irish namesake's CEO
    assert "emagine" in rej or "Emagine" in rej


def test_without_enrichment_identity_and_linkedin_checks_still_hold(monkeypatch):
    """If bulk_enrich is unavailable (plan/credits), the free checks still catch agencies & namesakes."""
    ENRICH["on"] = False
    try:
        ctx, _, db = _run_pipeline(monkeypatch, max_companies=60, contacts_per_company=1)
    finally:
        ENRICH["on"] = True
    names = _names(db)
    for n in ["Sabeo", "RITTS", "IT Search", "Barden | B Corp", "DOMINO HR Ireland", "Zenith Partners",
              "Northstar Consulting", "Nimbus Data", "emagine", "Emagine"]:
        assert n not in names, n
    assert any("enrichment didn't answer" in w for w in ctx.stats["warnings"])


def test_also_works_when_apollo_search_returns_full_records(monkeypatch):
    RICH["on"] = True
    try:
        _, counts, db = _run_pipeline(monkeypatch, max_companies=10, contacts_per_company=1)
    finally:
        RICH["on"] = False
    assert counts["companies_count"] == 10
    assert not _names(db) & set(BAD)


def test_unverified_mode_keeps_unknown_but_not_big_or_agencies(monkeypatch):
    _, counts, db = _run_pipeline(monkeypatch, max_companies=60, contacts_per_company=1,
                                  require_verified_headcount=False, hq_ireland_only=False)
    names = _names(db)
    assert not names & set(KNOWN_LARGE + AGENCIES + ["Sabeo", "RITTS", "IT Search", "Zenith Partners"])
    assert counts["companies_count"] > 20


def test_small_max_companies_still_yields_results(monkeypatch):
    _, counts, db = _run_pipeline(monkeypatch, days_back=1, max_companies=5, contacts_per_company=1)
    assert counts["companies_count"] == 5
    assert not _names(db) & set(BAD)


def test_foreign_hq_dropped_only_when_irish_hq_required(monkeypatch):
    _, _, db = _run_pipeline(monkeypatch, max_companies=60, contacts_per_company=1, hq_ireland_only=False)
    assert any(n.startswith("Foreignco") for n in _names(db))
    _, _, db = _run_pipeline(monkeypatch, max_companies=60, contacts_per_company=1, hq_ireland_only=True)
    assert not any(n.startswith("Foreignco") for n in _names(db))


def test_log_explains_drops_and_lists_every_rejected_company(monkeypatch):
    ctx, _, _ = _run_pipeline(monkeypatch, max_companies=10, contacts_per_company=1)
    assert any(e["msg"].startswith("Dropped at qualify:") for e in ctx.events)
    assert ctx.stats["rejected"] and all({"company", "reason", "stage"} <= set(r) for r in ctx.stats["rejected"])


def test_repeat_scan_never_pays_twice_for_the_same_company(monkeypatch):
    paid: List[tuple] = []

    async def spy(self, method, path, **kw):
        if path == "/organizations/bulk_enrich":
            paid.extend(("enrich", hi.company_key(d["name"])) for d in kw["json_body"]["details"])
        elif path == "/mixed_companies/search" and dict(kw.get("params") or []).get("q_organization_name"):
            paid.append(("lookup", hi.company_key(dict(kw["params"])["q_organization_name"])))
        return await fake_apollo_call(self, method, path, **kw)

    _run_pipeline(monkeypatch, max_companies=10, contacts_per_company=1)          # wires the fakes
    ctx1, _, _ = _run_pipeline_keep_apollo(monkeypatch, spy, max_companies=10, contacts_per_company=1)
    first = list(paid)
    paid.clear()
    cache = dict(ctx1.company_cache_out)

    async def load(c):
        c.company_cache_in.update(cache)
    monkeypatch.setattr(hi, "load_company_cache", load)
    ctx2, counts2, _ = _run_pipeline_keep_apollo(monkeypatch, spy, max_companies=10, contacts_per_company=1)
    assert first and counts2["companies_count"] == 10
    assert not set(first) & set(paid), set(first) & set(paid)
    assert ctx2.stats["apollo"]["orgs_enrich_cached"] > 0


def test_cache_entry_usable():
    assert hi.cache_entry_usable({"unmatched": True, "mode": ""}, "sh")
    assert hi.cache_entry_usable({"unmatched": True, "mode": "s"}, "sh")
    assert not hi.cache_entry_usable({"unmatched": True, "mode": "sh"}, "")
    assert not hi.cache_entry_usable({"name": "A"}, "s")
    assert hi.cache_entry_usable({"name": "A", "size_ok": True, "hq_ok": True}, "sh")
    assert hi.cache_entry_usable({"name": "A", "estimated_num_employees": 20, "country": "Ireland"}, "sh")
    assert not hi.cache_entry_usable({"name": "A", "size_ok": True}, "sh")


def test_lookup_budget_and_params():
    assert hi.lookup_budget(1) == 20 and hi.lookup_budget(10) == 30 and hi.lookup_budget(150) == 60
    assert hi.verify_budget(10) == 30 and hi.verify_budget(100) == 60
    keys = [k for k, _ in hi.lookup_params("Acme", "sh")]
    assert "organization_num_employees_ranges[]" in keys and "organization_locations[]" in keys
    assert [k for k, _ in hi.lookup_params("Acme", "")] == ["q_organization_name", "page", "per_page"]
    assert hi.lookup_mode(hi.RunParams(require_verified_headcount=False)) == ""
    assert hi.lookup_mode(hi.RunParams(hq_ireland_only=False)) == "s"


def test_max_companies_accepts_small_values():
    assert hi.RunParams(max_companies=1).max_companies == 1
