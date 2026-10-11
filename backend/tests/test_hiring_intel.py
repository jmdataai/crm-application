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


def test_phones_from_poll_payload():
    payload = {"status": "success", "people": [
        {"id": "p1", "status": "success", "phone_numbers": [{"sanitized_number": "+353861234567", "type_cd": "mobile"}]},
        {"id": "p2", "status": "success", "phone_numbers": []},
    ]}
    assert hi._phones_from_poll(payload) == {"p1": "+353861234567", "p2": None}


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
        {"id": "p1", "name": "Jane Doe", "title": "CTO", "role": "CTO", "email": "jane@acme.ie", "phone": None,
         "phone_status": "not_requested", "linkedin_url": "https://linkedin.com/in/jane"},
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


def test_build_rows_company_without_contacts_keeps_one_row():
    c = hi.Company(name="Solo", key="solo")
    c.add_job(hi.Job("Data Analyst", "u", "Cork", "LinkedIn", "Permanent", "Analytics / BI"))
    _, leads = hi.build_rows("run1", [c], {}, {}, set(), "2026-10-10T00:00:00+00:00")
    assert len(leads) == 1 and leads[0]["person_key"] == "" and leads[0]["is_new_company"] is True


# ── Params ──────────────────────────────────────────────────────────────
def test_run_params_validation():
    p = hi.RunParams()
    assert p.employment_types == ["Permanent", "Contract"] and p.max_headcount == 99 and p.reveal_phones is False
    assert hi.RunParams(employment_types=["contract"]).employment_types == ["Contract"]
    with pytest.raises(Exception):
        hi.RunParams(employment_types=["internship"])
    with pytest.raises(Exception):
        hi.RunParams(sources=["myspace"])
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
    rows = [{"email": "a@b.ie", "phone": "+3531", "phone_status": "found"},
            {"email": None, "phone": None, "phone_status": "pending"}, {}]
    assert hi.contact_summary(rows) == {"with_email": 1, "with_phone": 1, "phones_pending": 1}
