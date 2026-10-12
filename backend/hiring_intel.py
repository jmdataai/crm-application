"""
hiring_intel.py — Irish Data & AI hiring signals -> decision-maker contact sheet.

WHAT ONE RUN DOES
    1. DISCOVER   current Data & AI openings in Ireland from
                    * LinkedIn public job search (guest endpoint, no login)
                    * Apollo company search (companies with matching open roles)
                    * Jooble job-portal API (optional, needs JOOBLE_API_KEY)
    2. QUALIFY    each hiring company via Apollo: headcount < 100, Irish HQ,
                  not a recruitment agency, not us.
    3. WEBSITES   read each qualifying company's own careers page / ATS board
                  (Greenhouse, Lever, Ashby, Workable, Recruitee, Personio,
                  BambooHR, schema.org JobPosting) for roles LinkedIn missed.
    4. CONTACTS   find CEO / CTO / Founder / Co-founder / Data head in Apollo
                  (people search is free), enrich their email (1 credit each)
                  and, only when asked, phone (Apollo charges ~8 credits).
    5. SAVE       one row per job and one row per contact, de-duplicated by
                  database constraints; keep only the newest 5 runs.

DESIGN RULES
    * NEVER RAISES INTO A REQUEST. Source failures (LinkedIn 429, Apollo 403,
      a dead careers page) are recorded on the run as warnings; the run
      carries on with whatever the other sources produced.
    * CREDIT AWARE. Every Apollo call that costs credits is capped by run
      parameters, and contact data bought in a previous retained run is
      re-used instead of being bought twice.
    * FILTER LOCALLY. Apollo silently ignores filter values it does not
      recognise (see platform notes), so every filter sent to Apollo is
      re-applied here on the returned data.
    * ONE ACTIVE RUN. Enforced by a partial unique index, not by app logic.
    * STORAGE BOUNDED. Only MAX_RUNS_KEPT runs survive; children cascade.

Env vars (HuggingFace Space secrets):
    APOLLO_API_KEY       (already used by integrations.py)
    JOOBLE_API_KEY       optional — enables the Jooble job-portal source
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import os
import random
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

import integrations as _integ

log = logging.getLogger("hiring_intel")
# httpx logs every request URL at INFO; Jooble's API key is part of its URL path.
logging.getLogger("httpx").setLevel(logging.WARNING)

# ════════════════════════════════════════════════════════════════════════
# Constants
# ════════════════════════════════════════════════════════════════════════
MAX_RUNS_KEPT = 5
ORPHAN_AFTER_SECONDS = 120          # no heartbeat for this long + not in this process -> orphaned
EVENTS_KEPT = 60
TICK_SECONDS = 4

APOLLO_BASE = _integ.APOLLO_BASE
LINKEDIN_SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
LINKEDIN_IRELAND_GEO_ID = "104738515"
LINKEDIN_MAX_PAGES = 4
JOOBLE_URL = os.environ.get("JOOBLE_API_URL", "https://jooble.org/api/").rstrip("/") + "/"

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# Searches that together cover the Data & AI market without hundreds of calls.
SEARCH_KEYWORDS = [
    "data engineer", "data scientist", "data analyst", "analytics engineer",
    "machine learning engineer", "AI engineer", "MLOps", "data architect",
    "business intelligence", "head of data", "generative AI", "power bi",
]
APOLLO_JOB_TITLES = [
    "data engineer", "data scientist", "data analyst", "analytics engineer",
    "machine learning", "ai engineer", "mlops", "data architect",
    "business intelligence", "head of data", "artificial intelligence",
]
APOLLO_EMPLOYEE_RANGES = ["1,10", "11,20", "21,50", "51,100"]
APOLLO_ICP_TITLES = [
    "CEO", "Chief Executive Officer", "Managing Director",
    "CTO", "Chief Technology Officer",
    "Founder", "Co-Founder",
    "Chief Data Officer", "Chief AI Officer", "Head of Data", "Director of Data",
    "VP Data", "Head of Analytics", "Head of AI", "Head of Data Science",
    "Head of Data Engineering", "Head of Machine Learning", "Director of Analytics",
]

EMPLOYMENT_TYPES = ("Permanent", "Contract")
ALL_SOURCES = ("linkedin", "apollo", "websites", "jooble")

# Our own company must never appear as a prospect.
OWN_COMPANY_KEYS = {"jm data talent", "jmdatatalent", "jm data"}


# ════════════════════════════════════════════════════════════════════════
# Pure helpers (unit-tested in tests/test_hiring_intel.py)
# ════════════════════════════════════════════════════════════════════════
def _ascii(s: Any) -> str:
    return unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()


def clean_text(s: Any, limit: int = 300) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()[:limit]


# ── Title classification ────────────────────────────────────────────────
_EXCLUDE_TITLE = re.compile(
    r"\b(?:data\s*entry|data\s*cent(?:er|re)s?|datacent(?:er|re)s?|data\s*protection|data\s*privacy"
    r"|ai\s*(?:trainer|tutor|rater|annotator|evaluator|writer)|annotat\w*|data\s*labell?\w*"
    r"|transcri\w*|internships?|interns?|work\s*experience|placement\s*student|summer\s*student"
    r"|apprentice\w*)\b",
    re.I,
)
_NON_TECH = re.compile(
    r"\b(?:sales|account\s*(?:executive|manager|director)|business\s*development|bdr|sdr|marketing\s*manager"
    r"|recruit\w*|talent\s*acquisition|customer\s*success|customer\s*support|solicitor|lawyer|legal|counsel"
    r"|human\s*resources|copywriter|content\s*writer|teacher|lecturer|nurse)\b",
    re.I,
)
_TECH_ROLE_WORD = re.compile(
    r"\b(?:engineer\w*|scientist|analyst|architect|developer|modell?er|head\s+of\s+data|data\s+lead)\b", re.I)

# (category, pattern, strong). Order matters: first match wins.
_CATEGORY_RULES: List[Tuple[str, "re.Pattern[str]", bool]] = [
    ("Data Leadership", re.compile(
        r"\b(?:head|director|vp|vice\s*president|chief)\s+(?:of\s+)?(?:data|analytics|ai|artificial\s+intelligence"
        r"|machine\s+learning|ml|insights|business\s+intelligence|bi)\b"
        r"|\bchief\s+(?:data|ai|analytics)\s+officer\b|\b(?:data|analytics)\s+(?:director|leader)\b", re.I), True),
    ("AI / ML", re.compile(
        r"\b(?:machine\s*learning|ml\s*(?:ops|engineer\w*|scientist|platform|researcher)|mlops|llmops|deep\s*learning"
        r"|computer\s*vision|nlp|natural\s*language|llms?|gen(?:erative)?[\s-]*ai|genai|artificial\s*intelligence"
        r"|ai\s*(?:engineer\w*|scientist|developer|architect|researcher|specialist|lead|ops|platform|product"
        r"|solutions?|consultant|research|automation|agent\w*)|applied\s*scientist|prompt\s*engineer\w*"
        r"|reinforcement\s*learning)\b", re.I), True),
    ("Data Science", re.compile(
        r"\b(?:data\s*scien\w*|decision\s*scien\w*|statistician|quantitative\s*analyst"
        r"|quant\s*(?:analyst|researcher|developer)|econometric\w*)\b", re.I), True),
    ("Data Engineering", re.compile(
        r"\b(?:data\s*(?:engineer\w*|platform|architect\w*|ops|warehous\w*|integration|modell?\w*|infrastructure"
        r"|pipeline\w*|developer|migration|lake\w*)|analytics\s*engineer\w*|big\s*data|etl|elt|dataops"
        r"|databricks|snowflake|spark|kafka|dbt|lakehouse)\b", re.I), True),
    ("Analytics / BI", re.compile(
        r"\b(?:data\s*(?:\w+\s+)?analy\w*|business\s*intelligence|bi\s*(?:developer|analyst|engineer|consultant"
        r"|lead|manager|specialist|architect)|power\s*bi|tableau|looker|qlik|analytics|insights?\s*analyst"
        r"|reporting\s*analyst|product\s*analyst|marketing\s*analyst|web\s*analyst)\b", re.I), True),
    ("Data Governance", re.compile(
        r"\b(?:data\s*(?:governance|quality|steward\w*|management|catalog\w*|owner|strategy)|master\s*data|mdm)\b",
        re.I), True),
    # Weak: a bare "AI"/"ML" token. Case-sensitive so "Retail", "Email" never match.
    ("AI / ML", re.compile(r"(?<![A-Za-z])(?:AI|A\.I\.|ML|Gen\s?AI)(?![A-Za-z])"), False),
]


def classify_title(title: str) -> Optional[str]:
    """Return the Data/AI category of a job title, or None if it is not a Data/AI role."""
    t = clean_text(title, 250)
    if not t or _EXCLUDE_TITLE.search(t):
        return None
    for category, rx, _strong in _CATEGORY_RULES:
        if rx.search(t):
            # "AI Sales Executive", "Account Manager - Data Platform": a non-tech
            # function that merely mentions Data/AI is not a data hire.
            if _NON_TECH.search(t) and not _TECH_ROLE_WORD.search(t):
                return None
            return category
    return None


# ── Employment type ─────────────────────────────────────────────────────
_TITLE_CONTRACT = re.compile(
    r"\b(?:contract(?:or)?|freelanc\w*|temp|temporary|fixed[\s-]*term|ftc|interim|day[\s-]*rate|locum"
    r"|\d{1,2}[\s-]*months?)\b", re.I)


def normalize_employment_type(raw: Any, title: str = "") -> str:
    """Map any ATS / portal vocabulary to Permanent | Contract | Part-time | Internship | Unspecified."""
    if isinstance(raw, (list, tuple)):
        raw = " ".join(str(x) for x in raw)
    t = _ascii(raw).lower()
    tl = _ascii(title).lower()
    if re.search(r"\b(?:intern|internship|trainee|apprentice\w*|graduate\s+programme?)\b", f"{t} {tl}"):
        return "Internship"
    if _TITLE_CONTRACT.search(tl):
        return "Contract"
    if re.search(r"contract|temporary|\btemp\b|fixed|freelanc|interim|seasonal|consultant", t):
        return "Contract"
    if re.search(r"part[\s_-]*time|parttime", t):
        return "Part-time"
    if re.search(r"full[\s_-]*time|fulltime|permanent|regular|\bperm\b|employee", t):
        return "Permanent"
    return "Unspecified"


# ── Ireland location check ──────────────────────────────────────────────
_IE_COUNTIES = ("carlow|cavan|clare|cork|donegal|dublin|galway|kerry|kildare|kilkenny|laois|leitrim|limerick"
                "|longford|louth|mayo|meath|monaghan|offaly|roscommon|sligo|tipperary|waterford|westmeath"
                "|wexford|wicklow")
_IE_RE = re.compile(
    r"\b(?:ireland|eire|republic\s+of\s+ireland|" + _IE_COUNTIES +
    r"|athlone|letterkenny|dundalk|drogheda|maynooth|naas|bray|swords|tralee|ennis|shannon|castlebar"
    r"|mullingar|navan|portlaoise|tullamore|blanchardstown|sandyford|leopardstown|dun\s+laoghaire"
    r"|citywest|carrigtwohill|ringaskiddy|nenagh|thurles|clonmel|dungarvan|gorey|arklow|greystones"
    r"|newbridge|celbridge|leixlip|balbriggan|ashbourne|trim|kells|cavan|monaghan|ballina)\b",
    re.I)
_NI_RE = re.compile(
    r"\b(?:northern\s+ireland|belfast|derry|londonderry|newry|lisburn|armagh|fermanagh|tyrone"
    r"|co\.?\s*(?:antrim|down)|county\s+(?:antrim|down))\b", re.I)
_ROI_STRONG = re.compile(r"\b(?:republic\s+of\s+ireland|dublin|cork|galway|limerick|waterford|kilkenny)\b", re.I)
_US_DUBLIN = re.compile(
    r"\b(?:ohio|california|georgia|virginia|texas|pennsylvania|united\s+states|usa)\b|,\s*(?:oh|ca|ga|va|tx|pa)\b",
    re.I)


def ireland_location(loc: Any) -> str:
    """'IE' for Republic of Ireland, 'NI' for Northern Ireland, '' otherwise."""
    l = _ascii(loc).strip()
    if not l:
        return ""
    if any(re.fullmatch(r"(?i)\s*(?:ie|irl)\s*", part) for part in re.split(r"[;,|/]", l)):
        if not _NI_RE.search(l):
            return "IE"
    if _NI_RE.search(l) and not _ROI_STRONG.search(l):
        return "NI"
    if _IE_RE.search(l):
        if re.search(r"(?i)\bdublin\b", l) and _US_DUBLIN.search(l) and not re.search(r"(?i)\bireland\b", l):
            return ""
        return "IE"
    return ""


def is_irish_country(country: Any) -> bool:
    c = _ascii(country).strip().lower()
    return c in {"ireland", "ie", "irl", "republic of ireland", "eire"}


# ── Company identity ────────────────────────────────────────────────────
_LEGAL_TOKENS = {
    "ltd", "limited", "dac", "plc", "inc", "llc", "gmbh", "uc", "clg", "teoranta", "teo", "ulc",
    "unlimited", "co", "corp", "corporation", "holdings", "holding", "group", "ireland", "irl",
    "europe", "emea", "international", "the", "bv", "sa", "ag", "srl", "pty",
}


def company_key(name: Any) -> str:
    """Stable, punctuation-free key for a company name ("Acme Analytics Ltd." -> "acme analytics")."""
    s = _ascii(name).lower()
    s = s.split(" | ")[0].split("|")[0]          # "Barden | B Corp" -> "barden" (LinkedIn taglines)
    s = s.replace("&", " and ")
    s = re.sub(r"\(.*?\)", " ", s)
    tokens = re.findall(r"[a-z0-9]+", s)
    while tokens and tokens[-1] in _LEGAL_TOKENS:
        tokens.pop()
    while tokens and tokens[0] == "the":
        tokens.pop(0)
    return " ".join(tokens)


def clean_domain(url_or_domain: Any) -> str:
    s = str(url_or_domain or "").strip().lower()
    if not s:
        return ""
    if "://" not in s:
        s = "http://" + s
    host = (urlparse(s).hostname or "").strip(".")
    if host.startswith("www."):
        host = host[4:]
    return host if "." in host else ""


def linkedin_company_slug(url: Any) -> str:
    m = re.search(r"linkedin\.com/company/([^/?#]+)", str(url or ""), re.I)
    return m.group(1).lower() if m else ""


def _slug_norm(slug: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (slug or "").lower())


def slugs_conflict(a: Any, b: Any) -> bool:
    """Two LinkedIn company URLs that name DIFFERENT pages = two different companies, whatever their names.
    This is what stops 'emagine' (Danish consultancy, /company/emagine) being merged with a small Irish
    'Emagine' in Apollo. Numeric page ids can't be compared with vanity names, so they never conflict."""
    sa, sb = _slug_norm(linkedin_company_slug(a)), _slug_norm(linkedin_company_slug(b))
    if not sa or not sb or sa.isdigit() or sb.isdigit():
        return False
    return sa != sb


def linkedin_locale(url: Any) -> str:
    """'dk' for https://dk.linkedin.com/company/emagine; '' for www / no subdomain.
    LinkedIn serves a company page on its home-country subdomain, so a non-Irish one is an HQ hint."""
    m = re.match(r"(?i)\s*(?:https?://)?([a-z]{2})\.linkedin\.com/", str(url or ""))
    return m.group(1).lower() if m else ""


# ── Staffing / recruitment / HR firms ───────────────────────────────────
# These post Data & AI roles on behalf of clients, so they flood LinkedIn results but are never
# prospects. They are caught by five independent signals, cheapest first:
#   1. the company name             ("Sigmar Recruitment", "DOMINO HR", "IT Search")
#   2. the website domain           (rittsrecruitment.ie)
#   3. the LinkedIn company slug    (/company/sabeoitresourcing)
#   4. Apollo industry / keywords / description   ("staffing & recruiting")
#   5. the LinkedIn job page        (Industries: "Staffing and Recruiting", "on behalf of our client")
_AGENCY_NAME = re.compile(
    r"\b(?:recruit\w*|staffing|resourcing|headhunt\w*|personnel|placements?|selection"
    r"|talent\s+(?:solutions|partners|group|search|acquisition|international|hub|network)"
    r"|executive\s+search|(?:it|tech|technical|technology|executive|talent|data|digital|engineering)\s+search"
    r"|search\s+(?:partners|group|associates|consultants)|hr(?!\s+(?:tech|software|platform|analytics|systems))|human\s+resources"
    r"|employment\s+(?:agency|solutions|services))\b", re.I)
# On a domain / slug with separators removed ("it-search---dublin-2" -> "itsearchdublin2").
_AGENCY_COMPACT = re.compile(
    r"recruit|staffing|resourcing|headhunt|personnel|talentsearch|talentsolutions|talentpartners"
    r"|execsearch|executivesearch|itsearch|techsearch|datasearch|digitalsearch", re.I)
# Whole tokens of a domain / slug ("domino-hr-international-ireland", "acme-jobs.ie").
_AGENCY_TOKENS = {"hr", "jobs", "job", "careers", "recruitment", "recruiters", "staffing", "selection",
                  "placements", "headhunters", "resourcing", "personnel"}
_AGENCY_KNOWN = {
    "cpl", "cpl resources", "hays", "morgan mckinley", "harvey nash", "sigmar", "sigmar recruitment",
    "reperio human capital", "stelfox", "collins mcnicholas", "brightwater", "osborne", "computer futures",
    "jefferson frank", "nigel frank", "frank recruitment", "abrivia", "hunter savage", "lincoln",
    "lincoln recruitment", "excel", "hamilton barnes", "code red", "jobbio", "robert walters", "michael page",
    "page personnel", "randstad", "adecco", "manpower", "hirect", "solas it", "lex consultancy", "berkley",
    "eden", "the panel", "next generation", "franklin fitch", "prosperity", "barden", "sabeo", "ritts",
    "it search", "domino hr", "domino hr international", "emagine", "experis", "modis", "akkodis",
    "gi group", "kelly services", "hudson", "orion", "orion group", "spring", "real staffing", "nextgen",
    "kforce", "allegis", "aerotek", "teksystems", "robert half", "walters people", "hydrogen", "oscar",
    "salt", "venquis", "understanding recruitment", "tenth revolution", "cartesian", "huxley",
}
_AGENCY_INDUSTRY = re.compile(
    r"staffing|recruit|human\s+resources|employment\s+(?:services|agenc)|executive\s+search|headhunt", re.I)
_AGENCY_DESCRIPTION = re.compile(
    r"\b(?:recruitment|recruiting|staffing|talent|executive\s+search|headhunting|resourcing)\s+"
    r"(?:agency|agencies|consultancy|consultancies|consultants?|firm|company|specialists?|business|partner)\b"
    r"|\bwe\s+(?:place|recruit|source)\s+(?:candidates|talent|professionals|contractors)\b"
    r"|\bcontract(?:or)?\s+staffing\b|\bpermanent\s+(?:and|&)\s+contract\s+recruitment\b", re.I)
_AGENCY_KEYWORDS = re.compile(
    r"^(?:recruitment|recruiting|staffing|staffing\s*(?:&|and)\s*recruiting|talent\s+acquisition|executive\s+search"
    r"|headhunting|it\s+recruitment|tech(?:nology)?\s+recruitment|contract\s+staffing|permanent\s+recruitment"
    r"|recruitment\s+agency|recruitment\s+services|staffing\s+services|rpo|recruitment\s+process\s+outsourcing)$", re.I)
# Wording that marks a job ad as posted for someone else.
_CLIENT_STRONG = re.compile(
    r"\bon\s+behalf\s+of\s+(?:our|a|my|an|one\s+of\s+our)\s+(?:client|leading|well|growing|global|innovative)"
    r"|\bmy\s+client\b|\b(?:recruitment|staffing)\s+(?:agency|consultancy|consultancies)\b"
    r"|\bemployment\s+agency\b|\bexclusively\s+(?:partnered|partnering|retained)\b"
    r"|\b(?:is|are)\s+(?:exclusively\s+)?recruiting\s+on\s+behalf\b", re.I)
_CLIENT_WEAK = re.compile(r"\bour\s+client\b|\bthe\s+client\s+is\b|\bclient\s+(?:is|are)\s+(?:a|an|seeking|looking)\b",
                          re.I)


def _host_or_slug_agency(value: str) -> bool:
    v = _ascii(value).lower()
    if not v:
        return False
    compact = re.sub(r"[^a-z0-9]", "", v)
    if _AGENCY_COMPACT.search(compact):
        return True
    return bool(_AGENCY_TOKENS & set(re.split(r"[^a-z0-9]+", v)))


def agency_reason(name: Any = "", industry: Any = "", domain: Any = "", linkedin: Any = "",
                  keywords: Any = None, description: Any = "", job_industry: Any = "",
                  job_text: Any = "") -> str:
    """Why a company looks like a staffing / recruitment / HR firm ('' when it doesn't)."""
    n = _ascii(name)
    if company_key(n) in _AGENCY_KNOWN:
        return "known recruitment firm"
    if _AGENCY_NAME.search(n) or _AGENCY_COMPACT.search(re.sub(r"[^a-z0-9]", "", n.lower())):
        return "recruitment/HR name"
    if _AGENCY_INDUSTRY.search(_ascii(industry)):
        return f"industry: {clean_text(industry, 60)}"
    if _AGENCY_INDUSTRY.search(_ascii(job_industry)):
        return f"LinkedIn industry: {clean_text(job_industry, 60)}"
    if _host_or_slug_agency(clean_domain(domain)):
        return f"website {clean_domain(domain)}"
    slug = linkedin_company_slug(linkedin)
    if slug and _host_or_slug_agency(slug):
        return f"LinkedIn page /{slug}"
    kws = keywords if isinstance(keywords, (list, tuple)) else re.split(r"[,;|]", str(keywords or ""))
    hits = [k for k in (clean_text(x, 60) for x in kws) if k and _AGENCY_KEYWORDS.match(k)]
    if len(hits) >= 2 or (hits and len([k for k in kws if str(k).strip()]) <= 4):
        return f"Apollo keywords: {', '.join(hits[:2])}"
    if _AGENCY_DESCRIPTION.search(_ascii(description)):
        return "describes itself as a recruitment firm"
    jt = _ascii(job_text)
    if _CLIENT_STRONG.search(jt) or len(_CLIENT_WEAK.findall(jt)) >= 2:
        return "job ad posted on behalf of a client"
    return ""


def is_agency(name: Any, industry: Any = "", domain: Any = "", linkedin: Any = "") -> bool:
    return bool(agency_reason(name, industry, domain, linkedin))


# Employers that post many Data/AI roles in Ireland but are far over 100 staff. Screening them out
# BEFORE the Apollo lookup saves a credit each and stops them eating the lookup budget.
# Exact company_key match only, so "Kerry" does not catch "Kerry Analytics".
_KNOWN_LARGE = {
    "google", "alphabet", "meta", "facebook", "microsoft", "amazon", "amazon web services", "aws", "apple",
    "linkedin", "salesforce", "workday", "stripe", "intercom", "hubspot", "tiktok", "bytedance", "intel", "ibm",
    "oracle", "sap", "dell", "dell technologies", "hp", "hewlett packard enterprise", "cisco", "vmware",
    "broadcom", "qualcomm", "analog devices", "mastercard", "visa", "paypal", "fidelity", "fidelity investments",
    "fidelity international", "state street", "citi", "citibank", "citigroup", "jpmorgan chase", "jpmorgan",
    "j p morgan", "jp morgan", "bank of america", "barclays", "bny", "bny mellon", "northern trust",
    "deutsche bank", "aib", "allied irish banks", "bank of ireland", "ptsb", "permanent tsb",
    "central bank of ireland", "accenture", "deloitte", "pwc", "pricewaterhousecoopers", "ey", "ernst and young",
    "kpmg", "grant thornton", "bdo", "forvis mazars", "mazars", "capgemini", "cognizant", "infosys",
    "tata consultancy services", "tcs", "wipro", "hcltech", "hcl technologies", "version 1", "fexco", "pfizer",
    "johnson and johnson", "medtronic", "boston scientific", "abbott", "stryker", "eli lilly", "msd", "novartis",
    "roche", "icon", "iqvia", "ryanair", "aer lingus", "vodafone", "eir", "three", "esb", "bord gais energy",
    "hse", "health service executive", "an post", "crh", "kerry", "glanbia", "smurfit kappa", "smurfit westrock",
    "flutter", "flutter entertainment", "paddy power", "betfair", "primark", "tesco", "aldi", "lidl", "aviva",
    "zurich", "axa", "allianz", "fbd", "irish life", "new ireland assurance", "chubb", "aig", "workhuman",
    "kaseya", "fenergo", "optum", "unitedhealth", "elavon", "global payments", "fiserv", "worldline",
}


def is_known_large(name: Any) -> bool:
    return company_key(name) in _KNOWN_LARGE


def lookup_budget(max_companies: int) -> int:
    """How many hiring companies may be looked up in Apollo per scan (~1 credit each, cached 21 days).
    Deliberately decoupled from max_companies: most companies looked up turn out to be too big,
    so finding N small ones needs several times N lookups. Mirrored in HiringIntel.js (creditHint)."""
    return min(60, max(20, 3 * int(max_companies)))


# ── Job identity / de-duplication ───────────────────────────────────────
_TITLE_NOISE = {
    "m", "f", "d", "w", "x", "remote", "hybrid", "onsite", "on", "site", "ireland", "dublin", "cork",
    "galway", "limerick", "contract", "contractor", "permanent", "perm", "fte", "ftc", "full", "time",
    "fulltime", "part", "freelance", "months", "month", "in", "based", "the", "job", "role", "vacancy",
    "urgent", "new", "ie", "irl",
}


def title_key(title: Any) -> str:
    s = _ascii(title).lower().replace("&", " and ")
    s = re.sub(r"[\(\[].*?[\)\]]", " ", s)
    tokens = [t for t in re.findall(r"[a-z0-9+#]+", s) if t not in _TITLE_NOISE and not t.isdigit()]
    s = " ".join(tokens)
    s = s.replace("snr", "senior").replace("sr ", "senior ").replace("jnr", "junior").replace("jr ", "junior ")
    return s.strip()


def job_fingerprint(ckey: str, title: str) -> str:
    return f"{ckey}|{title_key(title)}"


# ── Dates ───────────────────────────────────────────────────────────────
def to_date_str(v: Any) -> Optional[str]:
    """Best-effort YYYY-MM-DD from ISO strings, epoch seconds/ms or date objects."""
    if v is None or v == "":
        return None
    try:
        if isinstance(v, (int, float)):
            ts = float(v) / (1000.0 if v > 10_000_000_000 else 1.0)
            return datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
        if isinstance(v, (date, datetime)):
            return (v.date() if isinstance(v, datetime) else v).isoformat()
        s = str(v).strip()
        m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
        if m:
            date.fromisoformat(m.group(1))
            return m.group(1)
        if s.isdigit():
            return to_date_str(int(s))
    except Exception:
        return None
    return None


# ── Contacts ────────────────────────────────────────────────────────────
_ICP_RULES: List[Tuple[str, int, "re.Pattern[str]"]] = [
    ("Data Head", 1, re.compile(
        r"\bchief\s+(?:data|analytics|ai|artificial\s+intelligence)(?:\s+(?:and|&)\s+\w+)?\s+officer\b"
        r"|\b(?:head|director|vp|vice\s*president|svp|evp|global\s+head)\s+(?:of\s+)?(?:data|analytics|ai"
        r"|artificial\s+intelligence|machine\s+learning|ml|insights|business\s+intelligence|bi)\b"
        r"|\b(?:data|analytics|ai)\s+(?:director|head)\b", re.I)),
    ("CTO", 2, re.compile(r"\b(?:cto|chief\s+technology\s+officer|chief\s+technical\s+officer)\b", re.I)),
    ("CEO", 3, re.compile(r"\b(?:ceo|chief\s+executive(?:\s+officer)?|managing\s+director)\b", re.I)),
    ("Co-Founder", 4, re.compile(r"\bco[\s-]?founder\b", re.I)),
    ("Founder", 4, re.compile(r"\bfounder\b", re.I)),
]


def classify_icp(title: Any) -> Tuple[Optional[str], int]:
    """Return (ICP role, rank) — lower rank = better person to call about a data hire."""
    t = clean_text(title, 200)
    for role, rank, rx in _ICP_RULES:
        if rx.search(t):
            return role, rank
    return None, 99


def clean_email(v: Any) -> Optional[str]:
    """Apollo returns placeholders such as email_not_unlocked@domain.com for locked emails."""
    s = str(v or "").strip().lower()
    if not s or "@" not in s or " " in s:
        return None
    if "not_unlocked" in s or s.endswith("@domain.com") or s.startswith("email_"):
        return None
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", s):
        return None
    return s


def pick_phone(numbers: Any) -> Optional[str]:
    """Prefer a mobile, then a direct dial, then anything valid. Skips numbers Apollo marks invalid."""
    if not isinstance(numbers, list):
        return None
    best, best_score = None, 99
    for n in numbers:
        if not isinstance(n, dict):
            continue
        num = n.get("sanitized_number") or n.get("raw_number") or n.get("number")
        if not num:
            continue
        status = str(n.get("status_cd") or n.get("status") or "").lower()
        if "invalid" in status:
            continue
        kind = str(n.get("type_cd") or n.get("type") or "").lower()
        score = 0 if "mobile" in kind else 1 if "direct" in kind or "work" in kind else 2
        if score < best_score:
            best, best_score = str(num).strip(), score
    return best


# ── LinkedIn guest search HTML ──────────────────────────────────────────
def parse_linkedin_cards(html: str) -> List[Dict[str, Any]]:
    """Parse the guest job-search fragment into dicts. Tolerates layout variants."""
    out: List[Dict[str, Any]] = []
    if not html or "<" not in html:
        return out
    soup = BeautifulSoup(html, "html.parser")
    for card in soup.select(".base-search-card, .job-search-card"):
        title_el = card.select_one(".base-search-card__title")
        if not title_el:
            continue
        urn = card.get("data-entity-urn") or ""
        job_id = urn.rsplit(":", 1)[-1] if urn else ""
        link_el = card.select_one("a.base-card__full-link") or (card if card.name == "a" else None)
        href = (link_el.get("href") if link_el else "") or ""
        if not job_id:
            m = re.search(r"-(\d{6,})(?:\?|$|/)", href)
            job_id = m.group(1) if m else ""
        url = f"https://www.linkedin.com/jobs/view/{job_id}/" if job_id else href.split("?")[0]
        comp_el = card.select_one(".base-search-card__subtitle")
        comp_a = comp_el.select_one("a") if comp_el else None
        loc_el = card.select_one(".job-search-card__location")
        time_el = card.select_one("time")
        company = clean_text(comp_el.get_text(" ") if comp_el else "", 160)
        out.append({
            "id": job_id,
            "title": clean_text(title_el.get_text(" "), 200),
            "company": company,
            "company_url": ((comp_a.get("href") or "").split("?")[0]) if comp_a else "",
            "location": clean_text(loc_el.get_text(" ") if loc_el else "", 160),
            "url": url,
            "posted_at": to_date_str(time_el.get("datetime")) if time_el else None,
        })
    return out


# ── Careers pages / ATS boards ──────────────────────────────────────────
_ATS_PATTERNS: List[Tuple[str, "re.Pattern[str]"]] = [
    ("greenhouse", re.compile(r"(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io/(?:embed/job_board(?:/js)?\?for=)?([A-Za-z0-9_-]+)", re.I)),
    ("lever",      re.compile(r"jobs\.(?:eu\.)?lever\.co/([A-Za-z0-9_.-]+)", re.I)),
    ("ashby",      re.compile(r"jobs\.ashbyhq\.com/([A-Za-z0-9_.%-]+)", re.I)),
    ("workable",   re.compile(r"apply\.workable\.com/([A-Za-z0-9_-]+)", re.I)),
    ("recruitee",  re.compile(r"([A-Za-z0-9-]+)\.recruitee\.com", re.I)),
    ("personio",   re.compile(r"([A-Za-z0-9-]+)\.jobs\.personio\.(?:de|com)", re.I)),
    ("bamboohr",   re.compile(r"([A-Za-z0-9-]+)\.bamboohr\.com", re.I)),
]
_ATS_SLUG_BLOCKLIST = {"api", "j", "embed", "www", "jobs", "careers", "static", "assets", "app", "widget", "v1"}
_CAREERS_LINK = re.compile(
    r"career|/jobs?\b|join[-_\s]?(?:us|the[-_\s]?team|our[-_\s]?team)|work[-_\s]?(?:with|for)[-_\s]?us|vacanc|hiring|open[-_\s]?(?:roles|positions)",
    re.I)


def find_ats_refs(html: str) -> List[Tuple[str, str]]:
    refs: List[Tuple[str, str]] = []
    for ats, rx in _ATS_PATTERNS:
        for m in rx.finditer(html or ""):
            slug = m.group(1).strip().strip(".")
            if slug.lower() in _ATS_SLUG_BLOCKLIST or len(slug) < 2:
                continue
            if (ats, slug) not in refs:
                refs.append((ats, slug))
    return refs


def find_careers_links(html: str, base_url: str) -> List[str]:
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    base_host = clean_domain(base_url)
    links: List[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        text = clean_text(a.get_text(" "), 80)
        if not (_CAREERS_LINK.search(href) or _CAREERS_LINK.search(text)):
            continue
        absu = urljoin(base_url, href).split("#")[0]
        if not absu.startswith("http"):
            continue
        if clean_domain(absu) != base_host:
            continue
        if absu not in links:
            links.append(absu)
    return links[:3]


def parse_jsonld_jobs(html: str, page_url: str) -> List[Dict[str, Any]]:
    """schema.org JobPosting blocks — many custom careers pages publish these for Google Jobs."""
    out: List[Dict[str, Any]] = []
    for m in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html or "", re.S | re.I):
        try:
            data = json.loads(m.group(1).strip())
        except Exception:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(node)
                continue
            if not isinstance(node, dict):
                continue
            if "@graph" in node:
                stack.extend(node["@graph"] if isinstance(node["@graph"], list) else [node["@graph"]])
            types = node.get("@type")
            types = types if isinstance(types, list) else [types]
            if "JobPosting" not in types:
                continue
            locs = node.get("jobLocation") or []
            locs = locs if isinstance(locs, list) else [locs]
            parts: List[str] = []
            for loc in locs:
                addr = (loc or {}).get("address") if isinstance(loc, dict) else None
                if isinstance(addr, dict):
                    country = addr.get("addressCountry")
                    if isinstance(country, dict):
                        country = country.get("name")
                    parts.append(", ".join(x for x in [addr.get("addressLocality"), addr.get("addressRegion"), country] if x))
                elif isinstance(addr, str):
                    parts.append(addr)
            req = node.get("applicantLocationRequirements")
            if isinstance(req, dict) and req.get("name"):
                parts.append(f"Remote ({req['name']})")
            out.append({
                "title": clean_text(node.get("title"), 200),
                "url": node.get("url") or page_url,
                "location": "; ".join(p for p in parts if p),
                "employment_raw": node.get("employmentType"),
                "posted_at": to_date_str(node.get("datePosted")),
            })
    return out


def _analyse_page(html: str, url: str) -> Tuple[List[Tuple[str, str]], List[Dict[str, Any]], List[str]]:
    return find_ats_refs(html), parse_jsonld_jobs(html, url), find_careers_links(html, url)


def parse_greenhouse(data: Any, slug: str) -> List[Dict[str, Any]]:
    jobs = (data or {}).get("jobs") if isinstance(data, dict) else None
    return [{
        "title": clean_text(j.get("title"), 200),
        "url": j.get("absolute_url") or f"https://boards.greenhouse.io/{slug}/jobs/{j.get('id')}",
        "location": clean_text((j.get("location") or {}).get("name"), 200),
        "employment_raw": None,
        "posted_at": to_date_str(j.get("first_published") or j.get("updated_at")),
    } for j in (jobs or []) if isinstance(j, dict)]


def parse_lever(data: Any, slug: str) -> List[Dict[str, Any]]:
    out = []
    for j in (data or []) if isinstance(data, list) else []:
        if not isinstance(j, dict):
            continue
        cats = j.get("categories") or {}
        locs = cats.get("allLocations") or [cats.get("location")]
        loc = "; ".join(str(x) for x in locs if x)
        if j.get("country"):
            loc = f"{loc}, {j['country']}" if loc else str(j["country"])
        out.append({
            "title": clean_text(j.get("text"), 200),
            "url": j.get("hostedUrl") or f"https://jobs.lever.co/{slug}/{j.get('id')}",
            "location": clean_text(loc, 250),
            "employment_raw": cats.get("commitment"),
            "posted_at": to_date_str(j.get("createdAt")),
        })
    return out


def parse_ashby(data: Any, slug: str) -> List[Dict[str, Any]]:
    out = []
    for j in ((data or {}).get("jobs") or []) if isinstance(data, dict) else []:
        if not isinstance(j, dict) or j.get("isListed") is False:
            continue
        parts = [j.get("location")]
        parts += [s.get("location") for s in (j.get("secondaryLocations") or []) if isinstance(s, dict)]
        pa = ((j.get("address") or {}).get("postalAddress") or {})
        if pa.get("addressCountry"):
            parts.append(pa.get("addressCountry"))
        out.append({
            "title": clean_text(j.get("title"), 200),
            "url": j.get("jobUrl") or f"https://jobs.ashbyhq.com/{slug}",
            "location": clean_text("; ".join(str(p) for p in parts if p), 250),
            "employment_raw": j.get("employmentType"),
            "posted_at": to_date_str(j.get("publishedAt")),
        })
    return out


def parse_workable(data: Any, slug: str) -> List[Dict[str, Any]]:
    out = []
    for j in ((data or {}).get("jobs") or []) if isinstance(data, dict) else []:
        if not isinstance(j, dict):
            continue
        parts = [", ".join(x for x in [j.get("city"), j.get("country")] if x)]
        for l in j.get("locations") or []:
            if isinstance(l, dict):
                parts.append(", ".join(x for x in [l.get("city"), l.get("country") or l.get("country_name")] if x))
        out.append({
            "title": clean_text(j.get("title"), 200),
            "url": j.get("url") or j.get("shortlink") or f"https://apply.workable.com/{slug}/j/{j.get('shortcode')}/",
            "location": clean_text("; ".join(p for p in parts if p), 250),
            "employment_raw": j.get("employment_type"),
            "posted_at": to_date_str(j.get("published_on") or j.get("created_at")),
        })
    return out


def parse_recruitee(data: Any, slug: str) -> List[Dict[str, Any]]:
    out = []
    for j in ((data or {}).get("offers") or []) if isinstance(data, dict) else []:
        if not isinstance(j, dict):
            continue
        loc = j.get("location") or ", ".join(x for x in [j.get("city"), j.get("country")] if x)
        out.append({
            "title": clean_text(j.get("title"), 200),
            "url": j.get("careers_url") or f"https://{slug}.recruitee.com/",
            "location": clean_text(loc, 250),
            "employment_raw": j.get("employment_type_code") or j.get("employment_type"),
            "posted_at": to_date_str(j.get("published_at") or j.get("created_at")),
        })
    return out


def parse_personio(xml_text: str, slug: str, host: str) -> List[Dict[str, Any]]:
    out = []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return out
    for p in root.iter("position"):
        get = lambda tag: (p.findtext(tag) or "").strip()   # noqa: E731
        offices = [get("office")] + [o.text or "" for o in p.iter("additionalOffice")]
        out.append({
            "title": clean_text(get("name"), 200),
            "url": f"https://{host}/job/{get('id')}",
            "location": clean_text("; ".join(o for o in offices if o), 250),
            "employment_raw": f"{get('employmentType')} {get('schedule')}",
            "posted_at": to_date_str(get("createdAt")),
        })
    return out


def parse_bamboohr(data: Any, slug: str) -> List[Dict[str, Any]]:
    out = []
    for j in ((data or {}).get("result") or []) if isinstance(data, dict) else []:
        if not isinstance(j, dict):
            continue
        loc = j.get("location") or {}
        ats_loc = j.get("atsLocation") or {}
        parts = [loc.get("city"), loc.get("state"), ats_loc.get("country")] if isinstance(loc, dict) else [str(loc)]
        out.append({
            "title": clean_text(j.get("jobOpeningName"), 200),
            "url": f"https://{slug}.bamboohr.com/careers/{j.get('id')}",
            "location": clean_text(", ".join(str(p) for p in parts if p), 250),
            "employment_raw": j.get("employmentStatusLabel"),
            "posted_at": None,
        })
    return out


def parse_apollo_job_postings(data: Any) -> List[Dict[str, Any]]:
    """Apollo does not document this response; accept any list of dicts carrying a title."""
    if not isinstance(data, dict):
        return []
    items: List[Any] = data.get("organization_job_postings") or data.get("job_postings") or []
    if not items:
        for v in data.values():
            if isinstance(v, list) and v and isinstance(v[0], dict) and "title" in v[0]:
                items = v
                break
    out = []
    for j in items:
        if not isinstance(j, dict) or not j.get("title"):
            continue
        out.append({
            "title": clean_text(j.get("title"), 200),
            "url": j.get("url") or j.get("job_url") or "",
            "location": clean_text(", ".join(str(x) for x in [j.get("city"), j.get("state"), j.get("country")] if x), 200),
            "employment_raw": j.get("employment_type"),
            "posted_at": to_date_str(j.get("posted_at") or j.get("last_seen_at")),
        })
    return out


MAX_PAGE_BYTES = 3_000_000


@dataclass
class WebResponse:
    status_code: int
    content: bytes
    url: str
    encoding: Optional[str] = None

    @property
    def text(self) -> str:
        return self.content.decode(self.encoding or "utf-8", errors="replace")

    def json(self) -> Any:
        return json.loads(self.content)


def _ip_is_public(ip_s: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_s.split("%")[0])
    except ValueError:
        return False
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
                or ip.is_multicast or ip.is_unspecified)


async def _resolves_public(url: str) -> bool:
    """SSRF guard: every address the host resolves to must be public."""
    if not _safe_public_host(url):
        return False
    host = urlparse(url).hostname or ""
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None)
    except Exception:
        return False
    return bool(infos) and all(_ip_is_public(info[4][0]) for info in infos)


def _safe_public_host(url: str) -> bool:
    """Refuse localhost / private IPs — company domains come from third parties."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https"):
        return False
    if not host or host == "localhost" or host.endswith((".local", ".internal", ".localhost")):
        return False
    if re.fullmatch(r"[0-9.]+", host) or ":" in host:
        # literal IPs (incl. short forms like 127.1) are never company websites
        try:
            return _ip_is_public(str(ipaddress.ip_address(host)))
        except ValueError:
            return False
    return True


# ════════════════════════════════════════════════════════════════════════
# Data model for one run
# ════════════════════════════════════════════════════════════════════════
@dataclass
class Job:
    title: str
    url: str
    location: str
    source: str
    employment_type: str
    category: str
    posted_at: Optional[str] = None


@dataclass(eq=False)          # identity equality: two companies with equal fields are still two records
class Company:
    name: str
    key: str
    domain: str = ""
    website: str = ""
    linkedin: str = ""
    apollo_id: str = ""
    size: Optional[int] = None
    industry: str = ""
    country: str = ""
    city: str = ""
    phone: str = ""
    resolved: bool = False           # Apollo data attached
    # Apollo's search returns slim organisation records that often lack headcount / country.
    # When Apollo itself matched the company under an employee-range or HQ filter, that IS the
    # verification, even if the number isn't in the payload.
    size_ok: bool = False            # matched under organization_num_employees_ranges (< 100)
    hq_ok: bool = False              # matched under organization_locations = Ireland
    lookup_state: str = ""           # "" | matched | no_match | skipped | failed | cached
    # Verification (second pass, before contact credits are spent)
    enriched: bool = False           # Apollo organisation enrichment attached (real headcount etc.)
    keywords: List[str] = field(default_factory=list)
    description: str = ""
    parent: str = ""                 # parent / ultimate parent organisation, if Apollo knows one
    li_industry: str = ""            # "Industries" on the company's LinkedIn job page
    li_text: str = ""                # job description text from that page
    mismatch: str = ""               # Apollo record turned out to be a different company
    discovered_by: set = field(default_factory=set)
    jobs: Dict[str, Dict[str, Any]] = field(default_factory=dict)   # title_key -> merged job
    reject_reason: str = ""
    merged_into: Optional["Company"] = None   # set when the registry folds this record into another

    def add_job(self, job: Job) -> bool:
        tk = title_key(job.title) or job.title.lower()
        existing = self.jobs.get(tk)
        if existing is None:
            self.jobs[tk] = {"title": job.title, "url": job.url, "other_urls": [], "location": job.location,
                             "sources": [job.source], "employment_type": job.employment_type,
                             "category": job.category, "posted_at": job.posted_at,
                             "_url_rank": _url_rank(job.source)}
            return True
        # Same opening seen again (another source / another search): merge, never duplicate.
        if job.source not in existing["sources"]:
            existing["sources"].append(job.source)
        rank = _url_rank(job.source)
        if job.url and job.url != existing["url"]:
            if rank < existing["_url_rank"]:
                if existing["url"]:
                    existing["other_urls"].append(existing["url"])
                existing["url"], existing["_url_rank"] = job.url, rank
            elif job.url not in existing["other_urls"]:
                existing["other_urls"].append(job.url)
        if existing["employment_type"] == "Unspecified" and job.employment_type != "Unspecified":
            existing["employment_type"] = job.employment_type
        if job.posted_at and (not existing["posted_at"] or job.posted_at > existing["posted_at"]):
            existing["posted_at"] = job.posted_at
        if not existing["location"] and job.location:
            existing["location"] = job.location
        return False


def _url_rank(source: str) -> int:
    """Which link goes in the sheet: the company's own page beats a portal."""
    s = source.lower()
    if s.startswith("company"):
        return 0
    if "linkedin" in s:
        return 1
    if "apollo" in s:
        return 2
    return 3


class CompanyRegistry:
    """Merges the same company arriving from LinkedIn, Apollo and portals under one record."""

    def __init__(self) -> None:
        self.items: List[Company] = []
        self._by: Dict[str, Company] = {}

    def _keys(self, c: Company) -> List[str]:
        ks = [f"n:{c.key}"] if c.key else []
        if c.domain:
            ks.append(f"d:{c.domain}")
        if c.apollo_id:
            ks.append(f"a:{c.apollo_id}")
        slug = linkedin_company_slug(c.linkedin)
        if slug:
            ks.append(f"l:{slug}")
        return ks

    def find(self, name: str = "", domain: str = "", linkedin: str = "", apollo_id: str = "") -> Optional[Company]:
        probes = []
        if apollo_id:
            probes.append(f"a:{apollo_id}")
        slug = linkedin_company_slug(linkedin)
        if slug:
            probes.append(f"l:{slug}")
        if domain:
            probes.append(f"d:{clean_domain(domain)}")
        if name:
            probes.append(f"n:{company_key(name)}")
        for p in probes:
            hit = self._by.get(p)
            if hit is not None and not (linkedin and slugs_conflict(hit.linkedin, linkedin)):
                return hit
        return None

    def get_or_create(self, name: str, domain: str = "", linkedin: str = "", apollo_id: str = "") -> Optional[Company]:
        key = company_key(name)
        if not key:
            return None
        c = self.find(name, domain, linkedin, apollo_id)
        if c is None:
            c = Company(name=clean_text(name, 160), key=key)
            self.items.append(c)
        if domain and not c.domain:
            c.domain = clean_domain(domain)
        if linkedin and not c.linkedin:
            c.linkedin = linkedin
        if apollo_id and not c.apollo_id:
            c.apollo_id = apollo_id
        self.reindex(c)
        return c

    @staticmethod
    def canon(c: Company) -> Company:
        """Follow merges, so a stale reference (e.g. in a work list) acts on the surviving record."""
        while c.merged_into is not None:
            c = c.merged_into
        return c

    def reindex(self, c: Company) -> None:
        for k in self._keys(c):
            other = self._by.get(k)
            if other is not None and other is not c:
                if slugs_conflict(c.linkedin, other.linkedin):
                    continue                 # same name, different company: keep both, first keeps the key
                self._merge(into=c, other=other)
            self._by[k] = c

    def _merge(self, into: Company, other: Company) -> None:
        for job in other.jobs.values():
            into.add_job(Job(title=job["title"], url=job["url"], location=job["location"],
                             source=job["sources"][0], employment_type=job["employment_type"],
                             category=job["category"], posted_at=job["posted_at"]))
            tk = title_key(job["title"]) or job["title"].lower()
            merged = into.jobs[tk]
            for s in job["sources"][1:]:
                if s not in merged["sources"]:
                    merged["sources"].append(s)
            for u in job["other_urls"]:
                if u not in merged["other_urls"] and u != merged["url"]:
                    merged["other_urls"].append(u)
        into.discovered_by |= other.discovered_by
        for attr in ("domain", "website", "linkedin", "apollo_id", "industry", "country", "city", "phone"):
            if not getattr(into, attr) and getattr(other, attr):
                setattr(into, attr, getattr(other, attr))
        if into.size is None:
            into.size = other.size
        into.resolved = into.resolved or other.resolved
        into.size_ok = into.size_ok or other.size_ok
        into.hq_ok = into.hq_ok or other.hq_ok
        if not into.lookup_state:
            into.lookup_state = other.lookup_state
        other.merged_into = into
        if other in self.items:
            self.items.remove(other)
        for k, v in list(self._by.items()):
            if v is other:
                self._by[k] = into

    def apply_apollo_org(self, c: Company, org: Dict[str, Any]) -> Company:
        """Attach Apollo firmographics; Apollo's name becomes canonical (stable across runs)."""
        c = self.canon(c)
        if slugs_conflict(c.linkedin, org.get("linkedin_url")):
            c.mismatch = linkedin_company_slug(org.get("linkedin_url"))
            return c
        if org.get("name"):
            c.name = clean_text(org["name"], 160)
            c.key = company_key(org["name"]) or c.key
        c.apollo_id = c.apollo_id or str(org.get("organization_id") or org.get("id") or "")
        c.domain = c.domain or clean_domain(org.get("primary_domain") or org.get("website_url") or org.get("domain"))
        c.website = org.get("website_url") or (f"https://{c.domain}" if c.domain else "")
        c.linkedin = c.linkedin or (org.get("linkedin_url") or "")
        size = org.get("estimated_num_employees") or org.get("num_employees")
        try:
            c.size = int(size) if size not in (None, "") else c.size
        except (TypeError, ValueError):
            pass
        c.industry = c.industry or clean_text(org.get("industry"), 120)
        c.country = c.country or clean_text(org.get("country"), 80)
        c.city = c.city or clean_text(org.get("city"), 80)
        primary = org.get("primary_phone") or {}
        c.phone = c.phone or str(org.get("sanitized_phone") or (primary.get("sanitized_number") if isinstance(primary, dict) else "") or org.get("phone") or "")
        c.size_ok = c.size_ok or bool(org.get("size_ok"))
        c.hq_ok = c.hq_ok or bool(org.get("hq_ok"))
        c.resolved = True
        self.reindex(c)
        return c


# ════════════════════════════════════════════════════════════════════════
# Run parameters
# ════════════════════════════════════════════════════════════════════════
class RunParams(BaseModel):
    days_back: int = Field(14, ge=1, le=30)
    employment_types: List[str] = Field(default_factory=lambda: list(EMPLOYMENT_TYPES))
    include_unspecified_type: bool = True
    hq_ireland_only: bool = True
    require_verified_headcount: bool = True
    max_headcount: int = Field(99, ge=1, le=99)          # "< 100"
    max_companies: int = Field(50, ge=1, le=150)          # cap on companies taken to the contact stage
    contacts_per_company: int = Field(3, ge=1, le=5)
    reveal_phones: bool = False                           # Apollo charges ~8 credits per mobile
    sources: List[str] = Field(default_factory=lambda: list(ALL_SOURCES))
    extra_keywords: List[str] = Field(default_factory=list)

    @field_validator("employment_types")
    @classmethod
    def _types(cls, v: List[str]) -> List[str]:
        out = [t for t in EMPLOYMENT_TYPES if t.lower() in {str(x).lower() for x in v}]
        if not out:
            raise ValueError("Pick at least one employment type (Permanent or Contract).")
        return out

    @field_validator("sources")
    @classmethod
    def _sources(cls, v: List[str]) -> List[str]:
        out = [s for s in ALL_SOURCES if s in {str(x).lower() for x in v}]
        if not out:
            raise ValueError("Pick at least one source.")
        return out

    @field_validator("extra_keywords")
    @classmethod
    def _kw(cls, v: List[str]) -> List[str]:
        out: List[str] = []
        for k in v[:8]:
            k = clean_text(k, 60)
            if k and k.lower() not in {x.lower() for x in out + SEARCH_KEYWORDS}:
                out.append(k)
        return out


class RunCancelled(Exception):
    pass


# ════════════════════════════════════════════════════════════════════════
# Wiring (set by init())
# ════════════════════════════════════════════════════════════════════════
_sb: Callable[[str], Any] = None            # type: ignore[assignment]
_run: Callable[[Callable[[], Any]], Any] = None   # type: ignore[assignment]
_get_user: Callable[[Request], Any] = None  # type: ignore[assignment]
_require_module: Callable[[dict, str], None] = None  # type: ignore[assignment]
_audit: Optional[Callable[..., Any]] = None

_TASKS: Dict[str, asyncio.Task] = {}
_CONTEXTS: Dict[str, "RunContext"] = {}


def apollo_key() -> str:
    return os.environ.get("APOLLO_API_KEY", "").strip()


def jooble_key() -> str:
    return os.environ.get("JOOBLE_API_KEY", "").strip()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime] = None) -> str:
    return (dt or _now()).isoformat()


# ════════════════════════════════════════════════════════════════════════
# Run context — progress, live log, heartbeat, cancellation
# ════════════════════════════════════════════════════════════════════════
class RunContext:
    def __init__(self, run_id: str, params: RunParams):
        self.run_id = run_id
        self.p = params
        self.events: List[Dict[str, Any]] = []
        self.stage = "discover"
        self.progress = 0
        self.cancelled = False
        self.deleted = False
        self.started = time.monotonic()
        self.stats: Dict[str, Any] = {
            "sources": {},
            "filtered": {"not_data_ai": 0, "not_ireland": 0, "northern_ireland": 0, "employment_type": 0,
                         "headcount_too_big": 0, "headcount_unverified": 0, "agency": 0, "hq_outside_ireland": 0,
                         "hq_unknown": 0, "no_qualifying_jobs": 0, "over_company_cap": 0, "older_than_window": 0,
                         "known_large": 0, "apollo_no_match": 0, "over_lookup_cap": 0,
                         "subsidiary": 0, "identity_mismatch": 0, "foreign_linkedin": 0},
            "rejected": [],              # [{company, reason, stage}] — every company dropped, and why
            "apollo": {"search_calls": 0, "lookup_calls": 0, "lookups_cached": 0, "lookups_skipped": 0,
                       "job_posting_calls": 0, "org_enrich_calls": 0, "orgs_enriched": 0, "orgs_enrich_cached": 0,
                       "people_search_calls": 0, "enrich_calls": 0, "credits_consumed": 0.0, "contacts_reused": 0},
            "warnings": [],
            "linkedin_pages": {"checked": 0, "failed": 0},
        }
        self.web: Optional[httpx.AsyncClient] = None
        self.apollo: Optional[httpx.AsyncClient] = None
        self.apollo_sem = asyncio.Semaphore(3)
        self.web_sem = asyncio.Semaphore(8)
        self.company_cache_in: Dict[str, Dict[str, Any]] = {}    # from previous runs
        self.company_cache_out: Dict[str, Dict[str, Any]] = {}   # saved with this run
        self.apollo_disabled = "" if apollo_key() else "APOLLO_API_KEY not set"
        self.job_postings_disabled = False
        self.enrich_disabled = False
        self._dirty = True
        self._write_lock = asyncio.Lock()
        self.finished = False      # once set, the ticker may no longer write (final status wins)
        self._stage_drops: Dict[str, Dict[str, int]] = {}

    # ── logging ──
    def log(self, msg: str, level: str = "info") -> None:
        msg = _integ._redact(msg)
        self.events.append({"t": _iso(), "level": level, "msg": msg[:300]})
        self.events = self.events[-EVENTS_KEPT:]
        self._dirty = True
        (log.warning if level in ("warn", "error") else log.info)(f"[hiring-intel {self.run_id[:8]}] {msg}")

    def warn(self, msg: str) -> None:
        if msg not in self.stats["warnings"]:
            self.stats["warnings"].append(msg[:240])
        self.log(msg, "warn")

    def source_stat(self, name: str, **kw: Any) -> None:
        s = self.stats["sources"].setdefault(name, {"jobs": 0, "requests": 0, "status": "ok"})
        for k, v in kw.items():
            if isinstance(v, (int, float)) and k in ("jobs", "requests", "companies"):
                s[k] = s.get(k, 0) + v
            else:
                s[k] = v
        self._dirty = True

    def set_stage(self, stage: str, progress: int) -> None:
        self.stage, self.progress = stage, max(self.progress, min(100, int(progress)))
        self._dirty = True

    def bump(self, progress: float) -> None:
        p = max(self.progress, min(99, int(progress)))
        if p != self.progress:
            self.progress, self._dirty = p, True

    def reject(self, c: "Company", reason: str, key: str, stage: str) -> None:
        """Drop a company: count it, remember who and why (shown in the UI), and say so in the log."""
        c.reject_reason = reason
        f = self.stats["filtered"]
        f[key] = f.get(key, 0) + 1
        rej = self.stats.setdefault("rejected", [])
        if len(rej) < 400:
            rej.append({"company": c.name, "reason": reason, "stage": stage})
        self._stage_drops.setdefault(stage, {}).setdefault(key, 0)
        self._stage_drops[stage][key] += 1
        self._dirty = True

    def log_drops(self, stage: str) -> None:
        drops = self._stage_drops.pop(stage, {})
        if drops:
            parts = [f"{n} {FILTER_REASON_TEXT.get(k, k)}" for k, n in sorted(drops.items(), key=lambda kv: -kv[1])]
            self.log(f"Dropped at {stage}: " + ", ".join(parts))

    def check_cancel(self) -> None:
        if self.cancelled or self.deleted:
            raise RunCancelled()

    # ── persistence of the live state ──
    async def flush(self) -> None:
        """Write live state + heartbeat. Runs every TICK_SECONDS even when nothing changed,
        because the heartbeat is how an orphaned run (server restart) is detected."""
        async with self._write_lock:
            if self.finished:
                return
            self._dirty = False
            self.stats["elapsed_seconds"] = int(time.monotonic() - self.started)
            # snapshot: the worker thread must not serialise dicts the event loop is still mutating
            patch = json.loads(json.dumps({"stage": self.stage, "progress": self.progress, "events": self.events,
                                           "stats": self.stats, "heartbeat_at": _iso()}, default=str))
            await self._write(patch)

    async def _write(self, patch: Dict[str, Any]) -> None:
        try:
            res = await _run(lambda: _sb("hiring_intel_runs").update(patch).eq("id", self.run_id).execute())
            rows = res.data or []
            if not rows:
                self.deleted = True            # row deleted from the UI while running
            elif rows[0].get("cancel_requested"):
                self.cancelled = True
        except Exception as e:                  # never let a status write kill the run
            log.warning(f"[hiring-intel] flush failed: {_integ._redact(e)}")

    async def ticker(self) -> None:
        try:
            while True:
                await asyncio.sleep(TICK_SECONDS)
                await self.flush()
        except asyncio.CancelledError:
            pass

    # ── HTTP ──
    async def web_get(self, url: str, **kw: Any) -> Optional["WebResponse"]:
        """GET a third-party URL safely: public hosts only (checked after DNS, on every redirect
        hop), at most 4 redirects, body capped at MAX_PAGE_BYTES without buffering more."""
        async with self.web_sem:
            self.check_cancel()
            for _hop in range(5):
                if not await _resolves_public(url):
                    return None
                try:
                    async with self.web.stream("GET", url, **kw) as r:   # type: ignore[union-attr]
                        if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                            url = urljoin(str(r.url), r.headers["location"])
                            kw.pop("params", None)      # the Location already carries its query
                            continue
                        body = bytearray()
                        async for chunk in r.aiter_bytes():
                            body.extend(chunk)
                            if len(body) > MAX_PAGE_BYTES:
                                return WebResponse(413, b"", str(r.url), r.encoding)
                        return WebResponse(r.status_code, bytes(body), str(r.url), r.encoding)
                except (httpx.HTTPError, ValueError) as e:
                    log.debug(f"[hiring-intel] GET {url} failed: {e}")
                    return None
            return None

    async def apollo_call(self, method: str, path: str, *, kind: str, params: Any = None,
                          json_body: Any = None) -> Optional[Dict[str, Any]]:
        if self.apollo_disabled:
            return None
        async with self.apollo_sem:
            self.check_cancel()                 # a queued call must not spend credits after Cancel
            self.stats["apollo"][kind] = self.stats["apollo"].get(kind, 0) + 1
            res = await _integ._request(self.apollo, method, f"{APOLLO_BASE}{path}",
                                        params=params, json=json_body)
            await asyncio.sleep(0.35)          # stay well under Apollo's per-minute limits
        if res.get("ok"):
            return res.get("data") or {}
        err = str(res.get("error") or "unknown error")
        if "auth failed" in err:
            # A 403 on job_postings means the key lacks that scope — keep everything else running.
            if kind == "job_posting_calls":
                self.job_postings_disabled = True
                self.warn("Apollo key cannot read job postings (needs a master key) — skipped that step.")
            else:
                self.apollo_disabled = err
                self.warn(f"Apollo stopped: {err}")
        elif "429" in err:
            self.warn("Apollo rate limit reached — some lookups were skipped. Try again later.")
        else:
            self.log(f"Apollo {path.split('?')[0]}: {err}", "warn")
        return None


# ════════════════════════════════════════════════════════════════════════
# Source 1 — LinkedIn guest job search
# ════════════════════════════════════════════════════════════════════════
async def source_linkedin(ctx: RunContext, reg: CompanyRegistry) -> None:
    name = "LinkedIn"
    ctx.source_stat(name, status="running")
    keywords = SEARCH_KEYWORDS + ctx.p.extra_keywords
    type_filters = []
    if "Permanent" in ctx.p.employment_types:
        type_filters.append(("Permanent", "F"))
    if "Contract" in ctx.p.employment_types:
        type_filters.append(("Contract", "C,T"))
    seen_ids: set = set()
    total_combos = max(1, len(keywords) * len(type_filters))
    combo = 0
    blocked = False
    headers = {"User-Agent": BROWSER_UA, "Accept-Language": "en-IE,en;q=0.9",
               "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}
    for kw in keywords:
        for type_label, jt in type_filters:
            combo += 1
            ctx.bump(5 + 25 * combo / total_combos)
            start = 0
            for _page in range(LINKEDIN_MAX_PAGES):
                ctx.check_cancel()
                params = {"keywords": kw, "location": "Ireland", "geoId": LINKEDIN_IRELAND_GEO_ID,
                          "f_TPR": f"r{ctx.p.days_back * 86400}", "f_JT": jt, "sortBy": "DD", "start": start}
                r = None
                for attempt in range(2):
                    r = await ctx.web_get(LINKEDIN_SEARCH_URL, params=params, headers=headers)
                    ctx.source_stat(name, requests=1)
                    if r is not None and r.status_code == 429 and attempt == 0:
                        ctx.log("LinkedIn rate limit — waiting 20s, then continuing (this is normal)")
                        await asyncio.sleep(20)
                        continue
                    break
                if r is None:
                    break
                if r.status_code in (429, 999, 403):
                    blocked = True
                    break
                if r.status_code != 200:
                    break
                cards = await asyncio.to_thread(parse_linkedin_cards, r.text)
                if not cards:
                    break
                fresh = 0
                for c in cards:
                    if c["id"] and c["id"] in seen_ids:
                        continue
                    seen_ids.add(c["id"])
                    fresh += 1
                    _ingest(ctx, reg, source=name, title=c["title"], company=c["company"],
                            company_linkedin=c["company_url"], location=c["location"], url=c["url"],
                            employment_raw=None, type_hint=type_label, posted_at=c["posted_at"])
                start += len(cards)
                if fresh == 0:
                    break
                await asyncio.sleep(random.uniform(1.0, 2.2))
            if blocked:
                break
        if blocked:
            break
    if blocked:
        ctx.source_stat(name, status="blocked")
        ctx.warn("LinkedIn blocked or rate-limited the search part-way; results from it are partial.")
    else:
        ctx.source_stat(name, status="ok")
    ctx.log(f"LinkedIn: {ctx.stats['sources'][name]['jobs']} Data/AI roles in Ireland")


# ════════════════════════════════════════════════════════════════════════
# Source 2 — Jooble job-portal API (optional)
# ════════════════════════════════════════════════════════════════════════
async def source_jooble(ctx: RunContext, reg: CompanyRegistry) -> None:
    name = "Jooble"
    key = jooble_key()
    if not key:
        ctx.source_stat(name, status="not_configured")
        return
    ctx.source_stat(name, status="running")
    since = (date.today() - timedelta(days=ctx.p.days_back)).isoformat()
    keywords = SEARCH_KEYWORDS[:8] + ctx.p.extra_keywords
    for kw in keywords:
        for page in (1, 2):
            ctx.check_cancel()
            try:
                async with ctx.web_sem:
                    r = await ctx.web.post(f"{JOOBLE_URL}{key}",   # type: ignore[union-attr]
                                           json={"keywords": kw, "location": "Ireland", "page": page})
            except httpx.HTTPError as e:
                ctx.warn(f"Jooble request failed: {type(e).__name__}")
                ctx.source_stat(name, status="error")
                return
            ctx.source_stat(name, requests=1)
            if r.status_code in (401, 403):
                ctx.warn("Jooble rejected the API key.")
                ctx.source_stat(name, status="error")
                return
            if r.status_code != 200:
                break
            try:
                jobs = (r.json() or {}).get("jobs") or []
            except Exception:
                break
            for j in jobs:
                posted = to_date_str(j.get("updated"))
                if posted and posted < since:
                    continue
                _ingest(ctx, reg, source=name, title=j.get("title"), company=j.get("company"),
                        location=j.get("location"), url=j.get("link"), employment_raw=j.get("type"),
                        posted_at=posted)
            if len(jobs) < 20:
                break
    ctx.source_stat(name, status="ok")
    ctx.log(f"Jooble: {ctx.stats['sources'][name]['jobs']} Data/AI roles in Ireland")


# ════════════════════════════════════════════════════════════════════════
# Source 3 — Apollo: companies with open Data/AI roles in Ireland
# ════════════════════════════════════════════════════════════════════════
async def source_apollo_companies(ctx: RunContext, reg: CompanyRegistry) -> None:
    name = "Apollo"
    if ctx.apollo_disabled:
        ctx.source_stat(name, status="not_configured")
        return
    ctx.source_stat(name, status="running")
    since = (date.today() - timedelta(days=ctx.p.days_back)).isoformat()
    p_hq = bool(ctx.p.hq_ireland_only)
    found = 0
    for page in (1, 2, 3):
        ctx.check_cancel()
        params: List[Tuple[str, Any]] = [("page", page), ("per_page", 100),
                                         ("organization_job_posted_at_range[min]", since)]
        params += [("organization_num_employees_ranges[]", r) for r in APOLLO_EMPLOYEE_RANGES]
        params += [("q_organization_job_titles[]", t) for t in APOLLO_JOB_TITLES]
        params += [("organization_job_locations[]", "Ireland")]
        if ctx.p.hq_ireland_only:
            params += [("organization_locations[]", "Ireland")]
        data = await ctx.apollo_call("POST", "/mixed_companies/search", kind="search_calls", params=params)
        if data is None:
            break
        orgs = (data.get("organizations") or []) + (data.get("accounts") or [])
        for org in orgs:
            if not isinstance(org, dict) or not org.get("name"):
                continue
            c = reg.get_or_create(org["name"], domain=org.get("primary_domain") or org.get("website_url") or "",
                                  linkedin=org.get("linkedin_url") or "",
                                  apollo_id=str(org.get("organization_id") or org.get("id") or ""))
            if c:
                # This search ran under the employee-range filter (and the Irish-HQ filter when that
                # setting is on), so Apollo has already verified both even if the slim search
                # record carries no headcount / country fields.
                reg.apply_apollo_org(c, {**org, "size_ok": True, "hq_ok": p_hq})
                c.lookup_state = "matched"
                c.discovered_by.add(name)
                found += 1
        pg = data.get("pagination") or {}
        if page >= int(pg.get("total_pages") or 1) or len(orgs) < 100:
            break
    ctx.source_stat(name, status="ok", companies=found)
    ctx.log(f"Apollo: {found} small companies with open Data/AI roles in Ireland")


# ════════════════════════════════════════════════════════════════════════
# Ingest + filters shared by all sources
# ════════════════════════════════════════════════════════════════════════
def _type_allowed(ctx: RunContext, etype: str) -> bool:
    if etype in ctx.p.employment_types:
        return True
    return etype == "Unspecified" and ctx.p.include_unspecified_type


def _ingest(ctx: RunContext, reg: CompanyRegistry, *, source: str, title: Any, company: Any, location: Any,
            url: Any, employment_raw: Any = None, type_hint: Optional[str] = None, posted_at: Any = None,
            company_linkedin: str = "", target: Optional[Company] = None, location_known_ie: bool = False) -> bool:
    """Classify one raw posting and attach it to its company. Returns True if it qualified."""
    title = clean_text(title, 200)
    category = classify_title(title)
    if not category:
        ctx.stats["filtered"]["not_data_ai"] += 1
        return False
    where = "IE" if location_known_ie else ireland_location(location)
    if where == "NI":
        ctx.stats["filtered"]["northern_ireland"] += 1
        return False
    if where != "IE":
        ctx.stats["filtered"]["not_ireland"] += 1
        return False
    posted = to_date_str(posted_at)
    # LinkedIn already applied the window server-side (f_TPR) and shows the ORIGINAL date of reposts.
    if posted and source != "LinkedIn" and posted < (date.today() - timedelta(days=ctx.p.days_back)).isoformat():
        ctx.stats["filtered"]["older_than_window"] += 1
        return False
    etype = normalize_employment_type(employment_raw, title)
    if etype == "Unspecified" and type_hint:
        etype = type_hint
    if not _type_allowed(ctx, etype):
        ctx.stats["filtered"]["employment_type"] += 1
        return False
    c = target or reg.get_or_create(clean_text(company, 160), linkedin=company_linkedin)
    if c is None:
        return False
    c.discovered_by.add(source)
    if c.add_job(Job(title=title, url=str(url or ""), location=clean_text(location, 200) or "Ireland",
                     source=source, employment_type=etype, category=category,
                     posted_at=to_date_str(posted_at))):
        ctx.source_stat(source if not source.startswith("Company") else "Company websites", jobs=1)
    return True


# ════════════════════════════════════════════════════════════════════════
# Qualify — resolve each company in Apollo, apply headcount / HQ / agency rules
# ════════════════════════════════════════════════════════════════════════
def _best_org_match(c: Company, orgs: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    slug = linkedin_company_slug(c.linkedin)
    best, best_score = None, 0
    for o in orgs:
        if not isinstance(o, dict):
            continue
        if slugs_conflict(c.linkedin, o.get("linkedin_url")):
            continue                     # a namesake, not this company
        score = 0
        if slug and _slug_norm(linkedin_company_slug(o.get("linkedin_url"))) == _slug_norm(slug):
            score += 10
        if company_key(o.get("name")) == c.key:
            score += 5
        elif c.key and company_key(o.get("name")).startswith(c.key + " "):
            score += 2
        if is_irish_country(o.get("country")):
            score += 1
        if score > best_score:
            best, best_score = o, score
    return best if best_score >= 5 else None


CACHE_FIELDS = ("id", "organization_id", "name", "primary_domain", "website_url", "linkedin_url",
                "estimated_num_employees", "country", "city", "industry", "sanitized_phone")
CACHE_MAX_AGE_DAYS = 21
CACHE_MAX_ENTRIES = 1000


def lookup_mode(p: "RunParams") -> str:
    """Which Apollo filters a lookup runs under: 's' = employee ranges (< 100), 'h' = HQ in Ireland.
    With "Only companies confirmed under 100 staff" OFF the lookup is unfiltered, so a company Apollo
    doesn't know can still be kept (that is what the toggle promises)."""
    if not p.require_verified_headcount:
        return ""
    return "s" + ("h" if p.hq_ireland_only else "")


def lookup_params(name: str, mode: str) -> List[Tuple[str, Any]]:
    params: List[Tuple[str, Any]] = [("q_organization_name", name), ("page", 1), ("per_page", 10)]
    if "s" in mode:
        params += [("organization_num_employees_ranges[]", r) for r in APOLLO_EMPLOYEE_RANGES]
    if "h" in mode:
        params += [("organization_locations[]", "Ireland")]
    return params


def _cache_put(ctx: RunContext, keys: List[str], org: Optional[Dict[str, Any]],
               learned_at: Optional[str] = None, mode: str = "") -> None:
    """learned_at: keep the original lookup time when re-saving a cache hit, so entries really expire.
    mode: the filters the lookup ran under — a 'no match' only means something under those filters."""
    if org:
        entry = {k: org.get(k) for k in CACHE_FIELDS if org.get(k) not in (None, "")}
        if org.get("size_ok"):
            entry["size_ok"] = True
        if org.get("hq_ok"):
            entry["hq_ok"] = True
    else:
        entry = {"unmatched": True}
    entry["mode"] = mode
    entry["t"] = learned_at or _iso()
    for k in keys:
        if k and len(ctx.company_cache_out) < CACHE_MAX_ENTRIES:
            ctx.company_cache_out[k] = entry


def cache_entry_usable(e: Dict[str, Any], mode: str) -> bool:
    """Can a cached lookup answer a lookup made under `mode`?
    * 'no match' under fewer filters (or none) is still 'no match' under more filters.
    * a match must carry the facts the current mode needs — the number itself or the filter flag.
      (Entries written before this change have no mode: they were unfiltered lookups.)"""
    emode = str(e.get("mode") or "")
    if e.get("unmatched"):
        return set(emode) <= set(mode)
    if "s" in mode and not (e.get("size_ok") or e.get("estimated_num_employees") not in (None, "")):
        return False
    if "h" in mode and not (e.get("hq_ok") or e.get("country")):
        return False
    return True


def _cache_get(ctx: RunContext, keys: List[str], mode: Optional[str] = None) -> Optional[Dict[str, Any]]:
    for k in keys:
        e = ctx.company_cache_in.get(k)
        if not e:
            continue
        try:
            age = _now() - datetime.fromisoformat(str(e.get("t")).replace("Z", "+00:00"))
        except Exception:
            continue
        if age.days > CACHE_MAX_AGE_DAYS:
            continue
        if mode is not None and not cache_entry_usable(e, mode):
            continue
        return e
    return None


async def load_company_cache(ctx: RunContext) -> None:
    try:
        res = await _run(lambda: _sb("hiring_intel_runs").select("company_cache").eq("status", "completed")
                         .neq("id", ctx.run_id).order("created_at", desc=True).limit(MAX_RUNS_KEPT).execute())
    except Exception as e:
        log.warning(f"[hiring-intel] company cache load failed: {_integ._redact(e)}")
        return
    # oldest first so the newest run's knowledge wins
    for row in reversed(res.data or []):
        cache = row.get("company_cache") or {}
        if isinstance(cache, dict):
            ctx.company_cache_in.update(cache)


def _lookup_keys(c: Company) -> List[str]:
    keys = [f"n:{c.key}"]
    slug = linkedin_company_slug(c.linkedin)
    if slug:
        keys.insert(0, f"l:{slug}")
    return keys


def lookup_order(companies: List[Company]) -> List[Company]:
    """Who gets the limited Apollo lookups first. Companies with FEW open Data/AI roles first:
    a firm posting 10+ data roles in a fortnight is almost never under 100 staff, and sorting the
    other way round (as before) spent the whole budget on exactly those firms. A LinkedIn company
    page breaks ties because it makes the Apollo match exact."""
    return sorted(companies, key=lambda c: (len(c.jobs), 0 if linkedin_company_slug(c.linkedin) else 1,
                                            c.name.lower()))


async def resolve_companies(ctx: RunContext, reg: CompanyRegistry) -> None:
    mode = lookup_mode(ctx.p)
    pending = [c for c in reg.items if not c.resolved and c.jobs
               and not company_agency_reason(c) and c.key not in OWN_COMPANY_KEYS
               and not is_known_large(c.name)]          # never spend a credit on a certain drop
    if not pending:
        return
    if ctx.apollo_disabled:
        ctx.warn("Apollo is not available, so company headcount cannot be verified.")
        return
    # Firmographics learned in a previous run are re-used (each Apollo lookup costs a credit).
    still: List[Company] = []
    for c in pending:
        hit = _cache_get(ctx, _lookup_keys(c), mode)
        if hit is None:
            still.append(c)
            continue
        ctx.stats["apollo"]["lookups_cached"] += 1
        _cache_put(ctx, _lookup_keys(c), None if hit.get("unmatched") else hit,
                   learned_at=hit.get("t"), mode=str(hit.get("mode") or ""))
        if hit.get("unmatched"):
            c.lookup_state = "no_match" if hit.get("mode") else "unknown"
        else:
            reg.apply_apollo_org(c, hit)
            c.lookup_state = "cached" if c.resolved else ("no_match" if mode else "unknown")
    still = lookup_order(still)
    budget = lookup_budget(ctx.p.max_companies)
    batch, skipped = still[:budget], still[budget:]
    for c in skipped:
        c.lookup_state = "skipped"
    ctx.stats["apollo"]["lookups_skipped"] = len(skipped)
    if not batch:
        return
    ctx.log(f"Checking {len(batch)} hiring companies in Apollo for headcount and HQ"
            f" ({ctx.stats['apollo']['lookups_cached']} already known from earlier scans"
            f"{f', {len(skipped)} over the lookup limit' if skipped else ''})")
    done = 0

    async def one(c: Company) -> None:
        nonlocal done
        ctx.check_cancel()
        keys = _lookup_keys(c)
        data = await ctx.apollo_call("POST", "/mixed_companies/search", kind="lookup_calls",
                                     params=lookup_params(c.name, mode))
        done += 1
        ctx.bump(35 + 10 * done / len(batch))
        if data is None:
            c.lookup_state = "failed"
            return                                   # failed call: don't cache, retry next scan
        org = _best_org_match(c, (data.get("organizations") or []) + (data.get("accounts") or []))
        if org:
            # Apollo matched it UNDER the filters, so the filters are verified facts about it.
            org = {**org, "size_ok": "s" in mode, "hq_ok": "h" in mode}
        _cache_put(ctx, keys, org, mode=mode)
        if org:
            reg.apply_apollo_org(c, org)
            c.lookup_state = "matched" if c.resolved else ("no_match" if mode else "unknown")
        else:
            c.lookup_state = "no_match" if mode else "unknown"

    results = await asyncio.gather(*(one(c) for c in batch), return_exceptions=True)
    if any(isinstance(r, RunCancelled) for r in results):
        raise RunCancelled()
    matched = len([c for c in batch if c.resolved])
    if mode:
        ctx.log(f"Apollo confirmed {matched} of {len(batch)} as under 100 staff"
                f"{' with an Irish HQ' if 'h' in mode else ''}")
    elif matched < len(batch):
        ctx.log(f"{len(batch) - matched} companies could not be matched in Apollo (headcount unknown)")


FILTER_REASON_TEXT = {
    "agency": "staffing / recruitment / HR firms",
    "known_large": "known large employers",
    "headcount_too_big": "100+ staff",
    "apollo_no_match": "not confirmed under 100 staff / Irish HQ by Apollo",
    "headcount_unverified": "headcount unknown",
    "over_lookup_cap": "not checked (Apollo lookup limit)",
    "hq_outside_ireland": "HQ outside Ireland",
    "hq_unknown": "HQ unknown",
    "subsidiary": "part of a larger group",
    "identity_mismatch": "Apollo record was a different company",
    "foreign_linkedin": "LinkedIn page registered outside Ireland",
    "over_company_cap": "over the company cap",
}


def company_agency_reason(c: Company) -> str:
    return agency_reason(c.name, c.industry, c.domain, c.linkedin, c.keywords, c.description,
                         c.li_industry, c.li_text)


def qualify(ctx: RunContext, reg: CompanyRegistry) -> List[Company]:
    """First pass, on what discovery + the Apollo lookup told us."""
    keep: List[Company] = []
    stage = "qualify"
    for c in reg.items:
        if c.key in OWN_COMPANY_KEYS:
            c.reject_reason = "own company"
            continue
        why = company_agency_reason(c)
        if why:
            ctx.reject(c, f"staffing/recruitment firm ({why})", "agency", stage)
            continue
        if c.size is not None:
            if c.size > ctx.p.max_headcount or c.size < 1:
                ctx.reject(c, f"{c.size} staff", "headcount_too_big", stage)
                continue
        elif is_known_large(c.name):
            ctx.reject(c, "known large employer", "known_large", stage)
            continue
        elif not c.size_ok and ctx.p.require_verified_headcount:
            if c.mismatch:
                ctx.reject(c, f"Apollo's record is a different company (/{c.mismatch})", "identity_mismatch", stage)
            elif c.lookup_state == "skipped":
                ctx.reject(c, "not checked — Apollo lookup limit", "over_lookup_cap", stage)
            elif c.lookup_state == "no_match":
                ctx.reject(c, "not confirmed under 100 staff / Irish HQ in Apollo", "apollo_no_match", stage)
            else:
                ctx.reject(c, "headcount unknown", "headcount_unverified", stage)
            continue
        if ctx.p.hq_ireland_only and c.country and not is_irish_country(c.country):
            ctx.reject(c, f"HQ in {c.country}", "hq_outside_ireland", stage)
            continue
        if ctx.p.hq_ireland_only and not c.country and not c.hq_ok and ctx.p.require_verified_headcount:
            ctx.reject(c, "HQ unknown", "hq_unknown", stage)
            continue
        keep.append(c)
    ctx.log_drops(stage)
    return keep


# ════════════════════════════════════════════════════════════════════════
# Verify — a stricter second pass on the shortlist, before contact credits are spent
#   * the company's own LinkedIn job page (free): industry + "on behalf of our client" wording
#   * Apollo organisation enrichment (1 credit, cached 21 days): REAL headcount, industry,
#     keywords, parent group. Search results only say "matched the < 100 filter", which a small
#     Irish arm of a 500-person group (DOMINO HR) or a namesake (emagine) also does.
# ════════════════════════════════════════════════════════════════════════
LINKEDIN_JOB_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{}"


def parse_linkedin_job_page(html: str) -> Dict[str, str]:
    out = {"industries": "", "description": "", "company": "", "company_url": ""}
    if not html or "<" not in html:
        return out
    soup = BeautifulSoup(html, "html.parser")
    for item in soup.select(".description__job-criteria-item"):
        head = clean_text((item.select_one(".description__job-criteria-subheader") or item).get_text(" "), 60).lower()
        val = item.select_one(".description__job-criteria-text")
        if "industr" in head and val:
            out["industries"] = clean_text(val.get_text(" "), 200)
    if not out["industries"]:
        # layout fallback: the criteria list rendered as plain lines ("Industries" / "Staffing and Recruiting")
        lines = [ln.strip() for ln in soup.get_text("\n").splitlines() if ln.strip()]
        for i, ln in enumerate(lines[:-1]):
            if ln.lower() in ("industries", "industry"):
                out["industries"] = clean_text(lines[i + 1], 200)
                break
    desc = soup.select_one(".show-more-less-html__markup") or soup.select_one(".description__text")
    if desc:
        out["description"] = clean_text(desc.get_text(" "), 6000)
    org = soup.select_one("a.topcard__org-name-link") or soup.select_one(".topcard__flavor a")
    if org:
        out["company"] = clean_text(org.get_text(" "), 160)
        out["company_url"] = (org.get("href") or "").split("?")[0]
    return out


def _linkedin_job_id(url: str) -> str:
    m = re.search(r"linkedin\.com/jobs/view/(?:[^/?#]*?-)?(\d{6,})", url or "")
    return m.group(1) if m else ""


async def check_linkedin_job_pages(ctx: RunContext, companies: List[Company]) -> None:
    """One job page per company, sequential and slow (LinkedIn rate-limits guests). Best effort:
    if LinkedIn blocks us the companies simply keep the verdict from the other checks."""
    headers = {"User-Agent": BROWSER_UA, "Accept-Language": "en-IE,en;q=0.9", "Accept": "text/html,*/*;q=0.8"}
    stats = ctx.stats["linkedin_pages"]
    strikes = 0
    for c in companies:
        if c.li_industry or c.li_text:
            continue
        job_id = next((jid for jid in (_linkedin_job_id(j.get("url", "")) or next(
            (_linkedin_job_id(u) for u in j.get("other_urls", []) if _linkedin_job_id(u)), "")
            for j in c.jobs.values()) if jid), "")
        if not job_id:
            continue
        ctx.check_cancel()
        r = await ctx.web_get(LINKEDIN_JOB_URL.format(job_id), headers=headers)
        if r is not None and r.status_code == 429 and strikes == 0:
            strikes += 1
            ctx.log("LinkedIn rate limit while checking job pages — waiting 15s")
            await asyncio.sleep(15)
            r = await ctx.web_get(LINKEDIN_JOB_URL.format(job_id), headers=headers)
        if r is None or r.status_code != 200:
            stats["failed"] += 1
            if r is not None and r.status_code in (429, 999, 403):
                ctx.warn("LinkedIn stopped answering job-page checks; the rest rely on Apollo data and names.")
                return
            continue
        page = await asyncio.to_thread(parse_linkedin_job_page, r.text)
        stats["checked"] += 1
        c.li_industry, c.li_text = page["industries"], page["description"]
        if page["company_url"]:
            if not c.linkedin:
                c.linkedin = page["company_url"]
            elif slugs_conflict(c.linkedin, page["company_url"]):
                c.mismatch = linkedin_company_slug(c.linkedin)
        await asyncio.sleep(random.uniform(0.8, 1.6))


ENRICH_FIELDS = ("estimated_num_employees", "industry", "country", "city", "linkedin_url", "primary_domain",
                 "short_description", "parent")


def org_parent(org: Dict[str, Any]) -> str:
    """Name of the parent / ultimate parent organisation in an Apollo enrichment record ('' if none)."""
    for k in ("owned_by_organization", "ultimate_parent_organization"):
        v = org.get(k)
        if isinstance(v, dict) and (v.get("name") or v.get("id")):
            if str(v.get("id") or "") and str(v.get("id")) == str(org.get("id") or ""):
                continue                 # some records list themselves as their own ultimate parent
            return clean_text(v.get("name") or "a parent company", 120)
    chain = org.get("owned_by_chain")
    if isinstance(chain, list) and [x for x in chain if x and str(x) != str(org.get("id") or "")]:
        return "a parent company"
    if org.get("owned_by_organization_id") and str(org["owned_by_organization_id"]) != str(org.get("id") or ""):
        return "a parent company"
    return clean_text(org.get("parent") or "", 120)


def apply_enrichment(c: Company, org: Dict[str, Any]) -> None:
    if slugs_conflict(c.linkedin, org.get("linkedin_url")):
        c.mismatch = linkedin_company_slug(org.get("linkedin_url"))
        return
    size = org.get("estimated_num_employees")
    try:
        if size not in (None, ""):
            c.size = int(size)           # enrichment is authoritative over the search filter
    except (TypeError, ValueError):
        pass
    c.industry = clean_text(org.get("industry"), 120) or c.industry
    kws = org.get("keywords") or []
    c.keywords = [clean_text(k, 60) for k in kws if k][:25] if isinstance(kws, list) else c.keywords
    c.description = clean_text(org.get("short_description") or org.get("seo_description"), 600) or c.description
    if org.get("country"):
        c.country = clean_text(org["country"], 80)
    c.city = clean_text(org.get("city"), 80) or c.city
    c.linkedin = c.linkedin or (org.get("linkedin_url") or "")
    c.parent = org_parent(org)
    c.enriched = True


def _enrich_cache_keys(c: Company) -> List[str]:
    keys = [f"x:n:{c.key}"]
    if c.domain:
        keys.insert(0, f"x:d:{c.domain}")
    return keys


def _org_matches(c: Company, org: Dict[str, Any]) -> bool:
    if not isinstance(org, dict):
        return False
    od = clean_domain(org.get("primary_domain") or org.get("website_url") or "")
    if c.domain and od and od == c.domain:
        return True
    oslug, cslug = _slug_norm(linkedin_company_slug(org.get("linkedin_url"))), _slug_norm(linkedin_company_slug(c.linkedin))
    if oslug and cslug and oslug == cslug:
        return True
    return bool(c.key) and company_key(org.get("name")) == c.key


async def enrich_orgs(ctx: RunContext, companies: List[Company]) -> None:
    a = ctx.stats["apollo"]
    todo: List[Company] = []
    for c in companies:
        if c.enriched:
            continue
        hit = _cache_get(ctx, _enrich_cache_keys(c))
        if hit and not hit.get("unmatched"):
            apply_enrichment(c, hit)
            a["orgs_enrich_cached"] += 1
            for k in _enrich_cache_keys(c):
                ctx.company_cache_out[k] = hit
        elif hit:
            a["orgs_enrich_cached"] += 1   # Apollo had nothing more last time — don't pay again
        else:
            todo.append(c)
    if not todo or ctx.apollo_disabled or getattr(ctx, "enrich_disabled", False):
        return
    for i in range(0, len(todo), 10):
        ctx.check_cancel()
        chunk = todo[i:i + 10]
        details = []
        for c in chunk:
            d = {"name": c.name}
            if c.domain:
                d["domain"] = c.domain
            if c.linkedin and linkedin_company_slug(c.linkedin):
                d["linkedin_url"] = "https://www.linkedin.com/company/" + linkedin_company_slug(c.linkedin)
            details.append(d)
        data = await ctx.apollo_call("POST", "/organizations/bulk_enrich", kind="org_enrich_calls",
                                     json_body={"details": details})
        if data is None:
            ctx.enrich_disabled = True     # type: ignore[attr-defined]
            ctx.warn("Apollo company enrichment didn't answer — real headcount and parent-group checks were "
                     "skipped for the rest of this scan (the < 100 search filter still applied).")
            return
        orgs = [o for o in (data.get("organizations") or []) if isinstance(o, dict)]
        for c in chunk:
            org = next((o for o in orgs if _org_matches(c, o)), None)
            if org is None:
                for k in _enrich_cache_keys(c):
                    ctx.company_cache_out[k] = {"unmatched": True, "t": _iso()}
                continue
            a["orgs_enriched"] += 1
            apply_enrichment(c, org)
            entry = {k: org.get(k) for k in ENRICH_FIELDS if org.get(k) not in (None, "")}
            entry["keywords"] = c.keywords
            entry["parent"] = c.parent
            entry["t"] = _iso()
            for k in _enrich_cache_keys(c):
                if len(ctx.company_cache_out) < CACHE_MAX_ENTRIES:
                    ctx.company_cache_out[k] = entry


def verify_budget(max_companies: int) -> int:
    """At most this many shortlisted companies are enriched per scan (1 Apollo credit each, cached).
    Mirrored in HiringIntel.js (creditHint)."""
    return min(60, 2 * int(max_companies) + 10)


def verify_reject(ctx: RunContext, c: Company) -> Tuple[str, str]:
    """(reason, filter key) or ('', '') if the company survives the stricter checks."""
    why = company_agency_reason(c)
    if why:
        return f"staffing/recruitment firm ({why})", "agency"
    if c.mismatch:
        return f"Apollo's record is a different company (/{c.mismatch})", "identity_mismatch"
    if c.size is not None and (c.size > ctx.p.max_headcount or c.size < 1):
        return f"{c.size} staff (Apollo)", "headcount_too_big"
    if is_known_large(c.name):
        return "known large employer", "known_large"
    if c.parent and ctx.p.require_verified_headcount:
        return f"part of {c.parent}", "subsidiary"
    if ctx.p.hq_ireland_only:
        if c.country and not is_irish_country(c.country):
            return f"HQ in {c.country}", "hq_outside_ireland"
        loc = linkedin_locale(c.linkedin)
        if loc and loc != "ie" and not (c.enriched and is_irish_country(c.country)):
            return f"LinkedIn page is registered in {loc.upper()}", "foreign_linkedin"
    return "", ""


async def verify_companies(ctx: RunContext, candidates: List[Company]) -> List[Company]:
    """Walk the shortlist in priority order, 10 at a time, until enough companies survive."""
    stage = "verify"
    # Companies with a known role first; among them, ones already enriched in an earlier scan first
    # (free), so re-running a scan doesn't buy new enrichments just because the order shifted.
    rank = {id(c): i for i, c in enumerate(candidates)}
    order = sorted(candidates, key=lambda c: (0 if c.jobs else 1,
                                              0 if _cache_get(ctx, _enrich_cache_keys(c)) else 1, rank[id(c)]))
    budget = verify_budget(ctx.p.max_companies)      # paid enrichments allowed this scan
    want_with_jobs = ctx.p.max_companies
    keep: List[Company] = []
    checked = paid = 0
    use_linkedin = "linkedin" in ctx.p.sources
    is_free = lambda c: bool(_cache_get(ctx, _enrich_cache_keys(c)) or company_agency_reason(c))  # noqa: E731
    while checked < len(order) and checked < 3 * budget:
        have = len([c for c in keep if c.jobs])
        if have >= want_with_jobs:
            break
        # Batch: every free company next in line, plus only as many paid ones as are still needed.
        need = min(10, want_with_jobs - have)
        chunk: List[Company] = []
        new_paid = 0
        while checked + len(chunk) < len(order) and len(chunk) < 30:
            c = order[checked + len(chunk)]
            free = is_free(c)
            if not free and (new_paid >= need or paid + new_paid >= budget):
                break
            chunk.append(c)
            new_paid += 0 if free else 1
        if not chunk:
            break
        checked += len(chunk)
        if use_linkedin:
            await check_linkedin_job_pages(ctx, chunk)
        # never pay to enrich a company the free checks already ruled out
        to_enrich = [c for c in chunk if not company_agency_reason(c)]
        paid += len([c for c in to_enrich if not _cache_get(ctx, _enrich_cache_keys(c))])
        await enrich_orgs(ctx, to_enrich)
        for c in chunk:
            reason, key = verify_reject(ctx, c)
            if reason:
                ctx.reject(c, reason, key, stage)
            else:
                keep.append(c)
        ctx.bump(40 + 5 * min(1.0, checked / max(1, len(order))))
    for c in order[checked:]:
        ctx.reject(c, "over the company cap (enough companies already verified)", "over_company_cap", stage)
    ctx.log_drops(stage)
    lp, a = ctx.stats["linkedin_pages"], ctx.stats["apollo"]
    ctx.log(f"Verified {checked} shortlisted companies ({lp['checked']} LinkedIn job pages read, "
            f"{a['orgs_enriched']} enriched in Apollo, {a['orgs_enrich_cached']} re-used): {len(keep)} kept")
    return keep


# ════════════════════════════════════════════════════════════════════════
# Company websites — careers pages and public ATS boards
# ════════════════════════════════════════════════════════════════════════
async def _json(ctx: RunContext, url: str) -> Any:
    r = await ctx.web_get(url, headers={"Accept": "application/json"})
    if r is None or r.status_code != 200:
        return None
    try:
        return r.json()
    except Exception:
        return None


async def fetch_ats_board(ctx: RunContext, ats: str, slug: str) -> Tuple[List[Dict[str, Any]], str]:
    """Returns (jobs, board display name or '')."""
    if ats == "greenhouse":
        for base in ("https://boards-api.greenhouse.io", "https://boards-api.eu.greenhouse.io"):
            data = await _json(ctx, f"{base}/v1/boards/{slug}/jobs")
            if data is not None:
                meta = await _json(ctx, f"{base}/v1/boards/{slug}") or {}
                return parse_greenhouse(data, slug), str(meta.get("name") or "")
        return [], ""
    if ats == "lever":
        for base in ("https://api.lever.co", "https://api.eu.lever.co"):
            data = await _json(ctx, f"{base}/v0/postings/{slug}?mode=json")
            if isinstance(data, list):
                return parse_lever(data, slug), ""
        return [], ""
    if ats == "ashby":
        data = await _json(ctx, f"https://api.ashbyhq.com/posting-api/job-board/{slug}")
        return parse_ashby(data, slug), ""
    if ats == "workable":
        data = await _json(ctx, f"https://apply.workable.com/api/v1/widget/accounts/{slug}")
        return parse_workable(data, slug), str((data or {}).get("name") or "") if isinstance(data, dict) else ""
    if ats == "recruitee":
        data = await _json(ctx, f"https://{slug}.recruitee.com/api/offers/")
        return parse_recruitee(data, slug), ""
    if ats == "personio":
        for host in (f"{slug}.jobs.personio.de", f"{slug}.jobs.personio.com"):
            r = await ctx.web_get(f"https://{host}/xml")
            if r is not None and r.status_code == 200 and "<position" in r.text:
                return parse_personio(r.text, slug, host), ""
        return [], ""
    if ats == "bamboohr":
        data = await _json(ctx, f"https://{slug}.bamboohr.com/careers/list")
        return parse_bamboohr(data, slug), ""
    return [], ""


async def scan_company_website(ctx: RunContext, reg: CompanyRegistry, c: Company) -> int:
    if not c.domain:
        return 0
    found_postings: List[Tuple[str, Dict[str, Any]]] = []
    refs: List[Tuple[str, str]] = []
    pages_seen: set = set()
    queue = [f"https://{c.domain}/", f"https://{c.domain}/careers"]
    while queue and len(pages_seen) < 3:
        url = queue.pop(0)
        if url in pages_seen:
            continue
        pages_seen.add(url)
        r = await ctx.web_get(url, headers={"User-Agent": BROWSER_UA, "Accept": "text/html,*/*;q=0.8"})
        if r is None or r.status_code >= 400:
            continue
        # HTML parsing is CPU work — keep it off the event loop so the CRM stays responsive.
        page_refs, page_jobs, page_links = await asyncio.to_thread(_analyse_page, r.text, str(r.url))
        for ref in page_refs:
            if ref not in refs:
                refs.append(ref)
        for jp in page_jobs:
            found_postings.append(("Company website", jp))
        for link in page_links:
            if link not in pages_seen and link not in queue:
                queue.insert(0, link)
    verified_guess = False
    if not refs and not found_postings:
        # No link to an ATS on the site — try the two boards that let us verify ownership by name.
        guess = c.domain.split(".")[0]
        for ats in ("greenhouse", "workable"):
            jobs, board_name = await fetch_ats_board(ctx, ats, guess)
            if jobs and board_name and company_key(board_name) == c.key:
                found_postings += [(f"Company website ({ats.title()})", j) for j in jobs]
                verified_guess = True
                break
    for ats, slug in refs[:2]:
        jobs, _ = await fetch_ats_board(ctx, ats, slug)
        found_postings += [(f"Company website ({ats.title()})", j) for j in jobs]
    added = 0
    for source, jp in found_postings:
        if _ingest(ctx, reg, source=source, title=jp.get("title"), company=c.name, location=jp.get("location"),
                   url=jp.get("url"), employment_raw=jp.get("employment_raw"), posted_at=jp.get("posted_at"),
                   target=c):
            added += 1
    if refs or found_postings or verified_guess:
        ctx.source_stat("Company websites", requests=0, companies=1)
    return added


async def apollo_job_postings(ctx: RunContext, reg: CompanyRegistry, c: Company) -> int:
    if not c.apollo_id or ctx.apollo_disabled or ctx.job_postings_disabled:
        return 0
    data = await ctx.apollo_call("GET", f"/organizations/{c.apollo_id}/job_postings", kind="job_posting_calls",
                                 params={"page": 1, "per_page": 100})
    added = 0
    for jp in parse_apollo_job_postings(data):
        # Apollo already matched this company on "job located in Ireland"; when a posting has no
        # location of its own, trust that only for an Irish-HQ company.
        known_ie = not jp.get("location") and is_irish_country(c.country)
        if _ingest(ctx, reg, source="Apollo", title=jp["title"], company=c.name, location=jp.get("location"),
                   url=jp.get("url"), employment_raw=jp.get("employment_raw"), posted_at=jp.get("posted_at"),
                   target=c, location_known_ie=known_ie):
            added += 1
    return added


def website_targets(companies: List[Company], max_companies: int) -> List[Company]:
    """Companies whose careers pages get read. Those with roles already found fill the cap first;
    companies Apollo flagged as hiring (no role title yet) get their own allowance, because their
    website / Apollo postings are the only way to find the actual roles."""
    with_jobs = [c for c in companies if c.jobs][:max_companies]
    without = [c for c in companies if not c.jobs][:max(max_companies, 10)]
    return with_jobs + without


async def stage_websites(ctx: RunContext, reg: CompanyRegistry, targets: List[Company]) -> None:
    done = 0

    async def one(c: Company) -> None:
        nonlocal done
        ctx.check_cancel()
        try:
            if "websites" in ctx.p.sources:
                await scan_company_website(ctx, reg, c)
            if not c.jobs and "apollo" in ctx.p.sources:
                await apollo_job_postings(ctx, reg, c)
        except RunCancelled:
            raise
        except Exception as e:                       # one bad website never sinks the run
            log.debug(f"[hiring-intel] website scan {c.domain}: {e}")
        done += 1
        ctx.bump(45 + 20 * done / max(1, len(targets)))

    if "websites" in ctx.p.sources:
        ctx.source_stat("Company websites", status="running")
    results = await asyncio.gather(*(one(c) for c in targets), return_exceptions=True)
    if any(isinstance(r, RunCancelled) for r in results):
        raise RunCancelled()
    if "websites" in ctx.p.sources:
        ctx.source_stat("Company websites", status="ok")
        ctx.log(f"Company websites: checked {len(targets)} careers pages / job boards")


# ════════════════════════════════════════════════════════════════════════
# Contacts — Apollo people search (free) + enrichment (credits)
# ════════════════════════════════════════════════════════════════════════
async def find_icp_people(ctx: RunContext, c: Company) -> List[Dict[str, Any]]:
    if ctx.apollo_disabled or not (c.apollo_id or c.domain):
        return []
    params: List[Tuple[str, Any]] = [("page", 1), ("per_page", 25)]
    if c.apollo_id:
        params.append(("organization_ids[]", c.apollo_id))
    else:
        params.append(("q_organization_domains_list[]", c.domain))
    params += [("person_titles[]", t) for t in APOLLO_ICP_TITLES]
    data = await ctx.apollo_call("POST", "/mixed_people/api_search", kind="people_search_calls", params=params)
    people = (data or {}).get("people") or (data or {}).get("contacts") or []
    ranked: List[Dict[str, Any]] = []
    seen: set = set()
    for p in people:
        if not isinstance(p, dict):
            continue
        pid = str(p.get("id") or p.get("person_id") or "")
        if not pid or pid in seen:
            continue
        # Apollo matches loosely on title; make sure the person is really at THIS company.
        org = p.get("organization") or {}
        if c.apollo_id and p.get("organization_id") and str(p.get("organization_id")) != c.apollo_id:
            continue
        if not c.apollo_id and org.get("name") and company_key(org.get("name")) != c.key:
            continue
        role, rank = classify_icp(p.get("title"))
        if not role:
            continue
        seen.add(pid)
        ranked.append({"id": pid, "title": clean_text(p.get("title"), 160), "role": role, "rank": rank,
                       "first_name": p.get("first_name") or "",
                       "last_name": p.get("last_name") or "",
                       "name": clean_text(p.get("name") or f"{p.get('first_name') or ''} {p.get('last_name') or ''}", 120),
                       "linkedin_url": p.get("linkedin_url") or ""})
    ranked.sort(key=lambda x: x["rank"])
    return ranked[: ctx.p.contacts_per_company]


async def _previous_contact_data(person_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Contact data already bought in a retained run — re-used so Apollo isn't paid twice."""
    out: Dict[str, Dict[str, Any]] = {}
    for i in range(0, len(person_ids), 100):
        chunk = person_ids[i:i + 100]
        try:
            res = await _run(lambda chunk=chunk: _sb("hiring_intel_leads")
                             .select("apollo_person_id,person_name,person_title,email,email_status,phone,phone_status,linkedin_url,enriched_at")
                             .in_("apollo_person_id", chunk).execute())
        except Exception as e:
            log.warning(f"[hiring-intel] previous contact lookup failed: {_integ._redact(e)}")
            return out
        for row in res.data or []:
            pid = row.get("apollo_person_id")
            prev = out.get(pid)
            # keep the richest previous record
            if not row.get("enriched_at"):
                continue                        # never actually enriched (e.g. Apollo was rate-limited)
            if prev is None or (not prev.get("phone") and row.get("phone")) or (not prev.get("email") and row.get("email")):
                out[pid] = row
    return out


async def enrich_people(ctx: RunContext, people: List[Dict[str, Any]]) -> None:
    """Fills email / phone / linkedin / full name in place."""
    if not people or ctx.apollo_disabled:
        return
    prev = await _previous_contact_data([p["id"] for p in people])
    to_buy: List[Dict[str, Any]] = []
    for p in people:
        old = prev.get(p["id"])
        # Re-use anything already enriched in a retained run — including "Apollo has no email for
        # this person" — unless we now need a phone that was never requested for them.
        phone_settled = old is not None and (old.get("phone") or old.get("phone_status") == "none")
        if old and (not ctx.p.reveal_phones or phone_settled):
            p.update({"email": old.get("email"), "email_status": old.get("email_status"), "enriched_at": old.get("enriched_at"),
                      "phone": old.get("phone"), "linkedin_url": old.get("linkedin_url") or p.get("linkedin_url"),
                      "name": old.get("person_name") or p.get("name"),
                      "phone_status": "found" if old.get("phone") else
                      ("none" if old.get("phone_status") == "none" else "not_requested")})
            ctx.stats["apollo"]["contacts_reused"] += 1
        else:
            to_buy.append(p)
    if to_buy:
        ctx.log(f"Enriching {len(to_buy)} decision-makers in Apollo"
                f"{' (with phone numbers)' if ctx.p.reveal_phones else ''}")
    by_id = {p["id"]: p for p in to_buy}
    pending_requests: List[str] = []
    for i in range(0, len(to_buy), 10):
        ctx.check_cancel()
        chunk = to_buy[i:i + 10]
        params: List[Tuple[str, Any]] = [("reveal_personal_emails", "false")]
        if ctx.p.reveal_phones:
            params += [("reveal_phone_number", "true"), ("poll_only", "true")]
        data = await ctx.apollo_call("POST", "/people/bulk_match", kind="enrich_calls", params=params,
                                     json_body={"details": [{"id": p["id"]} for p in chunk],
                                                "reveal_personal_emails": False,
                                                **({"reveal_phone_number": True, "poll_only": True}
                                                   if ctx.p.reveal_phones else {})})
        ctx.bump(70 + 15 * (i + len(chunk)) / max(1, len(to_buy)))
        if data is None:
            if ctx.apollo_disabled:
                break
            continue
        try:
            ctx.stats["apollo"]["credits_consumed"] += float(data.get("credits_consumed") or 0)
        except (TypeError, ValueError):
            pass
        for m in data.get("matches") or []:
            if not isinstance(m, dict):
                continue
            p = by_id.get(str(m.get("id") or ""))
            if p is None:
                continue
            p["enriched_at"] = _iso()
            p["name"] = clean_text(m.get("name") or f"{m.get('first_name') or ''} {m.get('last_name') or ''}", 120) or p["name"]
            p["title"] = clean_text(m.get("title"), 160) or p["title"]
            p["linkedin_url"] = m.get("linkedin_url") or p.get("linkedin_url") or ""
            p["email"] = clean_email(m.get("email"))
            p["email_status"] = m.get("email_status") or ""
            phone = pick_phone(m.get("phone_numbers")) or pick_phone((m.get("contact") or {}).get("phone_numbers"))
            if phone:
                p["phone"], p["phone_status"] = phone, "found"
        rid = data.get("request_id")
        if ctx.p.reveal_phones and rid is not None:
            rid = str(rid)
            pending_requests.append(rid)
            for p in chunk:
                if not p.get("phone"):
                    p["phone_status"], p["phone_request_id"] = "pending", rid
        for p in chunk:
            p.setdefault("phone_status", "not_requested" if not ctx.p.reveal_phones else "none")
    if pending_requests:
        await poll_phone_results(ctx, pending_requests, by_id, budget_seconds=150)


async def _poll_once(client: httpx.AsyncClient, request_id: str) -> Tuple[str, Any, float]:
    """('ready', data, 0) | ('pending', None, retry_after) | ('gone', None, 0)."""
    try:
        r = await client.get(f"{APOLLO_BASE}/webhook_result/{request_id}")
    except httpx.HTTPError:
        return "pending", None, 10.0
    if r.status_code == 200:
        try:
            return "ready", r.json(), 0.0
        except Exception:
            return "gone", None, 0.0
    if r.status_code == 404:
        try:
            body = r.json()
        except Exception:
            body = {}
        if str(body.get("error_code") or "") == "result_pending":
            return "pending", None, float(body.get("retry_after_seconds") or 10)
        return "gone", None, 0.0
    if r.status_code == 429 or r.status_code >= 500:
        return "pending", None, 15.0
    return "gone", None, 0.0


def _phones_from_poll(data: Any) -> Dict[str, Optional[str]]:
    """{person_id: phone or None} from an Apollo poll / webhook payload.
    Apollo doesn't document this body, and it differs between phone and waterfall enrichment
    (people[].phone_numbers, matches[].phone_numbers, person.contact.phone_numbers,
    people[].waterfall.phone_numbers …). So walk the whole payload: any object carrying a person id
    owns the phone numbers found anywhere beneath it."""
    out: Dict[str, Optional[str]] = {}

    def numbers_under(node: Any, depth: int = 0) -> List[Any]:
        found: List[Any] = []
        if depth > 4:
            return found
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ("phone_numbers", "mobile_phone_numbers") and isinstance(v, list):
                    found.extend(v)
                elif k in ("sanitized_phone", "mobile_phone", "direct_phone") and isinstance(v, str) and v:
                    found.append({"sanitized_number": v, "type_cd": "mobile" if "mobile" in k else "direct"})
                elif isinstance(v, (dict, list)) and k not in ("organization", "account", "employment_history"):
                    found.extend(numbers_under(v, depth + 1))
        elif isinstance(node, list):
            for v in node:
                found.extend(numbers_under(v, depth + 1))
        return found

    def walk(node: Any, depth: int = 0) -> None:
        if depth > 6:
            return
        if isinstance(node, dict):
            pid = node.get("id") or node.get("person_id")
            looks_like_person = pid and any(k in node for k in ("phone_numbers", "first_name", "name", "contact",
                                                                "waterfall", "status", "linkedin_url"))
            # Apollo person ids are hex strings; a bare number here is a request_id, not a person
            if looks_like_person and (not str(pid).isdigit() or "phone_numbers" in node):
                out[str(pid)] = pick_phone(numbers_under(node)) or out.get(str(pid))
                return
            for v in node.values():
                walk(v, depth + 1)
        elif isinstance(node, list):
            for v in node:
                walk(v, depth + 1)

    walk(data)
    return out


async def poll_phone_results(ctx: RunContext, request_ids: List[str], by_id: Dict[str, Dict[str, Any]],
                             budget_seconds: int) -> None:
    deadline = time.monotonic() + budget_seconds
    waiting = list(dict.fromkeys(request_ids))
    ctx.log(f"Waiting for Apollo to deliver phone numbers ({len(waiting)} batch(es))")
    while waiting and time.monotonic() < deadline:
        ctx.check_cancel()
        next_wait = 10.0
        for rid in list(waiting):
            async with ctx.apollo_sem:
                state, data, retry = await _poll_once(ctx.apollo, rid)   # type: ignore[arg-type]
            if state == "pending":
                next_wait = min(next_wait, max(3.0, retry))
                continue
            waiting.remove(rid)
            parsed = _phones_from_poll(data)
            ctx.log(f"Apollo phone result: {len(parsed)} people, {len([v for v in parsed.values() if v])} with a "
                    f"number" + ("" if parsed or state != "ready" else
                                 f" (unrecognised payload; keys: {', '.join(list(data)[:8]) if isinstance(data, dict) else type(data).__name__})"))
            for pid, phone in parsed.items():
                p = by_id.get(pid)
                if p is not None:
                    p["phone"] = phone or p.get("phone")
                    p["phone_status"] = "found" if p.get("phone") else "none"
                    p["phone_request_id"] = None
            for p in by_id.values():
                if p.get("phone_request_id") == rid and p.get("phone_status") == "pending":
                    p["phone_status"], p["phone_request_id"] = "none", None
        if waiting:
            await asyncio.sleep(min(next_wait, max(0.0, deadline - time.monotonic())))
    if waiting:
        ctx.log("Some phone numbers are still being prepared by Apollo — use “Refresh phones” later.")


# ════════════════════════════════════════════════════════════════════════
# Persistence
# ════════════════════════════════════════════════════════════════════════
async def _fetch_all(table: str, select: str, run_id: str, order: str = "created_at") -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    off = 0
    while True:
        res = await _run(lambda off=off: _sb(table).select(select).eq("run_id", run_id)
                         .order(order).order("id").range(off, off + 999).execute())
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
        off += 1000


async def _insert_chunks(table: str, rows: List[Dict[str, Any]]) -> None:
    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        await _run(lambda chunk=chunk: _sb(table).insert(chunk).execute())


async def _previous_run_snapshot(run_id: str) -> Tuple[Dict[str, str], set]:
    """(job fingerprint -> first_seen_at, company keys) of the latest completed run before this one."""
    try:
        res = await _run(lambda: _sb("hiring_intel_runs").select("id").eq("status", "completed")
                         .neq("id", run_id).order("created_at", desc=True).limit(1).execute())
        if not res.data:
            return {}, set()
        prev_id = res.data[0]["id"]
        jobs = await _fetch_all("hiring_intel_jobs", "fingerprint,first_seen_at,company_key", prev_id)
        return ({j["fingerprint"]: j["first_seen_at"] for j in jobs}, {j["company_key"] for j in jobs})
    except Exception as e:
        log.warning(f"[hiring-intel] previous run lookup failed: {_integ._redact(e)}")
        return {}, set()


def build_rows(run_id: str, companies: List[Company], contacts: Dict[str, List[Dict[str, Any]]],
               prev_jobs: Dict[str, str], prev_companies: set, now_iso: str) -> Tuple[List[dict], List[dict]]:
    job_rows: List[dict] = []
    lead_rows: List[dict] = []
    seen_fp: set = set()
    for c in companies:
        jobs = sorted(c.jobs.values(), key=lambda j: (j.get("posted_at") or ""), reverse=True)
        titles, links, types, cats = [], [], [], []
        for j in jobs:
            fp = job_fingerprint(c.key, j["title"])
            if fp in seen_fp:
                continue
            seen_fp.add(fp)
            job_rows.append({
                "run_id": run_id, "fingerprint": fp, "company_key": c.key, "company_name": c.name,
                "title": j["title"], "category": j["category"], "employment_type": j["employment_type"],
                "location": j["location"][:200] if j.get("location") else None,
                "job_url": j["url"] or None, "other_urls": j["other_urls"][:5], "sources": j["sources"],
                "posted_at": j.get("posted_at"), "first_seen_at": prev_jobs.get(fp, now_iso),
                "is_new": fp not in prev_jobs,
            })
            titles.append(j["title"])
            # kept index-aligned with hiring_for (may be "" when a posting has no link)
            links.append(j["url"] or (j["other_urls"][0] if j["other_urls"] else ""))
            if j["employment_type"] not in types:
                types.append(j["employment_type"])
            if j["category"] not in cats:
                cats.append(j["category"])
        base = {
            "run_id": run_id, "company_key": c.key, "company_name": c.name,
            "company_domain": c.domain or None, "company_website": c.website or (f"https://{c.domain}" if c.domain else None),
            "company_linkedin": c.linkedin or None, "company_size": c.size, "company_industry": c.industry or None,
            "company_city": c.city or None, "company_phone": c.phone or None, "apollo_org_id": c.apollo_id or None,
            "hiring_for": titles, "job_links": links, "employment_types": types,
            "categories": cats, "is_new_company": c.key not in prev_companies,
        }
        people = contacts.get(c.key) or []
        if not people:
            lead_rows.append({**base, "person_key": "", "phone_status": None})
            continue
        for p in people:
            lead_rows.append({
                **base, "person_key": p["id"], "apollo_person_id": p["id"],
                "person_name": p.get("name") or None, "person_title": p.get("title") or None,
                "icp_role": p.get("role"), "email": p.get("email"), "email_status": p.get("email_status") or None,
                "phone": p.get("phone"), "phone_status": p.get("phone_status"),
                "phone_request_id": p.get("phone_request_id"), "linkedin_url": p.get("linkedin_url") or None,
                "enriched_at": p.get("enriched_at"),
            })
    return job_rows, lead_rows


def contact_summary(lead_rows: List[Dict[str, Any]]) -> Dict[str, int]:
    return {
        "with_email": len([r for r in lead_rows if r.get("email")]),
        "with_phone": len([r for r in lead_rows if r.get("phone")]),
        "phones_pending": len([r for r in lead_rows if r.get("phone_status") == "pending"]),
    }


async def prune_old_runs() -> int:
    """Keep at most MAX_RUNS_KEPT runs. Failed / cancelled runs are removed before completed ones,
    so a streak of failures can never wipe out the last good results (or the re-use caches)."""
    try:
        res = await _run(lambda: _sb("hiring_intel_runs").select("id,status,created_at")
                         .order("created_at", desc=True).limit(50).execute())
    except Exception as e:
        log.warning(f"[hiring-intel] prune list failed: {_integ._redact(e)}")
        return 0
    rows = res.data or []
    excess = len(rows) - MAX_RUNS_KEPT
    if excess <= 0:
        return 0
    oldest_first = list(reversed(rows))
    unsuccessful = [r for r in oldest_first if r.get("status") in ("failed", "cancelled")]
    completed = [r for r in oldest_first if r.get("status") == "completed"]
    doomed = [r["id"] for r in (unsuccessful + completed)[:excess]]
    for rid in doomed:
        try:
            await _run(lambda rid=rid: _sb("hiring_intel_runs").delete().eq("id", rid).execute())
        except Exception as e:
            log.warning(f"[hiring-intel] prune delete failed: {_integ._redact(e)}")
    return len(doomed)


# ════════════════════════════════════════════════════════════════════════
# Orchestrator
# ════════════════════════════════════════════════════════════════════════
async def pipeline(ctx: RunContext) -> Dict[str, int]:
    reg = CompanyRegistry()
    p = ctx.p

    # 1 ── DISCOVER (sources run concurrently; each is self-contained)
    ctx.set_stage("discover", 3)
    ctx.log(f"Scanning the last {p.days_back} day(s) for {' & '.join(p.employment_types).lower()} Data & AI roles in Ireland")
    tasks = []
    if "linkedin" in p.sources:
        tasks.append(source_linkedin(ctx, reg))
    if "jooble" in p.sources:
        tasks.append(source_jooble(ctx, reg))
    if "apollo" in p.sources:
        tasks.append(source_apollo_companies(ctx, reg))
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for r in results:
        if isinstance(r, RunCancelled):
            raise r
        if isinstance(r, Exception):
            ctx.warn(f"A source failed: {type(r).__name__}: {str(r)[:160]}")
    ctx.check_cancel()

    # 2 ── QUALIFY
    ctx.set_stage("qualify", 35)
    await load_company_cache(ctx)
    await resolve_companies(ctx, reg)
    candidates = qualify(ctx, reg)
    # Companies Apollo found as hiring come in with no jobs yet — they stay candidates for the website stage.
    candidates.sort(key=lambda c: (-len(c.jobs), c.name.lower()))
    ctx.log(f"{len(candidates)} companies pass the headcount / Ireland / non-agency checks")
    ctx.check_cancel()
    if candidates:
        candidates = await verify_companies(ctx, candidates)
    if not candidates:
        ctx.warn("No company passed the checks — open “How this scan found and filtered results” to see why. "
                 "A longer “Posted within” window or a higher “Max companies” gives Apollo more to check.")
    ctx.check_cancel()

    # 3 ── COMPANY WEBSITES (+ Apollo job postings as a fallback)
    ctx.set_stage("websites", 45)
    targets = website_targets(candidates, p.max_companies)
    await stage_websites(ctx, reg, targets)
    with_roles = [c for c in targets if c.jobs]
    ctx.stats["filtered"]["no_qualifying_jobs"] += len([c for c in targets if not c.jobs])
    with_roles.sort(key=lambda c: (-len(c.jobs), c.name.lower()))
    final = with_roles[: p.max_companies]
    over_cap = len(with_roles) - len(final) + len([c for c in candidates if c not in targets])
    if over_cap > 0:
        ctx.stats["filtered"]["over_company_cap"] += over_cap
    ctx.log(f"{len(final)} companies with {sum(len(c.jobs) for c in final)} matching open roles")
    ctx.check_cancel()

    # 4 ── CONTACTS
    ctx.set_stage("contacts", 65)
    contacts: Dict[str, List[Dict[str, Any]]] = {}
    if ctx.apollo_disabled:
        ctx.warn("Apollo unavailable — the sheet has companies and roles but no decision-maker contacts.")
    else:
        ctx.log(f"Finding CEO / CTO / Founder / Data head at {len(final)} companies")
        done = 0

        async def people_for(c: Company) -> None:
            nonlocal done
            ctx.check_cancel()
            contacts[c.key] = await find_icp_people(ctx, c)
            done += 1
            ctx.bump(65 + 5 * done / max(1, len(final)))

        results = await asyncio.gather(*(people_for(c) for c in final), return_exceptions=True)
        for r in results:
            if isinstance(r, RunCancelled):
                raise r
            if isinstance(r, Exception):
                ctx.log(f"Contact search error: {type(r).__name__}", "warn")
        # one person can't be listed under two companies (Apollo occasionally links a founder to both)
        claimed: set = set()
        for c in final:
            contacts[c.key] = [x for x in contacts.get(c.key, []) if not (x["id"] in claimed or claimed.add(x["id"]))]
        everyone = [person for ps in contacts.values() for person in ps]
        await enrich_people(ctx, everyone)
    ctx.check_cancel()

    # 5 ── SAVE
    ctx.set_stage("save", 92)
    prev_jobs, prev_companies = await _previous_run_snapshot(ctx.run_id)
    job_rows, lead_rows = build_rows(ctx.run_id, final, contacts, prev_jobs, prev_companies, _iso())
    await _insert_chunks("hiring_intel_jobs", job_rows)
    await _insert_chunks("hiring_intel_leads", lead_rows)
    counts = {
        "jobs_count": len(job_rows),
        "companies_count": len(final),
        "contacts_count": len([r for r in lead_rows if r.get("person_key")]),
    }
    ctx.stats["summary"] = {
        **counts,
        "new_jobs": len([j for j in job_rows if j["is_new"]]),
        "new_companies": len([c for c in final if c.key not in prev_companies]),
        **contact_summary(lead_rows),
    }
    ctx.log(f"Saved {counts['jobs_count']} roles, {counts['companies_count']} companies, "
            f"{counts['contacts_count']} contacts")
    return counts


async def execute_run(run_id: str, params: RunParams) -> None:
    ctx = RunContext(run_id, params)
    _CONTEXTS[run_id] = ctx
    ticker: Optional[asyncio.Task] = None
    status, error, counts = "failed", None, {}
    try:
        ctx.web = httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0), follow_redirects=False,
                                    headers={"User-Agent": BROWSER_UA})   # redirects handled in web_get
        ctx.apollo = httpx.AsyncClient(timeout=_integ._TIMEOUT, headers={
            "x-api-key": apollo_key(), "Content-Type": "application/json",
            "Cache-Control": "no-cache", "accept": "application/json"})
        await _run(lambda: _sb("hiring_intel_runs").update({
            "status": "running", "started_at": _iso(), "heartbeat_at": _iso(), "stage": "discover", "progress": 1,
        }).eq("id", run_id).execute())
        ticker = asyncio.create_task(ctx.ticker())
        counts = await pipeline(ctx)
        status = "completed"
    except RunCancelled:
        status = "cancelled"
        ctx.log("Scan cancelled", "warn")
    except Exception as e:
        status, error = "failed", f"{type(e).__name__}: {_integ._redact(e)}"[:500]
        log.exception(f"[hiring-intel] run {run_id} failed")
        ctx.log(f"Scan failed: {error}", "error")
    finally:
        if ticker:
            ticker.cancel()
        for client in (ctx.web, ctx.apollo):
            if client is not None:
                try:
                    await client.aclose()
                except Exception:
                    pass
        ctx.stats["elapsed_seconds"] = int(time.monotonic() - ctx.started)
        final_patch = {"status": status, "error": error, "finished_at": _iso(), "heartbeat_at": _iso(),
                       "progress": 100 if status == "completed" else ctx.progress,
                       "stage": "done" if status == "completed" else ctx.stage,
                       "events": ctx.events, "stats": ctx.stats, **counts}
        if status == "completed":
            # carry forward still-fresh knowledge so it survives older runs being pruned
            merged = {k: v for k, v in ctx.company_cache_in.items() if _cache_get(ctx, [k])}
            merged.update(ctx.company_cache_out)
            final_patch["company_cache"] = dict(list(merged.items())[-CACHE_MAX_ENTRIES:])
        final_patch = json.loads(json.dumps(final_patch, default=str))
        async with ctx._write_lock:             # an in-flight heartbeat finishes first, then never again
            ctx.finished = True
            if not ctx.deleted:
                try:
                    await _run(lambda: _sb("hiring_intel_runs").update(final_patch).eq("id", run_id).execute())
                except Exception as e:
                    log.error(f"[hiring-intel] final status write failed: {_integ._redact(e)}")
        _CONTEXTS.pop(run_id, None)
        _TASKS.pop(run_id, None)
        await prune_old_runs()


async def recover_orphaned_runs() -> int:
    """A HuggingFace restart kills in-flight runs; free the 'one active run' slot they hold."""
    try:
        res = await _run(lambda: _sb("hiring_intel_runs").select("id,heartbeat_at,status")
                         .in_("status", ["queued", "running"]).execute())
    except Exception as e:
        log.warning(f"[hiring-intel] orphan check failed: {_integ._redact(e)}")
        return 0
    fixed = 0
    for row in res.data or []:
        if row["id"] in _TASKS:
            continue
        try:
            hb = datetime.fromisoformat(str(row.get("heartbeat_at")).replace("Z", "+00:00"))
        except Exception:
            hb = _now() - timedelta(days=1)
        if (_now() - hb).total_seconds() < ORPHAN_AFTER_SECONDS:
            continue
        try:
            await _run(lambda rid=row["id"]: _sb("hiring_intel_runs").update({
                "status": "failed", "finished_at": _iso(),
                "error": "Interrupted — the server restarted while this scan was running. Start a new scan.",
            }).eq("id", rid).execute())
            fixed += 1
        except Exception as e:
            log.warning(f"[hiring-intel] orphan fix failed: {_integ._redact(e)}")
    return fixed


# ════════════════════════════════════════════════════════════════════════
# HTTP API
# ════════════════════════════════════════════════════════════════════════
router = APIRouter(prefix="/api/hiring-intel", tags=["hiring-intel"])

_RUN_LIST_COLS = ("id,status,stage,progress,params,stats,error,cancel_requested,jobs_count,companies_count,"
                  "contacts_count,triggered_by_name,created_at,started_at,finished_at,heartbeat_at")


async def _user(request: Request) -> dict:
    user = await _get_user(request)
    _require_module(user, "sales")
    return user


def _fire_audit(action: str, user: dict, entity_id: str, request: Request, new_value: Optional[dict] = None) -> None:
    if _audit is None:
        return
    try:
        asyncio.create_task(_audit(action, user=user, entity_type="hiring_intel_run", entity_id=entity_id,
                                   entity_name="Hiring Intel scan", new_value=new_value,
                                   ip=request.client.host if request.client else None,
                                   ua=request.headers.get("user-agent", "")))
    except Exception:
        pass


async def _get_run(run_id: str, cols: str = "*") -> dict:
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", run_id or ""):
        raise HTTPException(404, "Scan not found.")
    res = await _run(lambda: _sb("hiring_intel_runs").select(cols).eq("id", run_id).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Scan not found — it may have been deleted or rotated out (only the latest 5 are kept).")
    return res.data[0]


@router.get("/config")
async def get_config(request: Request):
    await _user(request)
    return {
        "sources": {
            "linkedin": {"configured": True, "label": "LinkedIn jobs"},
            "websites": {"configured": True, "label": "Company careers pages"},
            "apollo": {"configured": bool(apollo_key()), "label": "Apollo"},
            "jooble": {"configured": bool(jooble_key()), "label": "Jooble job portal"},
        },
        "defaults": RunParams().model_dump(),
        "max_runs_kept": MAX_RUNS_KEPT,
        "keywords": SEARCH_KEYWORDS,
        "icp_roles": ["Data Head", "CTO", "CEO", "Founder", "Co-Founder"],
    }


@router.get("/runs")
async def list_runs(request: Request):
    await _user(request)
    await recover_orphaned_runs()
    res = await _run(lambda: _sb("hiring_intel_runs").select(_RUN_LIST_COLS)
                     .order("created_at", desc=True).limit(MAX_RUNS_KEPT + 1).execute())
    rows = res.data or []
    active = next((r for r in rows if r["status"] in ("queued", "running")), None)
    # Latest 5, newest first. While a scan runs there can briefly be 6 rows (pruned on completion).
    return {"runs": rows[:MAX_RUNS_KEPT], "active_run_id": active["id"] if active else None,
            "max_runs_kept": MAX_RUNS_KEPT}


@router.post("/runs", status_code=201)
async def start_run(body: RunParams, request: Request):
    user = await _user(request)
    await recover_orphaned_runs()
    row = {"status": "queued", "params": body.model_dump(), "triggered_by": user.get("id"),
           "triggered_by_name": user.get("name") or user.get("email"), "stage": "queued", "progress": 0,
           "events": [{"t": _iso(), "level": "info", "msg": f"Scan queued by {user.get('name') or 'a user'}"}]}
    try:
        res = await _run(lambda: _sb("hiring_intel_runs").insert(row).execute())
    except Exception as e:
        msg = str(e)
        if "uq_hiring_intel_one_active" in msg or "23505" in msg or "duplicate key" in msg.lower():
            active = await _run(lambda: _sb("hiring_intel_runs").select("id")
                                .in_("status", ["queued", "running"]).limit(1).execute())
            raise HTTPException(409, detail={"msg": "A scan is already running. Wait for it to finish or cancel it.",
                                             "active_run_id": (active.data or [{}])[0].get("id")})
        if "hiring_intel_runs" in msg and ("does not exist" in msg or "PGRST205" in msg or "42P01" in msg):
            raise HTTPException(503, "Hiring Intel tables are missing — run backend/migrations/hiring_intel.sql in Supabase first.")
        raise
    run = res.data[0]
    task = asyncio.create_task(execute_run(run["id"], body))
    _TASKS[run["id"]] = task
    _fire_audit("hiring_intel_run_started", user, run["id"], request, {"params": body.model_dump()})
    return run


@router.get("/runs/{run_id}")
async def get_run(run_id: str, request: Request, include_results: bool = True):
    await _user(request)
    run = await _get_run(run_id, _RUN_LIST_COLS + ",events")
    if not include_results or run["status"] in ("queued", "running"):
        return {"run": run, "jobs": [], "leads": []}
    jobs = await _fetch_all("hiring_intel_jobs", "*", run_id)
    leads = await _fetch_all("hiring_intel_leads", "*", run_id)
    return {"run": run, "jobs": jobs, "leads": leads}


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str, request: Request):
    user = await _user(request)
    run = await _get_run(run_id, "id,status")
    if run["status"] not in ("queued", "running"):
        return {"ok": True, "status": run["status"]}
    await _run(lambda: _sb("hiring_intel_runs").update({"cancel_requested": True}).eq("id", run_id).execute())
    ctx = _CONTEXTS.get(run_id)
    if ctx:
        ctx.cancelled = True
    elif run_id not in _TASKS:
        # nothing is executing it in this process — finish it now so the slot frees immediately
        await _run(lambda: _sb("hiring_intel_runs").update({"status": "cancelled", "finished_at": _iso()})
                   .eq("id", run_id).execute())
    _fire_audit("hiring_intel_run_cancelled", user, run_id, request)
    return {"ok": True, "status": "cancelling"}


@router.delete("/runs/{run_id}")
async def delete_run(run_id: str, request: Request):
    user = await _user(request)
    run = await _get_run(run_id, "id,status")
    if run["status"] in ("queued", "running") and run_id in _TASKS:
        # Deleting now would free the one-active-scan slot while the old task is still spending
        # Apollo credits. Cancel first; the row can be deleted once it has stopped.
        raise HTTPException(409, "This scan is still running — cancel it first, then delete it.")
    await _run(lambda: _sb("hiring_intel_runs").delete().eq("id", run_id).execute())
    _fire_audit("hiring_intel_run_deleted", user, run_id, request, {"status": run["status"]})
    return {"ok": True}


@router.post("/runs/{run_id}/refresh-phones")
async def refresh_phones(run_id: str, request: Request):
    await _user(request)
    await _get_run(run_id, "id")
    if not apollo_key():
        raise HTTPException(503, "APOLLO_API_KEY is not configured.")
    res = await _run(lambda: _sb("hiring_intel_leads").select("id,apollo_person_id,phone_request_id")
                     .eq("run_id", run_id).eq("phone_status", "pending").execute())
    rows = [r for r in (res.data or []) if r.get("phone_request_id")]
    if not rows:
        return {"updated": 0, "still_pending": 0}
    updated = still = 0
    async with httpx.AsyncClient(timeout=_integ._TIMEOUT, headers={"x-api-key": apollo_key(),
                                                                    "accept": "application/json"}) as client:
        for rid in dict.fromkeys(r["phone_request_id"] for r in rows):
            state, data, _ = await _poll_once(client, rid)
            batch = [r for r in rows if r["phone_request_id"] == rid]
            if state == "pending":
                still += len(batch)
                continue
            phones = _phones_from_poll(data) if state == "ready" else {}
            for r in batch:
                phone = phones.get(str(r.get("apollo_person_id") or ""))
                patch = {"phone": phone, "phone_status": "found", "phone_request_id": None} if phone else \
                        {"phone_status": "none", "phone_request_id": None}
                await _run(lambda r=r, patch=patch: _sb("hiring_intel_leads").update(patch).eq("id", r["id"]).execute())
                updated += 1 if phone else 0
    # keep the KPI tiles in step with the rows
    try:
        run_row = await _get_run(run_id, "id,stats")
        all_leads = await _fetch_all("hiring_intel_leads", "id,email,phone,phone_status", run_id)
        stats = run_row.get("stats") or {}
        stats["summary"] = {**(stats.get("summary") or {}), **contact_summary(all_leads)}
        await _run(lambda: _sb("hiring_intel_runs").update({"stats": stats}).eq("id", run_id).execute())
    except Exception as e:
        log.warning(f"[hiring-intel] summary refresh failed: {_integ._redact(e)}")
    return {"updated": updated, "still_pending": still}


class PushToCrmBody(BaseModel):
    company_keys: List[str] = Field(..., min_length=1, max_length=200)


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def _existing_crm_lead(name: str, domain: Optional[str]) -> Optional[str]:
    """Find a lead for the same company even when the name differs ("Acme" vs "Acme Ltd") or
    only the website matches."""
    key = company_key(name)
    if not key:
        return None
    first_word = key.split()[0]
    res = await _run(lambda: _sb("leads").select("id,company,website")
                     .ilike("company", f"%{_escape_like(first_word)}%").limit(200).execute())
    for row in res.data or []:
        if company_key(row.get("company")) == key:
            return row["id"]
        if domain and clean_domain(row.get("website")) == domain:
            return row["id"]
    if domain:
        res = await _run(lambda: _sb("leads").select("id,website").ilike("website", f"%{_escape_like(domain)}%")
                         .limit(20).execute())
        for row in res.data or []:
            if clean_domain(row.get("website")) == domain:
                return row["id"]
    return None


@router.post("/runs/{run_id}/push-to-crm")
async def push_to_crm(run_id: str, body: PushToCrmBody, request: Request):
    """Create one CRM lead per company (company + up to 3 decision-makers). Skips companies already in Leads."""
    user = await _user(request)
    run = await _get_run(run_id, "id,status")
    if run["status"] != "completed":
        raise HTTPException(409, "Only completed scans can be added to the CRM.")
    leads = await _fetch_all("hiring_intel_leads", "*", run_id)
    by_company: Dict[str, List[dict]] = {}
    for r in leads:
        by_company.setdefault(r["company_key"], []).append(r)
    rank = {"Data Head": 1, "CTO": 2, "CEO": 3, "Co-Founder": 4, "Founder": 4}
    created, skipped, failed = [], [], []
    for key in dict.fromkeys(body.company_keys):
        rows = by_company.get(key)
        if not rows:
            failed.append({"company_key": key, "reason": "not in this scan"})
            continue
        first = rows[0]
        if any(r.get("crm_lead_id") for r in rows):
            skipped.append({"company": first["company_name"], "reason": "already added",
                            "lead_id": next(r["crm_lead_id"] for r in rows if r.get("crm_lead_id"))})
            continue
        lead_id = await _existing_crm_lead(first["company_name"], first.get("company_domain"))
        if lead_id:
            await _run(lambda lead_id=lead_id: _sb("hiring_intel_leads").update({"crm_lead_id": lead_id})
                       .eq("run_id", run_id).eq("company_key", key).execute())
            skipped.append({"company": first["company_name"], "reason": "already in CRM", "lead_id": lead_id})
            continue
        people = sorted([r for r in rows if r.get("person_key")], key=lambda r: rank.get(r.get("icp_role"), 9))[:3]
        roles = "; ".join(first.get("hiring_for") or [])
        links = "\n".join(first.get("job_links") or [])
        doc: Dict[str, Any] = {
            "company": first["company_name"], "company_linkedin": first.get("company_linkedin"),
            "website": first.get("company_website"), "source": "Hiring Intel",
            "status": "new", "country": "Ireland", "hq_location": first.get("company_city"),
            "industry": first.get("company_industry"), "domain_focus": ", ".join(first.get("categories") or []) or None,
            "turnover_headcount": str(first["company_size"]) if first.get("company_size") else None,
            "solution_skills": ", ".join(first.get("categories") or []) or None,
            "notes": (f"Hiring for: {roles}\n{links}\n"
                      f"Types: {', '.join(first.get('employment_types') or [])}")[:4000],
            "full_name": (people[0]["person_name"] if people else None) or first["company_name"],
            "assigned_owner_id": user["id"], "created_by": user["id"],
        }
        if people:
            p0 = people[0]
            doc.update({"job_title": p0.get("person_title"), "email": p0.get("email"),
                        "phone": p0.get("phone") or first.get("company_phone"), "linkedin_url": p0.get("linkedin_url")})
        else:
            doc["phone"] = first.get("company_phone")
        for idx, p in enumerate(people[1:], start=2):
            doc.update({f"contact_person_{idx}_name": p.get("person_name"),
                        f"contact_person_{idx}_designation": p.get("person_title"),
                        f"contact_person_{idx}_email": p.get("email"),
                        f"contact_person_{idx}_phone": p.get("phone"),
                        f"contact_person_{idx}_linkedin": p.get("linkedin_url")})
        doc = {k: v for k, v in doc.items() if v not in (None, "")}
        res = None
        for _ in range(6):                       # drop columns an older DB doesn't have (PGRST204)
            try:
                res = await _run(lambda doc=doc: _sb("leads").insert(doc).execute())
                break
            except Exception as e:
                m = re.search(r"Could not find the '(\w+)' column", str(e))
                if "PGRST204" in str(e) and m and m.group(1) in doc:
                    doc.pop(m.group(1))
                    continue
                failed.append({"company": first["company_name"], "reason": str(e)[:160]})
                break
        if not res or not res.data:
            continue
        lead_id = res.data[0]["id"]
        await _run(lambda lead_id=lead_id: _sb("hiring_intel_leads").update({"crm_lead_id": lead_id})
                   .eq("run_id", run_id).eq("company_key", key).execute())
        created.append({"company": first["company_name"], "lead_id": lead_id})
    if created:
        _fire_audit("hiring_intel_pushed_to_crm", user, run_id, request, {"created": len(created)})
    return {"created": created, "skipped": skipped, "failed": failed}


def init(*, sb: Callable[[str], Any], run: Callable[..., Any], get_current_user: Callable[..., Any],
         require_module: Callable[[dict, str], None], audit: Optional[Callable[..., Any]] = None) -> APIRouter:
    """Wire the module to server.py's Supabase helpers and auth. Returns the router to include."""
    global _sb, _run, _get_user, _require_module, _audit
    _sb, _run, _get_user, _require_module, _audit = sb, run, get_current_user, require_module, audit
    return router
