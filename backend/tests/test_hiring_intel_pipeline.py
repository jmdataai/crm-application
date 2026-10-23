"""
End-to-end pipeline simulation for hiring_intel.py (v3) — no network, no database.

The fake world reproduces what the first live scans (21-22 Oct 2026) ran into:

  * "15 companies hiring" but only 2 size-verified: most companies had no website, so no free check
    could run. Here websites must come from Clearbit / Wikidata / the LinkedIn slug.
  * Apollo's domain filter matches PREVIOUS employers too: JPMorgan alumni who founded startups show up
    in a "1-100 staff" search on jpmorganchase.com. They must never make the bank look small, nor
    appear as its CEOs.
  * Agencies whose name and board data look innocent, caught only by the LinkedIn job page
    (industry) or the ad text ("on behalf of our client").
  * LinkedIn "Full-time" on a 12-month contract; a foreign HQ known only from Glassdoor;
    a multinational Wikidata knows (no website needed); a company nothing can verify (kept, labelled).

Run from the backend folder:
    python -m pytest tests/test_hiring_intel_pipeline.py -q
"""
import asyncio
import os
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import hiring_intel as hi      # noqa: E402
import hiring_sources as hs    # noqa: E402


# ── fake Supabase ───────────────────────────────────────────────────────
class _Res:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, db, table):
        self.db, self.table, self._insert = db, table, None

    def __getattr__(self, name):            # select / eq / neq / order / limit / in_ / range / update / delete
        return lambda *a, **k: self

    @property
    def not_(self):
        return self

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
# LinkedIn search results: (company, title, slug, n_roles)
LINKEDIN = [
    ("Brightwave Analytics", "Senior Data Engineer", "brightwave-analytics", 1),
    ("JPMorganChase", "Data Engineer III (Databricks)", "jpmorganchase", 5),
    ("Workday", "Machine Learning Engineer", "workday", 2),
    ("Hays", "Contract Data Engineer", "hays", 1),
    ("Zenith Partners", "Data Engineer", "zenith-partners", 1),
    ("Northstar Consulting", "Data Engineer", "northstar-consulting", 1),
    ("Meili", "Senior Data Engineer", "meilitravel", 1),
    ("Contractco", "Data Engineer", "contractco", 1),
    ("Permco", "Data Analyst", "permco", 1),
    ("Mystery Labs", "AI Engineer", "mystery-labs", 1),
    ("Nimbus Data", "Data Engineer", "nimbus-data-global", 1),     # US, 800 staff; Apollo knows a small IE arm
]
# LinkedIn guest job page per company: (Employment type, Industries, description)
JOB_PAGE = {
    "Brightwave Analytics": ("Contract", "Software Development", "Initial 6 month contract."),
    "Zenith Partners": ("Contract", "Staffing and Recruiting", "Great contract."),
    "Northstar Consulting": ("Contract", "IT Services and IT Consulting",
                             "We are recruiting on behalf of our client, a fintech. 6 month contract."),
    "Meili": ("Contract", "Travel Arrangements", "12 month contract, hybrid in Dublin."),
    "Contractco": ("Full-time", "Software Development", "This is a 12 month contract with a view to extend."),
    "Permco": ("Full-time", "Software Development", "A permanent role with share options."),
    "Mystery Labs": ("Contract", "Software Development", "Contract role, daily rate."),
    "Nimbus Data": ("Contract", "Software Development", "6 month contract."),
}
# Indeed / Glassdoor rows (board data carries website, band, HQ)
BOARD_ROWS = {
    "Indeed": [dict(title="Data Engineer", company="Kestrel AI", location="Dublin, D, IE",
                    url="https://ie.indeed.com/viewjob?jk=1", url_direct="https://careers.kestrel.ai/jobs/1",
                    employment_raw="", posted_at=None, company_website="", headcount_label="11 to 50",
                    industry="Technology", company_address="Dublin 2, Ireland",
                    description="Job Types: Contract\nContract length: 9 months")],
    "Glassdoor": [dict(title="Data Scientist", company="Foreignco", location="Dublin, Ireland",
                       url="https://www.glassdoor.ie/job-listing/j?jl=7", url_direct="", employment_raw="contract",
                       posted_at=None, company_website="https://foreignco.co.uk", headcount_label="1 to 50 Employees",
                       industry="Information Technology", company_address="London, United Kingdom", description="")],
}
CLEARBIT = {
    "Brightwave Analytics": [{"name": "Brightwave Analytics", "domain": "brightwave.ie"}],
    "JPMorganChase": [{"name": "JPMorgan Chase & Co.", "domain": "jpmorganchase.com"}],
    "Meili": [{"name": "Meilisearch", "domain": "meilisearch.com"}],
}
WIKIDATA = {"Workday": {"qid": "Q1", "label": "Workday, Inc.", "description": "software company",
                        "domain": "workday.com", "employees": 20000, "irish": False}}   # slug 'workday' ties it
HOMEPAGES = {"brightwave.ie": "<html><head><title>Brightwave Analytics - data consultancy</title></head></html>",
             "meilitravel.com": "<html><head><title>Meili | Car hire made simple</title></head>"
                                "<body>Built in Dublin, Ireland</body></html>"}


def P(org, size, hq, title, pid):
    return {"org": org, "size": size, "hq": hq, "title": title, "id": pid}


# People Apollo holds per domain — incl. ALUMNI (people who used to work there, now elsewhere)
APOLLO_BY_DOMAIN: Dict[str, List[dict]] = {
    "brightwave.ie": [P("Brightwave Analytics", 25, "IE", "CTO", "bw1"), P("Brightwave Analytics", 25, "IE", "Engineer", "bw2")],
    "kestrel.ai": [P("Kestrel AI", 30, "IE", "Co-Founder & CEO", "ke1")],
    "jpmorganchase.com": [P("JPMorgan Chase & Co.", 250000, "US", "Executive Director", "jp1"),
                          P("Tiny AI", 8, "IE", "CEO", "alum1"), P("Data Folk", 20, "IE", "Founder", "alum2")],
    "meilitravel.com": [P("Meili", 45, "IE", "Head of Data", "me1")],
}
# Apollo's own job-posting data: small Irish companies with open Data/AI roles
APOLLO_JOB_SIGNAL = [P("Meili", 45, "IE", "CEO", "me2"), P("Unrelated Smallco", 12, "IE", "CEO", "un1"),
                     P("Nimbus Data Ireland", 15, "IE", "CEO", "nb1")]          # the namesake's Irish arm


def _range_ok(size, params):
    rs = [v for k, v in params if k == "organization_num_employees_ranges[]"]
    if not rs:
        return True
    for r in rs:
        lo, _, hi_ = r.partition(",")
        if int(lo) <= size <= (int(hi_) if hi_ else 10 ** 9):
            return True
    return False


def _row(p):
    return {"id": p["id"], "first_name": "Pat", "last_name_obfuscated": "Mu***y", "title": p["title"],
            "organization": {"name": p["org"], "has_employee_count": True}}


CALLS: List[list] = []


async def fake_apollo_call(self, method, path, *, kind, params=None, json_body=None):
    self.stats["apollo"][kind] = self.stats["apollo"].get(kind, 0) + 1
    params = params or []
    CALLS.append(params)
    if path != "/mixed_people/api_search":
        raise AssertionError(f"a scan must not call paid endpoints: {path}")
    keys = {k for k, _ in params}
    if "q_organization_job_titles[]" in keys:
        people = APOLLO_JOB_SIGNAL
    elif "q_keywords" in keys:
        people = []                                    # Apollo can't place these by keyword
    else:
        dom = dict(params).get("q_organization_domains_list[]")
        people = APOLLO_BY_DOMAIN.get(dom, [])
    people = [p for p in people if _range_ok(p["size"], params)]
    if "organization_locations[]" in keys:
        people = [p for p in people if p["hq"] == "IE"]
    if "person_titles[]" in keys:
        people = [p for p in people if hi.classify_icp(p["title"])[0]]
    return {"people": [_row(p) for p in people], "total_entries": len(people)}


async def fake_web_get(self, url, **kw):
    host = hi.clean_domain(url)
    if host in HOMEPAGES:
        return hi.WebResponse(200, HOMEPAGES[host].encode(), url, "utf-8")
    return None


async def fake_clearbit(client, name):
    return "ok", CLEARBIT.get(name, [])


async def fake_wikidata(client, name, key_fn, key):
    return "ok", WIKIDATA.get(name)


class _LiClient:
    requests = 0

    def renew_budget(self, seconds):
        return True

    async def close(self):
        pass


JOB_IDS: Dict[str, str] = {}


async def fake_linkedin(ctx, reg):
    ctx.li_client = _LiClient()
    n = 0
    for company, title, slug, roles in LINKEDIN:
        for i in range(roles):
            n += 1
            jid = str(4_400_000_000 + n)
            JOB_IDS[jid] = company
            t = title if roles == 1 else f"{title} - {['Payments', 'Risk', 'Markets', 'Cards', 'Wealth'][i]}"
            hit = hi._ingest(ctx, reg, source="LinkedIn", title=t, company=company,
                             company_linkedin=f"https://ie.linkedin.com/company/{slug}",
                             location="Dublin, County Dublin, Ireland",
                             url=f"https://www.linkedin.com/jobs/view/{jid}/", posted_at="2026-10-20", defer_type=True)
            if hit:
                ctx.li_pending.append((hit[0], hit[1], jid))
    ctx.source_stat("LinkedIn", status="ok")


async def fake_linkedin_details(client, job_ids):
    out = {}
    for jid in job_ids:
        company = JOB_IDS[jid]
        if company in JOB_PAGE:
            et, ind, desc = JOB_PAGE[company]
            out[jid] = {"employment_type": et, "industries": ind, "description": desc}
    return out


def _board(source):
    async def run(ctx, reg):
        for r in BOARD_ROWS[source]:
            hi._ingest_board_row(ctx, reg, source, r)
        ctx.source_stat(source, status="ok")
    return run


async def no_website(ctx, reg, c):
    return 0


def _run(monkeypatch, **params):
    db: Dict[str, list] = {}
    _wire(db)
    CALLS.clear()
    monkeypatch.setenv("APOLLO_API_KEY", "test-key")
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    monkeypatch.setattr(hi.RunContext, "apollo_call", fake_apollo_call)
    monkeypatch.setattr(hi.RunContext, "web_get", fake_web_get)
    monkeypatch.setattr(hi, "source_linkedin", fake_linkedin)
    monkeypatch.setitem(hi.SOURCE_RUNNERS, "linkedin", fake_linkedin)
    monkeypatch.setitem(hi.SOURCE_RUNNERS, "indeed", _board("Indeed"))
    monkeypatch.setitem(hi.SOURCE_RUNNERS, "glassdoor", _board("Glassdoor"))
    monkeypatch.setattr(hi, "scan_company_website", no_website)
    monkeypatch.setattr(hs, "clearbit_suggest", fake_clearbit)
    monkeypatch.setattr(hs, "wikidata_lookup", fake_wikidata)
    monkeypatch.setattr(hs, "linkedin_details", fake_linkedin_details)
    p = hi.RunParams(sources=["linkedin", "indeed", "glassdoor", "websites"], **params)
    ctx = hi.RunContext("00000000-0000-0000-0000-000000000003", p)

    async def go():
        ctx.web = None
        return await hi.pipeline(ctx)
    counts = asyncio.run(go())
    return ctx, counts, db


def _leads(db) -> Dict[str, List[dict]]:
    out: Dict[str, List[dict]] = {}
    for r in db.get("hiring_intel_leads", []):
        out.setdefault(r["company_name"], []).append(r)
    return out


def _rejected(ctx) -> Dict[str, str]:
    return {r["company"]: r["reason"] for r in ctx.stats["rejected"]}


# ── tests ───────────────────────────────────────────────────────────────
def test_contract_scan_keeps_the_right_companies(monkeypatch):
    ctx, counts, db = _run(monkeypatch, employment_types=["Contract"], include_unspecified_type=True)
    leads = _leads(db)
    assert set(leads) == {"Brightwave Analytics", "Kestrel AI", "Meili", "Contractco", "Mystery Labs",
                          "Nimbus Data"}, \
        (set(leads), ctx.events)
    assert counts["companies_count"] == 6
    # the US company stays visible but UNVERIFIED and never gets its Irish namesake's CEO
    nimbus = leads["Nimbus Data"]
    assert nimbus[0]["size_status"] == "unverified" and not any(r["person_key"] for r in nimbus)


def test_every_dropped_company_is_listed_with_its_reason(monkeypatch):
    ctx, _, _ = _run(monkeypatch, employment_types=["Contract"])
    rej = _rejected(ctx)
    assert "staffing" in rej["Hays"]
    assert "Staffing and Recruiting" in rej["Zenith Partners"]          # LinkedIn job page industry
    assert "on behalf of a client" in rej["Northstar Consulting"]        # ad text
    assert "over 100 staff" in rej["JPMorganChase"]                      # Apollo, its OWN staff
    assert "Wikidata" in rej["Workday"] and "20,000" in rej["Workday"]    # no website needed
    assert "HQ in London" in rej["Foreignco"]                            # Glassdoor HQ address
    assert "no role left" in rej["Permco"]                               # permanent, not contract


def test_alumni_never_become_contacts_or_verify_a_bank(monkeypatch):
    ctx, _, db = _run(monkeypatch, employment_types=["Contract"])
    names = {r["person_name"] for rs in _leads(db).values() for r in rs if r["person_name"]}
    assert not any("alum" in str(r.get("apollo_person_id")) for rs in _leads(db).values() for r in rs)
    assert "JPMorganChase" not in _leads(db)
    # the bank was settled by ONE call (many roles -> 'too big' check first)
    jp_calls = [c for c in CALLS if dict(c).get("q_organization_domains_list[]") == "jpmorganchase.com"]
    assert len(jp_calls) == 1, jp_calls
    assert names                                                           # but real contacts exist


def test_sizes_and_contacts(monkeypatch):
    ctx, counts, db = _run(monkeypatch, employment_types=["Contract"])
    leads = _leads(db)
    status = {n: rs[0]["size_status"] for n, rs in leads.items()}
    assert status == {"Brightwave Analytics": "verified", "Kestrel AI": "verified", "Meili": "verified",
                      "Contractco": "unverified", "Mystery Labs": "unverified", "Nimbus Data": "unverified"}, status
    bw = leads["Brightwave Analytics"]
    assert [r["icp_role"] for r in bw if r["person_key"]] == ["CTO"]       # the engineer is not an ICP contact
    assert bw[0]["company_domain"] == "brightwave.ie"                      # found via Clearbit
    assert leads["Meili"][0]["company_domain"] == "meilitravel.com"        # found via the LinkedIn slug
    assert any(r["person_key"] for r in leads["Kestrel AI"])
    # every kept company has a row, even without a contact — the sheet and the KPI always agree
    assert all(len(rs) >= 1 for rs in leads.values())
    s = ctx.stats["summary"]
    assert s["verified_companies"] + s["unverified_companies"] == counts["companies_count"]
    assert ctx.stats["domains"]["clearbit"] >= 1 and ctx.stats["domains"]["guessed"] >= 1


def test_contract_typing_from_ad_text(monkeypatch):
    ctx, _, db = _run(monkeypatch, employment_types=["Contract"])
    jobs = {j["company_name"]: j for j in db["hiring_intel_jobs"]}
    assert jobs["Contractco"]["employment_type"] == "Contract"             # 'Full-time' + '12 month contract'
    assert jobs["Kestrel AI"]["employment_type"] == "Contract"             # Indeed 'Job Types: Contract'


def test_permanent_scan_flips_the_picture(monkeypatch):
    _, _, db = _run(monkeypatch, employment_types=["Permanent"], include_unspecified_type=False)
    leads = _leads(db)
    assert "Permco" in leads and "Contractco" not in leads and "Brightwave Analytics" not in leads


def test_scan_never_spends_credits(monkeypatch):
    ctx, _, _ = _run(monkeypatch, employment_types=["Contract"])
    a = ctx.stats["apollo"]
    assert a["search_calls"] == 0 and a["lookup_calls"] == 0 and a["people_search_calls"] > 0


def test_repeat_scan_reuses_what_it_learned(monkeypatch):
    ctx1, _, _ = _run(monkeypatch, employment_types=["Contract"])
    cache = dict(ctx1.company_cache_out)
    assert any(k.startswith("big:") for k in cache) and any(k.startswith("dom:") for k in cache)

    async def load(c):
        c.company_cache_in.update(cache)
    monkeypatch.setattr(hi, "load_company_cache", load)
    ctx2, counts2, _ = _run(monkeypatch, employment_types=["Contract"])
    assert counts2["companies_count"] == 6
    # the bank and Workday are ruled out from the cache: no Apollo call for jpmorganchase.com this time
    assert not [c for c in CALLS if dict(c).get("q_organization_domains_list[]") == "jpmorganchase.com"]
    assert "earlier scan" in _rejected(ctx2)["JPMorganChase"]


def test_company_cap_applies_after_the_job_pages(monkeypatch):
    """Review #7: LinkedIn companies that turn out permanent must not use up the contract slots."""
    ctx, counts, db = _run(monkeypatch, employment_types=["Contract"], max_companies=5)
    assert counts["companies_count"] == 5
    assert "Permco" not in _leads(db) and "Contractco" in _leads(db)
