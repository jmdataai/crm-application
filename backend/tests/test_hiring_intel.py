"""
Unit tests for hiring_intel.py — pure logic only, no network, no database.

Run from the backend folder:
    pip install pytest beautifulsoup4 httpx fastapi pydantic
    python -m pytest tests/test_hiring_intel.py -q
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import hiring_intel as hi  # noqa: E402


# ── Title classification ────────────────────────────────────────────────
@pytest.mark.parametrize("title,expected", [
    ("Senior Data Engineer", "Data Engineering"),
    ("Analytics Engineer (dbt)", "Data Engineering"),
    ("Lead Data Engineer - Contract", "Data Engineering"),
    ("Data Scientist", "Data Science"),
    ("Machine Learning Engineer", "AI / ML"),
    ("MLOps Engineer", "AI / ML"),
    ("Generative AI Engineer", "AI / ML"),
    ("AI Engineer", "AI / ML"),
    ("LLM Research Engineer", "AI / ML"),
    ("Head of Data", "Data Leadership"),
    ("Director of Analytics", "Data Leadership"),
    ("Chief Data Officer", "Data Leadership"),
    ("Power BI Developer", "Analytics / BI"),
    ("Data Analyst", "Analytics / BI"),
    ("Business Intelligence Analyst", "Analytics / BI"),
    ("Data Governance Lead", "Data Governance"),
    ("Platform Engineer - AI", "AI / ML"),
])
def test_classify_title_accepts_data_ai(title, expected):
    assert hi.classify_title(title) == expected


@pytest.mark.parametrize("title", [
    "Data Entry Clerk",
    "Data Centre Technician",
    "Data Center Operations Engineer",
    "Data Protection Officer",
    "Head of Data Protection",
    "AI Trainer (Freelance)",
    "Data Annotation Specialist",
    "Account Executive - AI Platform",
    "AI Sales Executive",
    "Marketing Manager",
    "Retail Assistant",           # contains 'ai' inside a word
    "HTML Developer",             # contains 'ML' inside a word
    "Software Engineer",
    "Data Science Intern",
    "",
])
def test_classify_title_rejects_non_data(title):
    assert hi.classify_title(title) is None


# ── Employment type ─────────────────────────────────────────────────────
@pytest.mark.parametrize("raw,title,expected", [
    ("Full-time", "Data Engineer", "Permanent"),
    ("FullTime", "Data Engineer", "Permanent"),
    ("FULL_TIME", "Data Engineer", "Permanent"),
    ("permanent full-time", "Data Engineer", "Permanent"),
    ("Contract", "Data Engineer", "Contract"),
    ("CONTRACTOR", "Data Engineer", "Contract"),
    ("Temporary", "Data Engineer", "Contract"),
    ("Full-time", "Data Engineer - 6 month contract", "Contract"),   # title wins
    (None, "Data Engineer (FTC)", "Contract"),
    (None, "Senior Data Engineer", "Unspecified"),
    ("Part-time", "Data Analyst", "Part-time"),
    ("Intern", "Data Analyst", "Internship"),
    (["FULL_TIME", "CONTRACTOR"], "Data Engineer", "Contract"),
])
def test_employment_type(raw, title, expected):
    assert hi.normalize_employment_type(raw, title) == expected


# ── Ireland location ────────────────────────────────────────────────────
@pytest.mark.parametrize("loc,expected", [
    ("Dublin, County Dublin, Ireland", "IE"),
    ("Cork, Ireland", "IE"),
    ("Galway", "IE"),
    ("Ireland", "IE"),
    ("Remote; IE", "IE"),
    ("Hybrid - Limerick", "IE"),
    ("Belfast, Northern Ireland, United Kingdom", "NI"),
    ("Northern Ireland", "NI"),
    ("Dublin, Ohio, United States", ""),
    ("Dublin, CA", ""),
    ("London, England, United Kingdom", ""),
    ("Remote - EMEA", ""),
    ("", ""),
])
def test_ireland_location(loc, expected):
    assert hi.ireland_location(loc) == expected


# ── Identity / de-duplication ───────────────────────────────────────────
def test_company_key_strips_legal_suffixes():
    assert hi.company_key("Acme Analytics Ltd.") == "acme analytics"
    assert hi.company_key("Acme Analytics Limited") == "acme analytics"
    assert hi.company_key("Acme Analytics (Ireland) DAC") == "acme analytics"
    assert hi.company_key("The Data & AI Company Ireland") == "data and ai company"
    assert hi.company_key("") == ""


def test_title_key_ignores_noise():
    a = hi.title_key("Senior Data Engineer (Contract, 6 months) - Dublin")
    b = hi.title_key("Senior Data Engineer")
    assert a == b == "senior data engineer"
    assert hi.title_key("Data Engineer") != hi.title_key("Senior Data Engineer")


def test_company_merges_same_job_from_two_sources():
    c = hi.Company(name="Acme", key="acme")
    j1 = hi.Job("Data Engineer", "https://www.linkedin.com/jobs/view/1/", "Dublin, Ireland", "LinkedIn",
                "Unspecified", "Data Engineering", "2026-10-01")
    j2 = hi.Job("Data Engineer (Hybrid)", "https://boards.greenhouse.io/acme/jobs/9", "Dublin", "Company website (Greenhouse)",
                "Permanent", "Data Engineering", "2026-10-03")
    assert c.add_job(j1) is True
    assert c.add_job(j2) is False                     # merged, not duplicated
    assert len(c.jobs) == 1
    job = next(iter(c.jobs.values()))
    assert job["url"] == "https://boards.greenhouse.io/acme/jobs/9"     # company page beats LinkedIn
    assert job["other_urls"] == ["https://www.linkedin.com/jobs/view/1/"]
    assert job["employment_type"] == "Permanent"
    assert job["posted_at"] == "2026-10-03"
    assert set(job["sources"]) == {"LinkedIn", "Company website (Greenhouse)"}


def test_registry_merges_by_linkedin_slug_and_apollo():
    reg = hi.CompanyRegistry()
    a = reg.get_or_create("Acme Technologies", linkedin="https://ie.linkedin.com/company/acme-tech")
    a.add_job(hi.Job("Data Engineer", "u1", "Dublin", "LinkedIn", "Permanent", "Data Engineering"))
    b = reg.get_or_create("Acme", apollo_id="org1")
    b.add_job(hi.Job("Data Scientist", "u2", "Dublin", "Apollo", "Unspecified", "Data Science"))
    # Apollo record carries the same LinkedIn page -> the two must collapse into one company
    reg.apply_apollo_org(b, {"id": "org1", "name": "Acme", "linkedin_url": "http://www.linkedin.com/company/acme-tech",
                             "primary_domain": "acme.ie", "estimated_num_employees": 40, "country": "Ireland"})
    assert len(reg.items) == 1
    only = reg.items[0]
    assert only.size == 40 and only.domain == "acme.ie" and only.key == "acme"
    assert {j["title"] for j in only.jobs.values()} == {"Data Engineer", "Data Scientist"}


def test_agency_detection():
    assert hi.is_agency("Sigmar Recruitment")
    assert hi.is_agency("Morgan McKinley")
    assert hi.is_agency("Acme", "Staffing & Recruiting")
    assert not hi.is_agency("Acme Analytics", "Information Technology & Services")


# ── Contacts ────────────────────────────────────────────────────────────
@pytest.mark.parametrize("title,role", [
    ("Head of Data", "Data Head"),
    ("Chief Data Officer", "Data Head"),
    ("VP of Analytics", "Data Head"),
    ("Co-Founder & CTO", "CTO"),
    ("Chief Technology Officer", "CTO"),
    ("Founder & CEO", "CEO"),
    ("Managing Director", "CEO"),
    ("Co-founder", "Co-Founder"),
    ("Founder", "Founder"),
    ("Software Engineer", None),
])
def test_classify_icp(title, role):
    assert hi.classify_icp(title)[0] == role


def test_clean_email_rejects_apollo_placeholders():
    assert hi.clean_email("email_not_unlocked@domain.com") is None
    assert hi.clean_email("someone@domain.com") is None
    assert hi.clean_email("") is None
    assert hi.clean_email("Jane.Doe@Acme.ie") == "jane.doe@acme.ie"


def test_pick_phone_prefers_mobile_and_skips_invalid():
    nums = [
        {"sanitized_number": "+35311111111", "type_cd": "work_hq", "status_cd": "valid_number"},
        {"sanitized_number": "+353870000000", "type_cd": "mobile", "status_cd": "invalid_number"},
        {"sanitized_number": "+353861234567", "type_cd": "mobile", "status_cd": "valid_number"},
    ]
    assert hi.pick_phone(nums) == "+353861234567"
    assert hi.pick_phone([]) is None
    assert hi.pick_phone(None) is None


# ── Parsers ─────────────────────────────────────────────────────────────
LINKEDIN_FRAGMENT = """
<li>
  <div class="base-card relative w-full base-card--link base-search-card base-search-card--link job-search-card"
       data-entity-urn="urn:li:jobPosting:4012345678">
    <a class="base-card__full-link absolute" href="https://ie.linkedin.com/jobs/view/data-engineer-at-acme-4012345678?position=1&amp;pageNum=0&amp;refId=x">
      <span class="sr-only">Data Engineer</span>
    </a>
    <div class="base-search-card__info">
      <h3 class="base-search-card__title">
            Data Engineer
      </h3>
      <h4 class="base-search-card__subtitle">
        <a class="hidden-nested-link" href="https://ie.linkedin.com/company/acme-analytics?trk=public_jobs">Acme Analytics</a>
      </h4>
      <div class="base-search-card__metadata">
        <span class="job-search-card__location">Dublin, County Dublin, Ireland</span>
        <time class="job-search-card__listdate" datetime="2026-10-08">2 days ago</time>
      </div>
    </div>
  </div>
</li>
<li>
  <a class="base-card base-search-card job-search-card" href="https://ie.linkedin.com/jobs/view/ml-engineer-at-beta-4099999999?trk=x">
    <h3 class="base-search-card__title">ML Engineer</h3>
    <h4 class="base-search-card__subtitle">Beta AI</h4>
    <span class="job-search-card__location">Cork, Ireland</span>
  </a>
</li>
"""


def test_parse_linkedin_cards():
    cards = hi.parse_linkedin_cards(LINKEDIN_FRAGMENT)
    assert len(cards) == 2
    a, b = cards
    assert a["id"] == "4012345678"
    assert a["url"] == "https://www.linkedin.com/jobs/view/4012345678/"
    assert a["title"] == "Data Engineer"
    assert a["company"] == "Acme Analytics"
    assert a["company_url"] == "https://ie.linkedin.com/company/acme-analytics"
    assert a["location"] == "Dublin, County Dublin, Ireland"
    assert a["posted_at"] == "2026-10-08"
    assert b["id"] == "4099999999" and b["company"] == "Beta AI" and b["posted_at"] is None


def test_parse_linkedin_cards_empty():
    assert hi.parse_linkedin_cards("") == []
    assert hi.parse_linkedin_cards("<html><body>no jobs</body></html>") == []


def test_find_ats_refs_and_careers_links():
    html = """
      <a href="/careers">Careers</a> <a href="https://other.com/jobs">x</a>
      <a href="https://boards.greenhouse.io/acmeanalytics">Open roles</a>
      <iframe src="https://boards.greenhouse.io/embed/job_board?for=acmeanalytics"></iframe>
      <script src="https://jobs.lever.co/api/x"></script>
      <a href="https://apply.workable.com/acme-ai/">Workable</a>
    """
    refs = hi.find_ats_refs(html)
    assert ("greenhouse", "acmeanalytics") in refs
    assert ("workable", "acme-ai") in refs
    assert ("lever", "api") not in refs
    assert hi.find_careers_links(html, "https://acme.ie/") == ["https://acme.ie/careers"]


def test_parse_jsonld_jobs():
    html = """<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"JobPosting","title":"Senior Data Scientist","datePosted":"2026-10-02","employmentType":"FULL_TIME",
       "url":"https://acme.ie/careers/ds","jobLocation":{"@type":"Place","address":{"addressLocality":"Dublin","addressCountry":"IE"}}},
      {"@type":"Organization","name":"Acme"}]}</script>"""
    jobs = hi.parse_jsonld_jobs(html, "https://acme.ie/careers")
    assert jobs == [{"title": "Senior Data Scientist", "url": "https://acme.ie/careers/ds", "location": "Dublin, IE",
                     "employment_raw": "FULL_TIME", "posted_at": "2026-10-02"}]


def test_ats_parsers():
    gh = hi.parse_greenhouse({"jobs": [{"id": 1, "title": "Data Engineer", "absolute_url": "https://x/1",
                                        "location": {"name": "Dublin, Ireland"}, "updated_at": "2026-10-01T10:00:00Z"}]}, "acme")
    assert gh[0]["location"] == "Dublin, Ireland" and gh[0]["posted_at"] == "2026-10-01"
    lv = hi.parse_lever([{"id": "a", "text": "Data Analyst", "hostedUrl": "https://jobs.lever.co/acme/a",
                          "categories": {"location": "Cork", "commitment": "Full Time"}, "createdAt": 1759312800000,
                          "country": "IE"}], "acme")
    assert lv[0]["location"] == "Cork, IE" and lv[0]["employment_raw"] == "Full Time" and lv[0]["posted_at"]
    ab = hi.parse_ashby({"jobs": [{"title": "ML Engineer", "location": "Remote", "employmentType": "Contract",
                                   "jobUrl": "https://jobs.ashbyhq.com/acme/1", "isListed": True,
                                   "address": {"postalAddress": {"addressCountry": "Ireland"}}},
                                  {"title": "Hidden", "isListed": False}]}, "acme")
    assert len(ab) == 1 and hi.ireland_location(ab[0]["location"]) == "IE"
    wk = hi.parse_workable({"name": "Acme", "jobs": [{"title": "BI Developer", "shortcode": "ABC", "employment_type": "Contract",
                                                      "city": "Galway", "country": "Ireland", "url": "https://apply.workable.com/acme/j/ABC/"}]}, "acme")
    assert wk[0]["location"].startswith("Galway, Ireland")
    pe = hi.parse_personio("<workzag-jobs><position><id>7</id><office>Dublin</office><name>Data Engineer</name>"
                           "<employmentType>permanent</employmentType><schedule>full-time</schedule>"
                           "<createdAt>2026-09-30T08:00:00+00:00</createdAt></position></workzag-jobs>",
                           "acme", "acme.jobs.personio.de")
    assert pe[0]["url"] == "https://acme.jobs.personio.de/job/7" and pe[0]["posted_at"] == "2026-09-30"
    assert hi.parse_personio("not xml", "a", "b") == []


def test_parse_apollo_job_postings_tolerates_shapes():
    assert hi.parse_apollo_job_postings({"organization_job_postings": [
        {"title": "Data Engineer", "url": "https://x", "city": "Dublin", "country": "Ireland", "posted_at": "2026-10-01T00:00:00Z"}
    ]})[0]["location"] == "Dublin, Ireland"
    assert hi.parse_apollo_job_postings({"whatever": [{"title": "Data Analyst"}]})[0]["title"] == "Data Analyst"
    assert hi.parse_apollo_job_postings(None) == []


def test_safe_public_host():
    assert hi._safe_public_host("https://acme.ie/careers")
    assert not hi._safe_public_host("http://localhost:8000/")
    assert not hi._safe_public_host("http://127.0.0.1/")
    assert not hi._safe_public_host("http://10.0.0.5/")
    assert not hi._safe_public_host("http://169.254.169.254/latest/meta-data")


def test_to_date_str():
    assert hi.to_date_str("2026-10-08T12:00:00Z") == "2026-10-08"
    assert hi.to_date_str(1759312800000) == "2025-10-01"
    assert hi.to_date_str("garbage") is None
    assert hi.to_date_str(None) is None


# ── Rows ────────────────────────────────────────────────────────────────
def test_build_rows_dedupes_and_flags_new():
    c = hi.Company(name="Acme", key="acme", domain="acme.ie", size=30)
    c.add_job(hi.Job("Data Engineer", "u1", "Dublin", "LinkedIn", "Permanent", "Data Engineering", "2026-10-01"))
    c.add_job(hi.Job("ML Engineer", "u2", "Dublin", "LinkedIn", "Contract", "AI / ML", "2026-10-05"))
    contacts = {"acme": [
        {"person_key": "p1", "apollo_person_id": "p1", "name": "Jane Doe", "title": "CTO", "role": "CTO",
         "email": "jane@acme.ie", "linkedin_url": "https://linkedin.com/in/jane", "source": "Apollo"},
    ]}
    prev = {hi.job_fingerprint("acme", "Data Engineer"): "2026-09-20T00:00:00+00:00"}
    jobs, leads = hi.build_rows("run1", [c], contacts, prev, {"acme"}, "2026-10-10T00:00:00+00:00")
    assert len(jobs) == 2
    de = next(j for j in jobs if j["title"] == "Data Engineer")
    ml = next(j for j in jobs if j["title"] == "ML Engineer")
    assert de["is_new"] is False and de["first_seen_at"] == "2026-09-20T00:00:00+00:00"
    assert ml["is_new"] is True
    assert len(leads) == 1
    lead = leads[0]
    assert lead["hiring_for"] == ["ML Engineer", "Data Engineer"]       # newest posting first
    assert lead["job_links"] == ["u2", "u1"]
    assert set(lead["employment_types"]) == {"Permanent", "Contract"}
    assert lead["person_key"] == "p1" and lead["is_new_company"] is False
    assert lead["contact_source"] == "Apollo" and lead["size_status"] == "unverified" and lead["name_hidden"] is False


def test_build_rows_company_without_contacts_keeps_one_row():
    c = hi.Company(name="Solo", key="solo")
    c.add_job(hi.Job("Data Analyst", "u", "Cork", "LinkedIn", "Permanent", "Analytics / BI"))
    _, leads = hi.build_rows("run1", [c], {}, {}, set(), "2026-10-10T00:00:00+00:00")
    assert len(leads) == 1 and leads[0]["person_key"] == "" and leads[0]["is_new_company"] is True


# ── Params ──────────────────────────────────────────────────────────────
def test_run_params_validation():
    p = hi.RunParams()
    assert p.employment_types == ["Permanent", "Contract"] and p.max_headcount == 99 and p.apollo_company_lookups == 0
    assert hi.RunParams(employment_types=["contract"]).employment_types == ["Contract"]
    with pytest.raises(Exception):
        hi.RunParams(employment_types=["internship"])
    with pytest.raises(Exception):
        hi.RunParams(sources=["myspace"])
    with pytest.raises(Exception):
        hi.RunParams(sources=["websites"])            # careers pages alone can't find companies
    assert "apollo_discovery" not in hi.RunParams().sources   # paid discovery is opt-in
    assert hi.RunParams(sources=["apollo", "linkedin"]).sources == ["linkedin"]   # old saved settings
    with pytest.raises(Exception):
        hi.RunParams(max_headcount=500)
    assert hi.RunParams(extra_keywords=["  dbt  ", "data engineer", "dbt"]).extra_keywords == ["dbt"]


def test_registry_two_name_variants_same_apollo_org_survive():
    """Regression: two records resolving to one Apollo org used to delete each other."""
    reg = hi.CompanyRegistry()
    a = reg.get_or_create("Fenergo")
    a.add_job(hi.Job("Data Engineer", "u1", "Dublin", "LinkedIn", "Permanent", "Data Engineering"))
    b = reg.get_or_create("Fenergo Software")
    b.add_job(hi.Job("Data Scientist", "u2", "Dublin", "Jooble", "Permanent", "Data Science"))
    org = {"id": "org-f", "name": "Fenergo Software Ltd", "primary_domain": "fenergo.com",
           "estimated_num_employees": 90, "country": "Ireland"}
    for c in [a, b]:                      # the resolve loop holds both references
        reg.apply_apollo_org(c, org)
    assert len(reg.items) == 1
    assert {j["title"] for j in reg.items[0].jobs.values()} == {"Data Engineer", "Data Scientist"}
    assert reg.items[0].size == 90


def test_companies_with_equal_fields_are_distinct_records():
    assert hi.Company(name="A", key="a") != hi.Company(name="A", key="a")


def test_safe_public_host_rejects_short_ip_forms_and_schemes():
    assert not hi._safe_public_host("http://127.1/")
    assert not hi._safe_public_host("ftp://acme.ie/")
    assert not hi._safe_public_host("http://[::1]/")
    assert hi._safe_public_host("http://8.8.8.8/")


def test_contact_summary():
    rows = [{"person_key": "a", "email": "a@b.ie", "linkedin_url": "x", "enriched_at": "t"},
            {"person_key": "b", "email": None}, {"person_key": ""}]
    assert hi.contact_summary(rows) == {"with_email": 1, "with_linkedin": 1, "revealed": 1, "to_reveal": 1}



# ── Free contacts: merging Apollo (hidden surnames) with website / X-ray finds ──
def test_merge_contacts_fills_hidden_surname_and_ranks():
    apollo = [{"apollo_person_id": "a1", "name": "Ciara By***e", "title": "Co-Founder & CTO", "role": "CTO",
               "rank": 2, "source": "Apollo", "needs_reveal": True, "linkedin_url": ""},
              {"apollo_person_id": "a2", "name": "Sean K***y", "title": "CEO", "role": "CEO", "rank": 3,
               "source": "Apollo", "needs_reveal": True}]
    site = [{"name": "Ciara Byrne", "title": "CTO & Co-founder", "linkedin_url": "https://www.linkedin.com/in/ciarab",
             "source": "Company website"},
            {"name": "Aoife Walsh", "title": "Head of Data", "linkedin_url": "", "source": "Company website"},
            {"name": "Tom Office", "title": "Office Manager", "source": "Company website"}]
    out = hi.merge_contacts(apollo, site, [], cap=3)
    assert [p["name"] for p in out] == ["Aoife Walsh", "Ciara Byrne", "Sean K***y"]
    ciara = out[1]
    assert ciara["apollo_person_id"] == "a1" and ciara["needs_reveal"] is False
    assert ciara["linkedin_url"] == "https://www.linkedin.com/in/ciarab"
    assert out[0]["person_key"].startswith("n:") and ciara["person_key"] == "a1"


def test_apollo_people_parsing_and_company_guard():
    c = hi.Company(name="Acme Analytics", key="acme analytics", domain="acme.ie")
    data = {"people": [
        {"id": "p1", "first_name": "Ciara", "last_name_obfuscated": "By***e", "title": "CTO",
         "organization": {"name": "Acme Analytics", "primary_domain": "acme.ie"}},
        {"id": "p2", "first_name": "Bob", "last_name_obfuscated": "S***h", "title": "Software Engineer",
         "organization": {"name": "Acme Analytics"}},
        {"id": "p3", "first_name": "Eve", "last_name_obfuscated": "X***", "title": "CEO",
         "organization": {"name": "Other Corp", "primary_domain": "other.com"}},
    ], "total_entries": 3}
    people = hi._apollo_people(data, c)
    assert [p["apollo_person_id"] for p in people] == ["p1"]
    assert people[0]["name"] == "Ciara By***e" and people[0]["needs_reveal"] is True
    assert hi._total_entries(data) == 3 and hi._total_entries({"pagination": {"total_entries": "7"}}) == 7


def test_split_name_refuses_hidden_surnames():
    assert hi._split_name("Ciara Byrne") == ("Ciara", "Byrne")
    assert hi._split_name("Dr. Aoife Mary Walsh") == ("Aoife", "Walsh")
    assert hi._split_name("Sean K***y") == ("Sean", "")


def test_build_rows_all_lead_rows_share_the_same_keys():
    """Regression: PostgREST bulk inserts NULL for keys missing from some rows (NOT NULL name_hidden broke)."""
    a = hi.Company(name="A", key="a")
    a.add_job(hi.Job("Data Engineer", "u", "Dublin", "LinkedIn", "Permanent", "Data Engineering"))
    b = hi.Company(name="B", key="b")
    b.add_job(hi.Job("Data Analyst", "u2", "Cork", "Indeed", "Permanent", "Analytics / BI"))
    contacts = {"a": [{"person_key": "p1", "name": "Jane Doe", "title": "CTO", "role": "CTO", "source": "Apollo",
                       "needs_reveal": True}]}
    _, leads = hi.build_rows("r", [a, b], contacts, {}, set(), "2026-10-20T00:00:00+00:00")
    assert len({tuple(sorted(r)) for r in leads}) == 1
    assert [r["name_hidden"] for r in leads] == [True, False]


def test_display_company_name():
    assert hi.display_company_name("BRIGHTWAVE ANALYTICS LIMITED") == "Brightwave Analytics Limited"
    assert hi.display_company_name("KESTREL AI DAC") == "Kestrel AI DAC"
    assert hi.display_company_name("Acme Analytics") == "Acme Analytics"
    assert hi.display_company_name("IBM") == "IBM"



def test_same_person_respects_apollo_obfuscation():
    assert hi._same_person({"name": "Ciara By***e"}, {"name": "Ciara Byrne"})
    assert not hi._same_person({"name": "Ciara By***e"}, {"name": "Ciara Brennan"})
    assert not hi._same_person({"name": "Ciara"}, {"name": "Ciara Byrne"})
    assert hi._same_person({"name": "Sean Kelly"}, {"name": "Sean Kelly"})


def test_person_keys_are_company_scoped():
    a = hi._person_key({"name": "John Smith"}, "acme")
    b = hi._person_key({"name": "John Smith"}, "beta")
    assert a != b and a.startswith("n:acme:")
    assert hi._person_key({"name": "x", "apollo_person_id": "p1"}, "acme") == "p1"
    assert hi._person_key({"name": "x", "linkedin_url": "https://ie.linkedin.com/in/JaneD/"}, "acme") == "li:janed"


def test_redact_hides_new_keys_and_proxy_passwords(monkeypatch):
    monkeypatch.setenv("SERPER_API_KEY", "serper-secret-123")
    msg = hi.redact("failed http://user:pa55w0rd@proxy.example:8080 with key serper-secret-123")
    assert "pa55w0rd" not in msg and "serper-secret-123" not in msg and "***@proxy.example" in msg


class _FakeCtx:
    """Just enough RunContext for apollo_size_and_people."""
    def __init__(self, responses, hq=True, max_hc=99):
        self.responses = list(responses)
        self.calls = []
        self.apollo_disabled = ""
        self.p = hi.RunParams(hq_ireland_only=hq, max_headcount=max_hc)
        self.warnings = []

    async def apollo_call(self, method, path, *, kind, params=None, json_body=None):
        self.calls.append(params)
        return self.responses.pop(0) if self.responses else {"people": [], "total_entries": 0}

    def warn(self, msg):
        self.warnings.append(msg)

    def check_cancel(self):
        pass

    def log(self, msg, level="info"):
        self.warnings.append(msg)


def _co():
    # a job board gave this website, so it is known to be this employer (trusted)
    return hi.Company(name="Acme Analytics", key="acme analytics", domain="acme.ie", domain_trusted=True)


def test_apollo_check_rate_limit_never_rejects():
    import asyncio as _a
    c = _co()
    ctx = _FakeCtx([{"people": [], "total_entries": 0}, None, {"people": [], "total_entries": 50}])
    _a.run(hi.apollo_size_and_people(ctx, c))
    assert c.size_status == "" and len(ctx.calls) == 2      # stopped at the failed call; NOT too_big


def _person(org, title="Senior Engineer", pid="p1", first="Ann", last="By***e"):
    """Shape of a free mixed_people/api_search row (checked against Apollo's docs, Oct 2026)."""
    return {"id": pid, "first_name": first, "last_name_obfuscated": last, "title": title,
            "organization": {"name": org, "has_employee_count": True}}


def test_apollo_check_rejects_only_on_positive_proof():
    import asyncio as _a
    c = _co()      # no execs, nobody in range, but its OWN staff found ABOVE the limit -> too big
    ctx = _FakeCtx([{"people": []}, {"people": []}, {"people": [_person("Acme Analytics Ltd")]}])
    _a.run(hi.apollo_size_and_people(ctx, c))
    assert c.size_status == "too_big" and "over 100" in c.reject_reason
    assert ("organization_num_employees_ranges[]", "101,200") in ctx.calls[2]

    c2 = _co()     # in range anywhere, but not with the Ireland filter -> HQ outside Ireland
    ctx2 = _FakeCtx([{"people": []}, {"people": []}, {"people": []}, {"people": [_person("Acme Analytics")]}])
    _a.run(hi.apollo_size_and_people(ctx2, c2))
    assert c2.size_status == "too_big" and "HQ" in c2.reject_reason

    c3 = _co()     # Apollo simply doesn't know it -> stays unverified
    ctx3 = _FakeCtx([{"people": []}, {"people": []}, {"people": []}, {"people": []}])
    _a.run(hi.apollo_size_and_people(ctx3, c3))
    assert c3.size_status == ""


def test_apollo_alumni_never_decide_size():
    """The domain filter matches CURRENT OR PREVIOUS employers. Ex-Acme people who now work at Google
    must not make Acme 'too big'; ex-bank founders must not make a bank 'small'."""
    import asyncio as _a
    c = _co()
    big_alumni = {"people": [_person("Google", pid="g1"), _person("Meta", pid="m1")], "total_entries": 4100}
    ctx = _FakeCtx([{"people": []}, {"people": []}, big_alumni, {"people": []}])
    _a.run(hi.apollo_size_and_people(ctx, c))
    assert c.size_status == "" and not c.reject_reason          # stays unverified, NOT too big

    bank = hi.Company(name="JPMorganChase", key="jpmorganchase", domain="jpmorganchase.com", domain_trusted=True)
    founders = {"people": [_person("Tiny AI Startup", title="CEO", pid="f1"),
                           _person("Data Folk", title="Founder", pid="f2")], "total_entries": 2600}
    ctx = _FakeCtx([founders, {"people": [_person("Tiny AI Startup", pid="f3")]},
                    {"people": [_person("JPMorgan Chase & Co.", pid="j1")]}])
    _a.run(hi.apollo_size_and_people(ctx, bank))
    assert bank.size_status == "too_big" and not bank.apollo_people   # alumni-founders are not its CEOs


def test_apollo_contacts_only_from_this_company():
    import asyncio as _a
    c = _co()
    ctx = _FakeCtx([{"people": [_person("Acme Analytics", title="CTO", pid="a1"),
                                _person("Other Co", title="CEO", pid="o1"),
                                {"id": "x1", "title": "CEO", "first_name": "No", "organization": {}}]}])
    _a.run(hi.apollo_size_and_people(ctx, c))
    assert c.size_status == "verified" and [p["apollo_person_id"] for p in c.apollo_people] == ["a1"]
    assert c.hq_ie is True                                      # found WITH the Irish-HQ filter


def test_apollo_many_roles_checks_too_big_first():
    import asyncio as _a
    c = _co()
    for i in range(hi.BIG_HINT_ROLES):
        c.jobs[f"role {i}"] = {"title": f"role {i}"}
    ctx = _FakeCtx([{"people": [_person("Acme Analytics")]}])
    _a.run(hi.apollo_size_and_people(ctx, c))
    assert c.size_status == "too_big" and len(ctx.calls) == 1     # one call settles a big hirer


def test_apollo_check_verified_path_applies_ireland_filter():
    import asyncio as _a
    c = _co()
    c.size_status = "verified"            # e.g. Indeed said "11 to 50"
    ctx = _FakeCtx([{"people": []}, {"people": [_person("Acme Analytics", title="CEO")]}])
    _a.run(hi.apollo_size_and_people(ctx, c))
    assert ("organization_locations[]", "Ireland") in ctx.calls[0]
    assert c.size_status == "too_big" and "HQ outside Ireland" in c.reject_reason


def test_org_name_matches():
    c = hi.Company(name="Softworks Workforce Solutions", key="softworks workforce solutions")
    assert hi.org_name_matches("Softworks", c)
    assert hi.org_name_matches("SOFTWORKS WORKFORCE SOLUTIONS LIMITED", c)
    assert not hi.org_name_matches("Soft", c)                       # too short to extend
    jp = hi.Company(name="JPMorganChase", key="jpmorganchase")
    assert hi.org_name_matches("JPMorgan Chase & Co.", jp)
    assert not hi.org_name_matches("Google", jp)
    assert not hi.org_name_matches("", jp)


def test_apollo_name_check_is_exact_and_positive_only():
    import asyncio as _a
    kerry = hi.Company(name="Kerry Group", key="kerry")
    ctx = _FakeCtx([{"people": [_person("Kerry Logistics", title="CEO")]}, {"people": [_person("Kerry Logistics")]}])
    _a.run(hi.apollo_name_check(ctx, kerry))
    assert kerry.size_status == "" and not kerry.apollo_people     # a longer name is NOT an exact match
    acme = hi.Company(name="Acme Analytics", key="acme analytics")
    ctx = _FakeCtx([{"people": [_person("Acme Analytics Ltd", title="Founder")]}])
    _a.run(hi.apollo_name_check(ctx, acme))
    assert acme.size_status == "verified" and acme.apollo_people
    assert ("q_keywords", "Acme Analytics") in ctx.calls[0]


def test_verification_cache_rules():
    ctx = _FakeCtx([], hq=True, max_hc=99)
    ctx.company_cache_in = {"ver:acme.ie": {"domain": "acme.ie", "size_status": "verified", "max_hc": 99,
                                            "hq": True, "t": hi._iso()}}
    assert hi._verification_hit(ctx, _co())
    other = hi.Company(name="Kerry Group", key="kerry", domain="kerrygroup.com")
    assert hi._verification_hit(ctx, other) is None                     # keyed by website, not name
    ctx.company_cache_in["ver:acme.ie"]["hq"] = False
    assert hi._verification_hit(ctx, _co()) is None                     # checked without the HQ rule
    ctx.company_cache_in["ver:acme.ie"].update({"hq": True, "max_hc": 200})
    assert hi._verification_hit(ctx, _co()) is None                     # checked against a looser limit
    ctx.company_cache_in["ver:acme.ie"].update({"max_hc": 99, "t": "2026-01-01T00:00:00+00:00"})
    assert hi._verification_hit(ctx, _co()) is None                     # expired


# ── v3 helpers ──────────────────────────────────────────────────────────
@pytest.mark.parametrize("addr,expected", [
    ("Dublin 2, Ireland", True), ("Cork", True), ("London, United Kingdom", False),
    ("San Francisco, CA 94105", False), ("Dublin, OH", False), ("Belfast, Northern Ireland", False),
    ("", None), ("Remote", None),
])
def test_hq_in_ireland(addr, expected):
    assert hi.hq_in_ireland(addr) is expected


def test_slug_stem_and_domain_guesses():
    assert hi.slug_stem("https://ie.linkedin.com/company/meilitravel") == "meilitravel"
    assert hi.slug_stem("https://www.linkedin.com/company/acme-analytics-ltd") == "acmeanalytics"
    assert hi.slug_stem("https://www.linkedin.com/company/it-search---dublin-2") == "itsearchdublin"
    c = hi.Company(name="Meili", key="meili", linkedin="https://ie.linkedin.com/company/meilitravel")
    g = hi.domain_guesses(c)
    assert "meilitravel.com" in g and "meili.ie" in g and len(g) <= 10


def test_parse_smartrecruiters_and_breezy():
    sr = {"content": [{"id": "744", "name": "Data Engineer", "releasedDate": "2026-10-19T10:00:00.000Z",
                       "location": {"city": "Dublin", "country": "ie", "remote": False},
                       "typeOfEmployment": {"label": "Contract"}, "company": {"name": "Acme"}}]}
    j = hi.parse_smartrecruiters(sr, "Acme1")[0]
    assert j["url"] == "https://jobs.smartrecruiters.com/Acme1/744" and "Ireland" in j["location"]
    assert hi.normalize_employment_type(j["employment_raw"], j["title"]) == "Contract" and j["posted_at"] == "2026-10-19"
    bz = [{"name": "ML Engineer", "url": "https://acme.breezy.hr/p/1", "published_date": "2026-10-18T00:00:00Z",
           "type": {"name": "Full-Time"}, "location": {"name": "Galway, IE", "country": {"name": "Ireland"}}}]
    b = hi.parse_breezy(bz, "acme")[0]
    assert b["title"] == "ML Engineer" and "Ireland" in b["location"] and hi.ireland_location(b["location"]) == "IE"
    assert hi.find_ats_refs("https://careers.smartrecruiters.com/Acme1/x") == [("smartrecruiters", "Acme1")]
    assert hi.find_ats_refs("https://acme.breezy.hr/p/1") == [("breezy", "acme")]


def _ctx():
    return hi.RunContext("00000000-0000-0000-0000-00000000000a", hi.RunParams(employment_types=["Contract"]))


def test_ingest_reads_ad_text_hq_and_apply_link():
    ctx, reg = _ctx(), hi.CompanyRegistry()
    hit = hi._ingest(ctx, reg, source="Indeed", title="Data Engineer", company="Kestrel AI", location="Dublin",
                     url="https://ie.indeed.com/viewjob?jk=1", employment_raw="fulltime", assume_ie=True,
                     description="This is a 12 month contract.", company_address="Dublin 2, Ireland",
                     url_direct="https://careers.kestrel.ai/jobs/1")
    c = hit[0]
    assert c.jobs[hit[1]]["employment_type"] == "Contract"      # 'fulltime' schedule, contract ad
    assert c.hq_ie is True and c.apply_domain == "kestrel.ai"
    hit2 = hi._ingest(ctx, reg, source="Indeed", title="Data Analyst", company="Optum", location="Dublin",
                      url="u", employment_raw="contract", assume_ie=True,
                      url_direct="https://careers.unitedhealthgroup.com/job/1")
    assert hit2[0].apply_domain == ""                            # parent group's site is not Optum's
    hit3 = hi._ingest(ctx, reg, source="Indeed", title="Data Scientist", company="Sabeo", location="Dublin",
                      url="u2", employment_raw="contract", assume_ie=True,
                      description="We are recruiting on behalf of our client, a bank.",
                      url_direct="https://boards.greenhouse.io/sabeo/jobs/9")
    assert "on behalf of a client" in hit3[0].agency_reason and ("greenhouse", "sabeo") in hit3[0].ats_refs


def test_ingest_filters_explicit_title_type_even_when_deferred():
    ctx = hi.RunContext("00000000-0000-0000-0000-00000000000b", hi.RunParams(employment_types=["Permanent"]))
    reg = hi.CompanyRegistry()
    assert hi._ingest(ctx, reg, source="LinkedIn", title="Contract Data Engineer", company="A", location="Dublin",
                      url="u", defer_type=True) is None                 # title says contract: dropped now
    assert ctx.stats["filtered"]["employment_type"] == 1
    kept = hi._ingest(ctx, reg, source="LinkedIn", title="Data Engineer", company="C", location="Dublin", url="u",
                      defer_type=True)
    assert kept is not None and kept[0].jobs[kept[1]]["employment_type"] == "Unspecified"   # decided by job page


def test_big_cache_roundtrip_respects_limits():
    ctx = _ctx()
    c = hi.Company(name="Bigco", key="bigco", domain="bigco.com", size_status="too_big",
                   reject_reason="over 100 staff (Apollo)")
    hi._big_cache_put(ctx, c)
    ctx.company_cache_in = dict(ctx.company_cache_out)
    assert "earlier scan" in hi._big_cache_hit(ctx, hi.Company(name="Bigco", key="bigco"))
    ctx.p = hi.RunParams(max_headcount=99)
    hq = hi.Company(name="Ukco", key="ukco", size_status="too_big", reject_reason="HQ in London (job board)")
    hi._big_cache_put(ctx, hq)
    ctx.company_cache_in = dict(ctx.company_cache_out)
    assert hi._big_cache_hit(ctx, hi.Company(name="Ukco", key="ukco"))
    ctx.p = hi.RunParams(hq_ireland_only=False)
    assert hi._big_cache_hit(ctx, hi.Company(name="Ukco", key="ukco")) is None       # HQ rule off -> not a reason
    again = hi.Company(name="Bigco", key="bigco", reject_reason="over 100 staff (Apollo) — earlier scan")
    before = dict(ctx.company_cache_out)
    hi._big_cache_put(ctx, again)
    assert ctx.company_cache_out == before                    # cached proofs are never re-dated


# ── fixes from the independent review (22 Oct 2026) ─────────────────────
def test_verified_company_with_non_icp_irish_staff_is_not_hq_rejected():
    """Review #1: Irish search returns a 'Head of Engineering Operations' (no ICP role) -> still Irish."""
    import asyncio as _a
    c = _co()
    c.size_status = "verified"
    ctx = _FakeCtx([{"people": [_person("Acme Analytics", title="Head of Engineering Operations")]},
                    {"people": [_person("Acme Analytics", title="Head of Engineering Operations")]}])
    _a.run(hi.apollo_size_and_people(ctx, c))
    assert c.size_status == "verified" and c.hq_ie is True and len(ctx.calls) == 1


def test_name_only_matches_keep_ireland_and_group():
    """Review #2: no website -> 'Nimbus Data' (US) must not be verified by 'Nimbus Data Ireland'."""
    import asyncio as _a
    for ours, apollo in [("Nimbus Data", "Nimbus Data Ireland"), ("emagine", "Emagine Ireland Ltd"),
                         ("Ardonagh Group", "Ardonagh Ireland")]:
        c = hi.Company(name=ours, key=hi.company_key(ours))
        ctx = _FakeCtx([{"people": [_person(apollo, title="CEO")]}, {"people": [_person(apollo)]}])
        _a.run(hi.apollo_name_check(ctx, c))
        assert c.size_status == "" and not c.apollo_people, ours
        ctx = _FakeCtx([{"people": [_person(apollo, title="CEO")], "total_entries": 1}])
        _a.run(hi.apollo_job_signal(ctx, [c]))
        assert c.size_status == "" and not c.apollo_people, ours
    assert hi.raw_name_key("Acme Analytics Ltd.") == hi.raw_name_key("ACME ANALYTICS LIMITED") == "acmeanalytics"


def test_job_signal_leaves_companies_with_a_website_to_the_domain_check():
    import asyncio as _a
    c = _co()
    ctx = _FakeCtx([{"people": [_person("Acme Analytics", title="CEO")], "total_entries": 1}])
    _a.run(hi.apollo_job_signal(ctx, [c]))
    assert c.size_status == "" and not c.apollo_people


def test_untrusted_website_never_rejects_alone():
    """Review #5: a Clearbit/Wikidata name-match site may be a foreign namesake's."""
    import asyncio as _a
    c = hi.Company(name="Smart Data", key="smart data", domain="smartdata.com", domain_trusted=False)
    ctx = _FakeCtx([{"people": []}, {"people": []}, {"people": [_person("Smart Data")]}])
    _a.run(hi.apollo_size_and_people(ctx, c))
    assert c.size_status == "" and not c.reject_reason
    ok = hi.Company(name="Smart Data", key="smart data", domain="smartdata.com", domain_trusted=False)
    ctx = _FakeCtx([{"people": [_person("Smart Data", title="CTO")]}])
    _a.run(hi.apollo_size_and_people(ctx, ok))
    assert ok.size_status == "verified"                         # but it can still VERIFY


def test_org_name_extensions_are_whole_generic_words():
    """Review #6."""
    stripe = hi.Company(name="Stripe", key="stripe")
    kerry = hi.Company(name="Kerry Group", key="kerry")
    assert not hi.org_name_matches("Stripes Digital", stripe)
    assert not hi.org_name_matches("Kerry Logistics", kerry)
    assert hi.org_name_matches("Stripe Ireland", stripe)
    assert hi.org_name_matches("Stripe Technologies", stripe)
    two = hi.Company(name="Acme Analytics", key="acme analytics")
    assert hi.org_name_matches("Acme Analytics Partners", two)       # 2-word base: any extension
