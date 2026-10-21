"""
Tests for hiring_sources.py — parsers and the resilience logic, no network.

    python -m pytest tests/test_hiring_sources.py -q
"""
import asyncio
import os
import sys

import httpx
import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import hiring_sources as hs  # noqa: E402
import hiring_intel as hi    # noqa: E402


def run(coro):
    return asyncio.run(coro)


# ── LinkedIn job page (structure checked against the live guest page, Oct 2026) ──
LI_DETAIL = """
<section class="top-card-layout"><a class="topcard__org-name-link" href="https://ie.linkedin.com/company/axa-partners?trk=x">AXA Partners</a></section>
<ul class="description__job-criteria-list">
  <li class="description__job-criteria-item">
    <h3 class="description__job-criteria-subheader">Seniority level</h3>
    <span class="description__job-criteria-text description__job-criteria-text--criteria">Not Applicable</span></li>
  <li class="description__job-criteria-item">
    <h3 class="description__job-criteria-subheader">Employment type</h3>
    <span class="description__job-criteria-text description__job-criteria-text--criteria">Full-time</span></li>
  <li class="description__job-criteria-item">
    <h3 class="description__job-criteria-subheader">Industries</h3>
    <span class="description__job-criteria-text description__job-criteria-text--criteria">Staffing and Recruiting</span></li>
</ul>"""


def test_parse_linkedin_detail():
    d = hs.parse_linkedin_detail(LI_DETAIL)
    assert d["employment_type"] == "Full-time"
    assert d["industries"] == "Staffing and Recruiting"
    assert d["company_url"] == "https://ie.linkedin.com/company/axa-partners"
    assert hi.is_agency("Some Name", d["industries"])          # industry alone flags an agency
    assert hs.parse_linkedin_detail("") == {}


def _card(i):
    return (f'<li><div class="base-card base-search-card job-search-card" data-entity-urn="urn:li:jobPosting:{i}">'
            f'<a class="base-card__full-link" href="https://ie.linkedin.com/jobs/view/x-{i}"></a>'
            f'<h3 class="base-search-card__title">Data Engineer {i}</h3>'
            f'<h4 class="base-search-card__subtitle"><a href="https://ie.linkedin.com/company/c{i}">Co {i}</a></h4>'
            f'<span class="job-search-card__location">Dublin, Ireland</span></div></li>')


def test_linkedin_client_backs_off_then_recovers():
    calls = []

    async def getter(url, params):
        calls.append(params.get("start"))
        if len(calls) == 2:
            return 429, ""                                   # one "slow down" mid-way
        start = params.get("start", 0)
        return 200, "".join(_card(start + k) for k in range(10)) if start < 20 else ""

    client = hs.LinkedInClient(getter=getter, min_delay=0, max_delay=0, backoffs=(0.01, 0.01), time_budget=30)
    res = run(hs.linkedin_search(client, ["data engineer"], 7, parse_cards=hi.parse_linkedin_cards, max_pages=4))
    assert res.status == "ok"
    assert len(res.rows) == 20                               # nothing lost to the 429
    assert calls == [0, 10, 10, 20]                          # the throttled page was retried, not skipped
    assert "paused" in res.note


def test_linkedin_client_gives_up_after_repeated_blocks_but_keeps_rows():
    n = {"c": 0}

    async def getter(url, params):
        n["c"] += 1
        if n["c"] == 1:
            return 200, "".join(_card(k) for k in range(10))
        return 999, ""

    client = hs.LinkedInClient(getter=getter, min_delay=0, max_delay=0, backoffs=(0.01, 0.01), time_budget=30)
    res = run(hs.linkedin_search(client, ["data engineer", "data scientist"], 7, parse_cards=hi.parse_linkedin_cards))
    assert res.status == "partial" and len(res.rows) == 10
    assert client.gave_up and n["c"] == 4                    # 1 ok + 3 blocked (2 back-offs), then stop


def test_linkedin_details_stop_when_blocked():
    async def getter(url, params):
        return (200, LI_DETAIL) if url.endswith("/1") else (429, "")

    client = hs.LinkedInClient(getter=getter, min_delay=0, max_delay=0, backoffs=(), time_budget=30)
    out = run(hs.linkedin_details(client, ["1", "2", "3"]))
    assert list(out) == ["1"] and out["1"]["employment_type"] == "Full-time"


def test_linkedin_respects_cancel():
    async def getter(url, params):
        raise AssertionError("must not be called")

    client = hs.LinkedInClient(getter=getter, cancelled=lambda: True)
    res = run(hs.linkedin_search(client, ["x"], 7, parse_cards=hi.parse_linkedin_cards))
    assert res.rows == []


# ── Indeed via JobSpy ──
def test_indeed_maps_jobspy_frame_and_dedupes():
    frame = pd.DataFrame([
        {"id": "in-1", "title": "Senior Data Engineer", "company": "Acme Analytics", "location": "Dublin, D, IE",
         "job_url": "https://ie.indeed.com/viewjob?jk=1", "job_url_direct": "https://acme.ie/jobs/1",
         "date_posted": "2026-10-15", "job_type": "fulltime", "company_url_direct": "https://www.acme.ie",
         "company_num_employees": "11 to 50", "company_industry": "Technology", "emails": None},
        {"id": "in-1", "title": "dup", "company": "x", "location": "", "job_url": "", "date_posted": None},
        {"id": "in-2", "title": "Data Analyst", "company": "Beta", "location": float("nan"),
         "job_url": "https://ie.indeed.com/viewjob?jk=2", "date_posted": float("nan"), "job_type": "contract"},
    ])
    seen_kwargs = {}

    def fake_scrape(**kw):
        seen_kwargs.update(kw)
        return frame

    res = hs.indeed_search_sync(["data engineer"], 7, scrape=fake_scrape)
    assert res.status == "ok" and len(res.rows) == 2
    r = res.rows[0]
    assert r["company_website"] == "https://www.acme.ie" and r["headcount_label"] == "11 to 50"
    assert r["employment_raw"] == "fulltime" and r["posted_at"] == "2026-10-15"
    assert res.rows[1]["location"] == "" and res.rows[1]["posted_at"] is None
    assert seen_kwargs["country_indeed"] == "ireland" and seen_kwargs["hours_old"] == 168
    assert "job_type" not in seen_kwargs                     # Indeed allows hours_old OR job_type, not both


def test_indeed_detects_jobspy_swallowed_errors():
    """JobSpy returns an empty frame with df.attrs['errors'] instead of raising when Indeed blocks."""
    def blocked(**kw):
        df = pd.DataFrame([])
        df.attrs = {"errors": {"indeed": "429 Too Many Requests"}}
        return df

    res = hs.indeed_search_sync(["a", "b", "c"], 7, scrape=blocked)
    assert res.status == "blocked" and "429" in res.note and res.requests == 2


def test_indeed_stops_at_deadline_and_on_cancel():
    import time as _t
    calls = []

    def ok(**kw):
        calls.append(kw["search_term"])
        return pd.DataFrame([])

    res = hs.indeed_search_sync(["a", "b"], 7, scrape=ok, deadline=_t.monotonic() - 1)
    assert res.status == "partial" and calls == []
    res = hs.indeed_search_sync(["a", "b"], 7, scrape=ok, cancelled=lambda: True)
    assert res.status == "partial" and calls == []


def test_indeed_reports_blocking():
    def boom(**kw):
        raise RuntimeError("HTTP 403 forbidden")

    res = hs.indeed_search_sync(["a", "b", "c"], 7, scrape=boom)
    assert res.status == "blocked" and res.rows == []


@pytest.mark.parametrize("label,expected", [
    ("11 to 50", (11, 50)), ("51 to 200", (51, 200)), ("10,000+", (10000, 10 ** 9)),
    ("Less than 10", (1, 9)), ("2-10 employees", (2, 10)), ("", None), ("lots", None), ("42", (42, 42)),
])
def test_parse_headcount_label(label, expected):
    assert hs.parse_headcount_label(label) == expected


# ── CareerJet ──
def test_careerjet_falls_back_from_unsupported_locale():
    seen = []

    def handler(req):
        p = dict(req.url.params)
        seen.append((p["locale_code"], p.get("location"), p["contract_type"], req.headers.get("authorization", "")[:6]))
        if p["locale_code"] == "en_IE":
            return httpx.Response(400, text="Unsupported locale code")
        return httpx.Response(200, json={"type": "JOBS", "hits": 1, "pages": 1, "jobs": [
            {"title": "Data Engineer", "company": "Acme", "date": "Mon, 19 Oct 2026 10:00:00 GMT",
             "locations": "Dublin", "url": "https://jobviewtrack.com/x"}]})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await hs.careerjet_search(c, ["data engineer"], user_ip="1.2.3.4", user_agent="UA",
                                             contract_types=["c"], key="k")
    res = run(go())
    assert res.status == "ok" and len(res.rows) == 1
    assert res.rows[0]["posted_at"] == "2026-10-19" and res.rows[0]["type_hint"] == "Contract"
    assert seen[0][0] == "en_IE" and seen[1][:2] == ("en_GB", "Ireland")
    assert seen[0][3] == "Basic "


def test_careerjet_not_configured():
    async def go():
        async with httpx.AsyncClient() as c:
            return await hs.careerjet_search(c, ["x"], user_ip="", user_agent="", contract_types=["p"], key="")
    assert run(go()).status == "not_configured"


# ── JobsIreland (structure observed on the live endpoint, Oct 2026) ──
JI_HTML = """
<div class="job-list full paginated job-description-box" id="jobslist"><div class="row">
<input type="hidden" class="totalCount" value="2" />
<div class="job-heading position-box"><div class="job-detail-main-box">
 <div class="job-detail-right-box">
  <div class="title-box" onclick="gotoJobDetail('2475009')"><div class="job-title-box"><h3>Senior Data Analyst - BRIGHTWAVE ANALYTICS LIMITED</h3></div></div>
  <div class="d-flex"><div class="flex-item"><ul>
    <li><img alt="Icon for Job Reference"><span>Ref: #JOB-2475009</span></li>
    <li><img alt="Icon for Date of Publishing"><span>Published On: 14 Oct 2026</span></li></ul></div>
   <div class="flex-item"><ul>
    <li><img alt="Icon for Location"><span>Unit 4, Sandyford, Dublin 18, D18 X1Y2</span></li>
    <li><img alt="Icon for Closing Date"><span>Closing On: 11 Nov 2026</span></li></ul></div></div>
 </div></div></div>
<div class="job-heading position-box"><div class="job-detail-main-box">
 <div class="job-detail-right-box">
  <div class="title-box" onclick="gotoJobDetail('2475010')"><div class="job-title-box"><h3>Data Engineer</h3></div></div>
  <ul><li><img alt="Icon for Date of Publishing"><span>Published On: 2 October 2026</span></li>
      <li><img alt="Icon for Location"><span>Cork Data Labs, Mahon, Cork</span></li></ul>
 </div></div></div>
<div class="job-detail-right-box"><div class="title-box"><h3>#JobTitle</h3></div></div>
</div></div>"""


def test_parse_jobsireland():
    rows = hs.parse_jobsireland(JI_HTML)
    assert len(rows) == 2
    a, b = rows
    assert a["title"] == "Senior Data Analyst" and a["company"] == "BRIGHTWAVE ANALYTICS LIMITED"
    assert a["url"] == "https://jobsireland.ie/en-US/job-Details?id=2475009" and a["posted_at"] == "2026-10-14"
    assert "Dublin 18" in a["location"]
    assert b["company"] == "Cork Data Labs" and b["posted_at"] == "2026-10-02"


def test_jobsireland_never_makes_place_names_companies():
    assert hs._company_from_address("Unit 4, Sandyford, Dublin 18") == ""
    assert hs._company_from_address("Dublin 2, Ireland") == ""
    assert hs._company_from_address("Cork Data Labs, Mahon, Cork") == "Cork Data Labs"
    assert hs._company_from_address("12 Main Street, Galway") == ""
    assert hs._company_from_address("Unit 4, Mahon Industrial Estate, Cork") == ""
    assert hs._company_from_address("Co. Cork") == ""
    assert hs._company_from_address("Corvid Labs Ltd, Cork") == "Corvid Labs Ltd"


def test_jobsireland_search_dedupes_and_reports_block():
    async def fetch(url, params):
        return (200, JI_HTML) if params["keyWord"] == "data" else (403, "")
    res = run(hs.jobsireland_search(fetch, ["data", "data", "analytics"]))
    assert len(res.rows) == 2 and res.status == "partial" and "403" in res.note


# ── Google (Serper) helpers ──
def test_pick_company_domain_skips_directories():
    organic = [{"title": "Acme Analytics | LinkedIn", "link": "https://ie.linkedin.com/company/acme"},
               {"title": "Acme Analytics - Crunchbase", "link": "https://www.crunchbase.com/organization/acme"},
               {"title": "Acme Analytics – Data consultancy Dublin", "link": "https://www.acmeanalytics.ie/"}]
    assert hs.pick_company_domain(organic, ["acme", "analytics"]) == "acmeanalytics.ie"
    assert hs.pick_company_domain(organic[:2], ["acme", "analytics"]) == ""


def test_parse_xray_result():
    o = {"title": "Ciara Byrne - Co-Founder & CTO - Acme Analytics | LinkedIn",
         "link": "https://ie.linkedin.com/in/ciarabyrne?trk=x", "snippet": "Dublin · CTO at Acme Analytics"}
    p = hs.parse_xray_result(o, ["acme", "analytics"])
    assert p == {"name": "Ciara Byrne", "title": "Co-Founder & CTO", "linkedin_url": "https://ie.linkedin.com/in/ciarabyrne",
                 "source": "LinkedIn search"}
    assert hs.parse_xray_result({**o, "snippet": "", "title": "Ciara Byrne - CTO - Other Co | LinkedIn"}, ["acme", "analytics"]) is None
    assert hs.parse_xray_result({**o, "link": "https://acme.ie/team"}, ["acme"]) is None
    # an ex-employee: company only in the snippet, current role elsewhere
    ex = {"title": "Ciara Byrne - CTO - Other Co | LinkedIn", "link": "https://ie.linkedin.com/in/c",
          "snippet": "Previously CTO at Acme Analytics"}
    assert hs.parse_xray_result(ex, ["acme", "analytics"]) is None


# ── Company website helpers ──
def test_domain_candidates():
    assert hs.domain_candidates(["acme", "analytics"])[:4] == ["acmeanalytics.ie", "acmeanalytics.com",
                                                                "acmeanalytics.io", "acmeanalytics.ai"]
    assert "acme-analytics.ie" in hs.domain_candidates(["acme", "analytics"])
    assert hs.domain_candidates([]) == []


def test_page_matches_company():
    assert hs.page_matches_company("<title>Acme Analytics | Home</title>", ["acme", "analytics"])
    assert hs.page_matches_company('<meta property="og:site_name" content="AcmeAnalytics">', ["acme", "analytics"])
    assert not hs.page_matches_company("<title>This domain is for sale</title>", ["acme"])
    assert not hs.page_matches_company("<title>Totally Different</title>", ["acme"])
    # one-word names collide worldwide: need a .ie site or an Irish mention
    assert not hs.page_matches_company("<title>Kestrel</title>", ["kestrel"], "kestrel.com")
    assert hs.page_matches_company("<title>Kestrel</title><p>Offices in Galway</p>", ["kestrel"], "kestrel.com")
    assert hs.page_matches_company("<title>Kestrel</title>", ["kestrel"], "kestrel.ie")
    assert not hs.page_matches_company("<title>Acme Plumbing</title>", ["acme", "analytics"], "acme.ie")


TEAM_HTML = """
<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme",
 "founder":[{"@type":"Person","name":"Niamh Ryan","jobTitle":"Founder & CEO","sameAs":["https://www.linkedin.com/in/niamhryan"]}]}</script></head>
<body><nav><a href="/about-us">About us</a><a href="/careers">Careers</a><a href="/privacy">Privacy</a>
<a href="https://other.com/team">x</a><a href="/our-team">Meet the team</a></nav>
<section><h2>Meet our team</h2>
 <div class="card"><img alt=""><h3>Aoife Walsh</h3><p>Head of Data</p>
   <a href="https://www.linkedin.com/in/aoifewalsh/">LinkedIn</a></div>
 <div class="card"><h3>Conor O'Brien</h3><p>Chief Technology Officer</p></div>
 <div class="card"><h3>Mary Kelly</h3><p>Office Manager</p></div>
 <div class="card"><h3>Our Leadership</h3><p>CEO and founders</p></div>
</section></body></html>"""


def test_extract_people_from_team_page():
    people = {p["name"]: p for p in hs.extract_people(TEAM_HTML)}
    assert set(people) == {"Niamh Ryan", "Aoife Walsh", "Conor O'Brien"}
    assert people["Niamh Ryan"]["linkedin_url"] == "https://www.linkedin.com/in/niamhryan"
    assert people["Aoife Walsh"]["linkedin_url"] == "https://www.linkedin.com/in/aoifewalsh/"
    assert people["Conor O'Brien"]["title"] == "Chief Technology Officer"


def test_find_team_links():
    links = hs.find_team_links(TEAM_HTML, "https://acme.ie/")
    assert links == ["https://acme.ie/about-us", "https://acme.ie/our-team"]


def test_blocked_boards_documented():
    assert {b["name"] for b in hs.BLOCKED_BOARDS} == {"IrishJobs.ie", "Jobs.ie", "RecruitIreland"}
