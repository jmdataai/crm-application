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
    CAREERJET_API_KEY    optional — enables CareerJet (aggregates IrishJobs.ie / Jobs.ie)
    SERPER_API_KEY       optional — Google search for websites + LinkedIn X-ray

v3 (22 Oct 2026) — why only 2 of 15 companies were "verified" in the first live scans, and the fixes:
    * Most companies had no website, and every free size check needed one. Websites now also come
      from Clearbit's free name autocomplete (exact name only), Wikidata, Indeed/Glassdoor apply links
      and the LinkedIn company slug, before the old guessing.
    * Apollo's people search matches a domain as a CURRENT OR PREVIOUS employer, so raw counts mixed in
      alumni: a startup whose ex-staff now work at Google looked "too big", and a bank whose alumni
      founded startups looked "small". Every Apollo check now keeps only people whose CURRENT
      organisation is this company (by name) before deciding anything.
    * Apollo's free people search also filters on open job postings, so one call finds small Irish
      companies hiring Data/AI people, already size- and HQ-checked by Apollo.
    * LinkedIn job pages (the slow part) are read only for companies that survived qualification,
      and their text now settles Contract vs Permanent and catches "on behalf of our client" agencies.
    * Every dropped company is listed with its reason (stats.rejected) so the numbers can be traced.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import os
import re
import socket
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
import hiring_sources as hs

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
JOOBLE_URL = os.environ.get("JOOBLE_API_URL", "https://jooble.org/api/").rstrip("/") + "/"

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# LinkedIn is the most rate-sensitive board: fewer, broader searches at a human pace.
LINKEDIN_KEYWORDS = [
    "data engineer", "data scientist", "data analyst", "machine learning", "AI engineer",
    "analytics engineer", "head of data", "business intelligence",
]
# Contract scans: LinkedIn's guest search IGNORES its own job-type filter (f_JT — checked live 24 Oct 2026:
# identical results with and without it, all full-time), but the word "contract" in the keywords does pull
# contract ads. Most are agencies (dropped), the point is the direct employers in between.
LINKEDIN_CONTRACT_KEYWORDS = [
    "data engineer contract", "data analyst contract", "data scientist contract",
    "machine learning contract", "business intelligence contract", "AI engineer contract",
]
LINKEDIN_TIME_BUDGET = 330          # seconds for the LinkedIn SEARCH pages, incl. back-off pauses
LINKEDIN_DETAIL_BUDGET = 240        # seconds for job pages — read later, only for companies that qualified
LINKEDIN_DETAIL_CAP = 60            # job pages read for the true employment type / industry / agency wording
SOURCE_TIME_BUDGET = 360            # every other board
GLASSDOOR_TERMS = [
    "data engineer", "data scientist", "data analyst", "machine learning engineer", "AI engineer",
    "business intelligence", "analytics engineer", "head of data",
]
INDEED_TERMS = [
    "data engineer", "data scientist", "data analyst", "machine learning engineer", "AI engineer",
    "analytics engineer", "business intelligence developer", "head of data", "MLOps", "data architect",
]
CAREERJET_TERMS = [
    "data engineer", "data scientist", "data analyst", "machine learning", "AI engineer",
    "business intelligence", "analytics engineer", "head of data",
]
JOBSIRELAND_TERMS = ["data", "analytics", "machine learning", "artificial intelligence", "business intelligence"]
SEARCH_KEYWORDS = sorted(set(LINKEDIN_KEYWORDS + INDEED_TERMS + CAREERJET_TERMS))
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
ALL_SOURCES = ("linkedin", "indeed", "glassdoor", "careerjet", "jobsireland", "websites", "jooble",
               "apollo_discovery")
DEFAULT_SOURCES = ("linkedin", "indeed", "glassdoor", "careerjet", "jobsireland", "websites", "jooble")
SOURCE_LABELS = {
    "linkedin": "LinkedIn", "indeed": "Indeed", "glassdoor": "Glassdoor", "careerjet": "CareerJet",
    "jobsireland": "JobsIreland", "websites": "Company websites", "jooble": "Jooble",
    "apollo_discovery": "Apollo discovery",
}
BIG_HINT_ROLES = 4                  # a company with this many open Data/AI roles is checked for "too big" first

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


_US_STATE_TAIL = re.compile(
    r",\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY"
    r"|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b(?:\s+\d{5})?")
_FOREIGN_HQ = re.compile(
    r"\b(?:united\s+states|usa|u\.s\.a?|united\s+kingdom|uk|england|scotland|wales|london|manchester|"
    r"germany|deutschland|france|paris|spain|madrid|netherlands|amsterdam|belgium|brussels|poland|india|"
    r"bangalore|bengaluru|canada|toronto|australia|sydney|sweden|stockholm|denmark|copenhagen|norway|finland|"
    r"switzerland|zurich|italy|milan|israel|tel\s+aviv|singapore|japan|tokyo|china|brazil|portugal|lisbon|"
    r"austria|vienna|czech|prague|romania|united\s+arab\s+emirates|uae|dubai|luxembourg|estonia|lithuania)\b",
    re.I)


def hq_in_ireland(address: Any) -> Optional[bool]:
    """Headquarters address from Indeed / Glassdoor: True (Republic of Ireland), False (clearly elsewhere,
    incl. Northern Ireland), None (can't tell)."""
    a = _ascii(address).strip()
    if not a:
        return None
    where = ireland_location(a)
    if where == "IE":
        return True
    if where == "NI" or _US_STATE_TAIL.search(a) or _FOREIGN_HQ.search(a):
        return False
    return None


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
    s = _ascii(name).lower().replace("&", " and ")
    s = re.sub(r"\(.*?\)", " ", s)
    tokens = re.findall(r"[a-z0-9]+", s)
    while tokens and tokens[-1] in _LEGAL_TOKENS:
        tokens.pop()
    while tokens and tokens[0] == "the":
        tokens.pop(0)
    return " ".join(tokens)


_KEEP_UPPER = {"AI", "ML", "BI", "IT", "UK", "IE", "EU", "US", "HR", "AWS", "SAP", "CRM", "ERP", "DAC", "PLC",
               "CLG", "LTD", "UC", "IOT", "API", "SAS", "IBM", "KPMG", "PWC", "EY", "AIB", "ESB"}


def display_company_name(name: Any) -> str:
    """'BRIGHTWAVE ANALYTICS LIMITED' -> 'Brightwave Analytics Limited' (boards like JobsIreland shout)."""
    n = clean_text(name, 160)
    letters = [ch for ch in n if ch.isalpha()]
    if len(letters) < 6 or not all(ch.isupper() for ch in letters):
        return n
    return " ".join(w if w.upper() in _KEEP_UPPER else w.capitalize() for w in n.split())


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


_AGENCY_NAME = re.compile(
    r"\b(?:recruit\w*|staffing|resourcing|headhunt\w*|personnel|talent\s+(?:solutions|partners|group)"
    r"|executive\s+search|search\s+(?:partners|group)|hr\s+solutions)\b", re.I)
_AGENCY_KNOWN = {
    "cpl", "hays", "morgan mckinley", "harvey nash", "sigmar", "reperio human capital", "stelfox",
    "collins mcnicholas", "brightwater", "osborne", "computer futures", "jefferson frank", "nigel frank",
    "frank recruitment", "abrivia", "hunter savage", "lincoln", "excel", "hamilton barnes", "code red",
    "jobbio", "robert walters", "michael page", "page personnel", "randstad", "adecco", "manpower",
    "hirect", "solas it", "lex consultancy", "berkley", "eden",
}


def is_agency(name: Any, industry: Any = "") -> bool:
    ind = _ascii(industry).lower()
    if "staffing" in ind or "recruit" in ind:
        return True
    return bool(_AGENCY_NAME.search(_ascii(name))) or company_key(name) in _AGENCY_KNOWN


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
    ("smartrecruiters", re.compile(r"(?:careers|jobs)\.smartrecruiters\.com/([A-Za-z0-9_-]+)", re.I)),
    ("breezy",     re.compile(r"([A-Za-z0-9-]+)\.breezy\.hr", re.I)),
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


def parse_smartrecruiters(data: Any, slug: str) -> List[Dict[str, Any]]:
    """GET api.smartrecruiters.com/v1/companies/{slug}/postings (public, no key)."""
    out = []
    for j in ((data or {}).get("content") or []) if isinstance(data, dict) else []:
        if not isinstance(j, dict):
            continue
        loc = j.get("location") or {}
        parts = [loc.get("fullLocation") or ", ".join(str(x) for x in (loc.get("city"), loc.get("region")) if x)]
        country = str(loc.get("country") or "")
        if country:
            parts.append("Ireland" if country.lower() == "ie" else country)
        if loc.get("remote"):
            parts.append("Remote")
        out.append({
            "title": clean_text(j.get("name"), 200),
            "url": f"https://jobs.smartrecruiters.com/{slug}/{j.get('id')}",
            "location": clean_text(", ".join(p for p in parts if p), 250),
            "employment_raw": (j.get("typeOfEmployment") or {}).get("label") if isinstance(j.get("typeOfEmployment"), dict) else None,
            "posted_at": to_date_str(j.get("releasedDate")),
        })
    return out


def parse_breezy(data: Any, slug: str) -> List[Dict[str, Any]]:
    """GET {slug}.breezy.hr/json (public)."""
    out = []
    for j in data if isinstance(data, list) else []:
        if not isinstance(j, dict):
            continue
        loc = j.get("location") or {}
        country = ((loc.get("country") or {}).get("name") if isinstance(loc.get("country"), dict) else loc.get("country")) or ""
        out.append({
            "title": clean_text(j.get("name"), 200),
            "url": j.get("url") or f"https://{slug}.breezy.hr/",
            "location": clean_text(", ".join(str(x) for x in (loc.get("name"), country) if x), 250),
            "employment_raw": (j.get("type") or {}).get("name") if isinstance(j.get("type"), dict) else j.get("type"),
            "posted_at": to_date_str(j.get("published_date")),
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
    return ip.is_global and not ip.is_multicast        # is_global also rejects 100.64/10 (CGNAT)


async def _resolves_public(url: str) -> bool:
    """SSRF guard: every address the host resolves to must be public."""
    if not _safe_public_host(url):
        return False
    host = urlparse(url).hostname or ""
    try:
        # resolved in the scan's own thread pool, not the default one Supabase calls share
        infos = await hs.in_pool(socket.getaddrinfo, host, None)
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
    discovered_by: set = field(default_factory=set)
    jobs: Dict[str, Dict[str, Any]] = field(default_factory=dict)   # title_key -> merged job
    reject_reason: str = ""
    merged_into: Optional["Company"] = None   # set when the registry folds this record into another
    domain_source: str = ""                   # Indeed | guessed | Google | Apollo | cache
    size_lo: Optional[int] = None             # job-board headcount band, e.g. Indeed "11 to 50"
    size_hi: Optional[int] = None
    size_label: str = ""
    size_source: str = ""
    size_status: str = ""                     # verified | unverified | too_big
    size_verified_at: Optional[str] = None    # when an earlier scan verified it (cache entries must expire)
    apollo_people: List[Dict[str, Any]] = field(default_factory=list)
    site_people: List[Dict[str, Any]] = field(default_factory=list)
    xray_people: List[Dict[str, Any]] = field(default_factory=list)
    hq_text: str = ""                         # headquarters as a job board states it ("Dublin, Ireland")
    hq_ie: Optional[bool] = None              # True / False when a board's HQ address settles it
    agency_reason: str = ""                   # evidence from ad text that the poster is an agency
    wikidata_employees: Optional[int] = None
    apply_domain: str = ""                    # employer site seen in an "apply on company site" link
    # True when the website is known to be THIS employer (job board said so, apply link, LinkedIn slug,
    # Irish homepage). A looked-up website that is only a name match may belong to a foreign namesake,
    # so it can VERIFY (its staff carry this exact name) but never alone REJECT a company.
    domain_trusted: bool = False
    ats_refs: List[Tuple[str, str]] = field(default_factory=list)   # (ats, slug) seen in apply links
    # roles removed because their KNOWN type isn't wanted (title_key -> type): a careers page that lists
    # the same role without a type must not bring it back as 'Unspecified'
    typed_out: Dict[str, str] = field(default_factory=dict)

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
            if p in self._by:
                return self._by[p]
        return None

    def get_or_create(self, name: str, domain: str = "", linkedin: str = "", apollo_id: str = "") -> Optional[Company]:
        key = company_key(name)
        if not key:
            return None
        c = self.find(name, domain, linkedin, apollo_id)
        if c is None:
            c = Company(name=display_company_name(name), key=key)
            self.items.append(c)
        if domain and not c.domain:
            c.domain = clean_domain(domain)
            c.domain_trusted = True
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
        for attr in ("domain", "website", "linkedin", "apollo_id", "industry", "country", "city", "phone",
                     "domain_source", "size_label", "size_source", "size_status", "hq_text", "agency_reason",
                     "apply_domain", "reject_reason"):
            if not getattr(into, attr) and getattr(other, attr):
                setattr(into, attr, getattr(other, attr))
        # a positive "too big" proof on either record wins over "unverified"
        if other.domain_trusted and other.domain == into.domain:
            into.domain_trusted = True
        if other.size_status == "too_big" and into.size_status != "too_big":
            into.size_status, into.reject_reason = "too_big", other.reject_reason or into.reject_reason
        for attr in ("size", "size_lo", "size_hi", "hq_ie", "wikidata_employees"):
            if getattr(into, attr) is None:
                setattr(into, attr, getattr(other, attr))
        into.apollo_people += other.apollo_people
        into.site_people += other.site_people
        into.xray_people += other.xray_people
        for ref in other.ats_refs:
            if ref not in into.ats_refs:
                into.ats_refs.append(ref)
        for tk, t in other.typed_out.items():
            into.typed_out.setdefault(tk, t)
        into.resolved = into.resolved or other.resolved
        other.merged_into = into
        if other in self.items:
            self.items.remove(other)
        for k, v in list(self._by.items()):
            if v is other:
                self._by[k] = into

    def apply_apollo_org(self, c: Company, org: Dict[str, Any]) -> Company:
        """Attach Apollo firmographics; Apollo's name becomes canonical (stable across runs)."""
        c = self.canon(c)
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
        c.resolved = True
        c.domain_trusted = c.domain_trusted or bool(c.domain)
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
    max_headcount: int = Field(99, ge=1, le=99)          # "< 100"
    max_companies: int = Field(60, ge=5, le=150)          # companies taken to the website / contact stages
    contacts_per_company: int = Field(3, ge=1, le=5)
    apollo_company_lookups: int = Field(0, ge=0, le=100)  # optional paid lookups (1 credit each); 0 = free only
    sources: List[str] = Field(default_factory=lambda: list(DEFAULT_SOURCES))
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
        wanted = {str(x).lower() for x in v}
        if "apollo" in wanted:                    # settings saved by the previous version of the page
            wanted.discard("apollo")
        out = [s for s in ALL_SOURCES if s in wanted]
        if not [s for s in out if s != "websites"]:
            raise ValueError("Pick at least one job board.")
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


_PROXY_CREDS = re.compile(r"(//)[^/@\s:]+:[^/@\s]+@")


def redact(msg: Any) -> str:
    """Keys (Apollo, CloudTalk, Jooble, CareerJet, Serper) and proxy passwords never reach logs or the UI."""
    s = _integ._redact(msg)
    for var in ("SERPER_API_KEY", "CAREERJET_API_KEY", "JOOBLE_API_KEY"):
        val = os.environ.get(var)
        if val and len(val) > 5:
            s = s.replace(val, f"<{var}>")
    return _PROXY_CREDS.sub(r"\1***@", s)


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
                         "hq_unknown": 0, "no_qualifying_jobs": 0, "over_company_cap": 0, "older_than_window": 0},
            "apollo": {"search_calls": 0, "lookup_calls": 0, "lookups_cached": 0,
                       "people_search_calls": 0, "credits_consumed": 0.0, "contacts_reused": 0},
            "domains": {"board": 0, "apply_link": 0, "clearbit": 0, "wikidata": 0, "guessed": 0, "google": 0,
                        "cache": 0, "none": 0},
            "warnings": [],
            "rejected": [],          # [{company, reason, stage}] — every company dropped after discovery
        }
        self.li_client: Optional["hs.LinkedInClient"] = None
        self.li_pending: List[Tuple["Company", str, str]] = []   # (company, title_key, LinkedIn job id)
        self.lookups_off: set = set()          # free lookup services that refused us this scan
        self.web: Optional[httpx.AsyncClient] = None
        self.apollo: Optional[httpx.AsyncClient] = None
        self.apollo_sem = asyncio.Semaphore(2)
        self.web_sem = asyncio.Semaphore(8)
        self.company_cache_in: Dict[str, Dict[str, Any]] = {}    # from previous runs
        self.company_cache_out: Dict[str, Dict[str, Any]] = {}   # saved with this run
        self.apollo_disabled = "" if apollo_key() else "APOLLO_API_KEY not set"
        self.user_ip = ""             # CareerJet requires the IP / user agent of the person who started the scan
        self.user_agent = ""
        self._dirty = True
        self._write_lock = asyncio.Lock()
        self.finished = False      # once set, the ticker may no longer write (final status wins)

    # ── logging ──
    def log(self, msg: str, level: str = "info") -> None:
        msg = redact(msg)
        self.events.append({"t": _iso(), "level": level, "msg": msg[:300]})
        self.events = self.events[-EVENTS_KEPT:]
        self._dirty = True
        (log.warning if level in ("warn", "error") else log.info)(f"[hiring-intel {self.run_id[:8]}] {msg}")

    def warn(self, msg: str) -> None:
        msg = redact(msg)
        if msg not in self.stats["warnings"]:
            self.stats["warnings"].append(msg[:240])
        self.log(msg, "warn")

    def reject(self, c: "Company", reason: str, stage: str) -> None:
        rows = self.stats["rejected"]
        if len(rows) < 300 and not any(r["company"] == c.name and r["stage"] == stage for r in rows):
            rows.append({"company": c.name, "reason": clean_text(reason, 120), "stage": stage})
        self._dirty = True

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

    def serper_budget(self) -> int:
        """Google searches allowed this scan (domains + X-ray share it)."""
        return max(0, self.p.max_companies - int(self.stats.get("serper_queries", 0)))

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
            await asyncio.sleep(0.6)           # ~3 calls/s: well under Apollo's per-minute limits
            left = str((res.get("rate") or {}).get("x-minute-requests-left") or "")
            if left.isdigit() and int(left) <= 3:
                await asyncio.sleep(20)        # Apollo says this minute's budget is nearly spent
        if res.get("ok"):
            return res.get("data") or {}
        err = str(res.get("error") or "unknown error")
        if "auth failed" in err:
            self.apollo_disabled = err
            if kind == "people_search_calls":
                self.warn("Apollo refused the people search (HTTP 401/403). Apollo's API search needs an API key "
                          "with access to mixed_people/api_search (a master key in Apollo → Settings → API). "
                          "Headcount checks and Reveal are off for this scan; job results are unaffected.")
            else:
                self.warn(f"Apollo stopped: {err}")
        elif "429" in err:
            self.warn("Apollo rate limit reached — some lookups were skipped. Try again later.")
        else:
            self.log(f"Apollo {path.split('?')[0]}: {err}", "warn")
        return None


# ════════════════════════════════════════════════════════════════════════
# Sources — every adapter is isolated: a failure becomes a status, never a crash
# ════════════════════════════════════════════════════════════════════════
def _record_source(ctx: RunContext, res: "hs.SourceResult") -> None:
    res.note = redact(res.note)[:200] if res.note else ""
    ctx.source_stat(res.name, status=res.status, requests=res.requests, note=res.note)
    found = ctx.stats["sources"].get(res.name, {}).get("jobs", 0)
    if res.status == "partial":
        ctx.log(f"{res.name}: slowed us down part-way — kept {found} roles, other sources unaffected ({res.note})", "warn")
    elif res.status == "blocked":
        ctx.warn(f"{res.name} refused requests from the server this time ({res.note or 'blocked'}). "
                 f"The other sources still ran.")
    elif res.status == "error":
        ctx.warn(f"{res.name} failed: {res.note or 'unknown error'}")
    elif res.status == "not_configured":
        ctx.log(f"{res.name}: not set up ({res.note})")
    else:
        ctx.log(f"{res.name}: {found} Data/AI roles in Ireland")


async def source_linkedin(ctx: RunContext, reg: CompanyRegistry) -> None:
    """Search pages only. The job pages (true employment type, industry, ad text) are read later by
    linkedin_job_pages(), and only for companies that survived qualification — in the first live
    scans most of the ~70 pages read were for agencies and multinationals that were dropped anyway."""
    ctx.source_stat("LinkedIn", status="running")
    client = hs.LinkedInClient(proxies=hs.proxies_from_env(), time_budget=LINKEDIN_TIME_BUDGET,
                               cancelled=lambda: ctx.cancelled or ctx.deleted)
    ctx.li_client = client                   # closed by execute_run()
    keywords = LINKEDIN_KEYWORDS + ctx.p.extra_keywords
    if "Contract" in ctx.p.employment_types:
        contract_kw = LINKEDIN_CONTRACT_KEYWORDS
        # contract-only: contract searches go FIRST, so a LinkedIn slow-down costs the generic ones instead
        keywords = contract_kw + keywords if ctx.p.employment_types == ["Contract"] else keywords + contract_kw
    res = await hs.linkedin_search(client, keywords, ctx.p.days_back,
                                   parse_cards=parse_linkedin_cards,
                                   on_progress=lambda f: ctx.bump(5 + 30 * f))
    ctx.check_cancel()
    for card in res.rows:
        hit = _ingest(ctx, reg, source="LinkedIn", title=card["title"], company=card["company"],
                      company_linkedin=card["company_url"], location=card["location"], url=card["url"],
                      posted_at=card["posted_at"], defer_type=True)
        if hit and card.get("id"):
            ctx.li_pending.append((hit[0], hit[1], card["id"]))
    res.requests = client.requests
    _record_source(ctx, res)


async def linkedin_job_pages(ctx: RunContext, companies: List[Company]) -> None:
    """Read LinkedIn's guest job page for roles at the qualified companies: real employment type
    (also from the ad text — 'Full-time' is often a 12-month contract), industry, agency wording."""
    client, pending = ctx.li_client, ctx.li_pending
    if client is None or not pending:
        return
    keep = {id(CompanyRegistry.canon(c)) for c in companies}
    items: List[Tuple[Company, str, str]] = []
    seen_ids: set = set()
    for comp, tk, jid in pending:
        comp = CompanyRegistry.canon(comp)
        if id(comp) in keep and jid not in seen_ids and tk in comp.jobs:
            seen_ids.add(jid)
            items.append((comp, tk, jid))
    # verified companies first, then the smaller hirers (fewest roles) — the likeliest prospects
    items.sort(key=lambda x: (x[0].size_status != "verified", len(x[0].jobs)))
    ids = [jid for _, _, jid in items[:LINKEDIN_DETAIL_CAP]]
    details: Dict[str, Dict[str, Any]] = {}
    if ids and client.renew_budget(LINKEDIN_DETAIL_BUDGET):
        details = await hs.linkedin_details(client, ids)
    elif ids:
        ctx.log("LinkedIn job pages skipped — LinkedIn refused requests earlier in this scan", "warn")
    ctx.check_cancel()
    retyped = 0
    for comp, tk, jid in items:
        job = comp.jobs.get(tk)
        if job is None:
            continue
        d = details.get(jid) or {}
        crit = d.get("employment_type") or ""
        etype = normalize_employment_type(crit, job["title"]) if crit else job["employment_type"]
        from_text = d.get("type_from_text") if "type_from_text" in d else (
            hs.employment_from_text(d.get("description")) if d.get("description") else None)
        if from_text and (etype == "Unspecified" or (etype == "Permanent" and "permanent" not in crit.lower())):
            retyped += int(from_text != etype)
            etype = from_text
        # only LinkedIn-only roles (typed from the title) are re-typed; another board's stated type stands
        if etype != "Unspecified" and (job["employment_type"] == "Unspecified" or job["sources"] == ["LinkedIn"]):
            job["employment_type"] = etype
        if d.get("industries") and not comp.industry:
            comp.industry = d["industries"]
        agency_text = d["agency_text"] if "agency_text" in d else bool(d.get("description") and hs.agency_from_text(d["description"]))
        if agency_text and not comp.agency_reason:
            comp.agency_reason = "recruits on behalf of a client (LinkedIn ad text)"
    # employment-type filter for every LinkedIn-only role at these companies (read or not)
    for comp, tk, _jid in items:
        job = comp.jobs.get(tk)
        if job is not None and job["sources"] == ["LinkedIn"] and not _type_allowed(ctx, job["employment_type"]):
            comp.typed_out[tk] = job["employment_type"]
            del comp.jobs[tk]
            ctx.stats["filtered"]["employment_type"] += 1
            ctx.source_stat("LinkedIn", jobs=-1)
    ctx.stats["sources"].setdefault("LinkedIn", {})["requests"] = client.requests
    if details:
        ctx.log(f"LinkedIn: read {len(details)} job pages for the qualified companies"
                + (f" ({retyped} re-typed from the ad text)" if retyped else ""))


def _ingest_board_row(ctx: RunContext, reg: CompanyRegistry, source: str, r: Dict[str, Any]) -> None:
    _ingest(ctx, reg, source=source, title=r["title"], company=r["company"], location=r["location"],
            url=r["url"], employment_raw=r["employment_raw"], posted_at=r["posted_at"], assume_ie=True,
            company_website=r.get("company_website", ""), headcount_label=r.get("headcount_label", ""),
            industry=r.get("industry", ""), description=r.get("description", ""),
            company_address=r.get("company_address", ""), url_direct=r.get("url_direct", ""),
            type_from_text=r.get("type_from_text"), agency_text=r.get("agency_text"))


async def source_indeed(ctx: RunContext, reg: CompanyRegistry) -> None:
    ctx.source_stat("Indeed", status="running")
    terms = INDEED_TERMS + ctx.p.extra_keywords
    deadline = time.monotonic() + SOURCE_TIME_BUDGET - 45       # stop between terms before the fence fires
    res = await hs.in_pool(lambda: hs.indeed_search_sync(terms, ctx.p.days_back, 50, hs.proxies_from_env(),
                                                         deadline=deadline,
                                                         cancelled=lambda: ctx.cancelled or ctx.deleted))
    ctx.check_cancel()
    for r in res.rows:
        _ingest_board_row(ctx, reg, "Indeed", r)
    ctx.bump(30)
    _record_source(ctx, res)


async def source_glassdoor(ctx: RunContext, reg: CompanyRegistry) -> None:
    """Glassdoor Ireland via JobSpy: website, headcount band and HQ come with every row."""
    ctx.source_stat("Glassdoor", status="running")
    terms = GLASSDOOR_TERMS + ctx.p.extra_keywords
    deadline = time.monotonic() + SOURCE_TIME_BUDGET - 45
    res = await hs.in_pool(lambda: hs.glassdoor_search_sync(terms, ctx.p.days_back, 30, hs.proxies_from_env(),
                                                            deadline=deadline,
                                                            cancelled=lambda: ctx.cancelled or ctx.deleted))
    ctx.check_cancel()
    for r in res.rows:
        _ingest_board_row(ctx, reg, "Glassdoor", r)
    _record_source(ctx, res)


async def source_careerjet(ctx: RunContext, reg: CompanyRegistry) -> None:
    ctx.source_stat("CareerJet", status="running")
    cts = (["p"] if "Permanent" in ctx.p.employment_types else []) + (["c"] if "Contract" in ctx.p.employment_types else [])
    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=8.0)) as client:
        res = await hs.careerjet_search(client, CAREERJET_TERMS + ctx.p.extra_keywords,
                                        user_ip=ctx.user_ip, user_agent=ctx.user_agent, contract_types=cts,
                                        cancelled=lambda: ctx.cancelled or ctx.deleted)
    ctx.check_cancel()
    for r in res.rows:
        _ingest(ctx, reg, source="CareerJet", title=r["title"], company=r["company"], location=r["location"],
                url=r["url"], posted_at=r["posted_at"], type_hint=r.get("type_hint"), assume_ie=True)
    _record_source(ctx, res)


async def source_jobsireland(ctx: RunContext, reg: CompanyRegistry) -> None:
    ctx.source_stat("JobsIreland", status="running")

    async def fetch_text(url: str, params: Dict[str, Any]) -> Tuple[int, str]:
        r = await ctx.web_get(url, params=params, headers={"User-Agent": BROWSER_UA, "Accept": "text/html,*/*"})
        return (r.status_code, r.text) if r is not None else (0, "")

    res = await hs.jobsireland_search(fetch_text, JOBSIRELAND_TERMS)
    ctx.check_cancel()
    for r in res.rows:
        _ingest(ctx, reg, source="JobsIreland", title=r["title"], company=r["company"], location=r["location"],
                url=r["url"], posted_at=r["posted_at"], assume_ie=True)
    _record_source(ctx, res)


async def source_jooble(ctx: RunContext, reg: CompanyRegistry) -> None:
    name = "Jooble"
    key = jooble_key()
    if not key:
        ctx.source_stat(name, status="not_configured", note="set JOOBLE_API_KEY")
        return
    ctx.source_stat(name, status="running")
    since = (date.today() - timedelta(days=ctx.p.days_back)).isoformat()
    for kw in CAREERJET_TERMS + ctx.p.extra_keywords:
        for page in (1, 2):
            ctx.check_cancel()
            try:
                async with ctx.web_sem:
                    r = await ctx.web.post(f"{JOOBLE_URL}{key}",   # type: ignore[union-attr]
                                           json={"keywords": kw, "location": "Ireland", "page": page})
            except httpx.HTTPError as e:
                _record_source(ctx, hs.SourceResult(name, "error", note=type(e).__name__))
                return
            ctx.source_stat(name, requests=1)
            if r.status_code in (401, 403):
                _record_source(ctx, hs.SourceResult(name, "error", note="Jooble rejected the API key"))
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
                        location=j.get("location"), url=j.get("link"), employment_raw=j.get("type"), posted_at=posted)
            if len(jobs) < 20:
                break
    _record_source(ctx, hs.SourceResult(name, "ok"))


async def source_apollo_companies(ctx: RunContext, reg: CompanyRegistry) -> None:
    """OPTIONAL (off by default): Apollo company search costs 1 credit per page."""
    name = "Apollo discovery"
    if ctx.apollo_disabled:
        ctx.source_stat(name, status="not_configured", note="APOLLO_API_KEY not set")
        return
    ctx.source_stat(name, status="running")
    since = (date.today() - timedelta(days=ctx.p.days_back)).isoformat()
    found = 0
    for page in (1, 2):
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
                reg.apply_apollo_org(c, org)
                c.discovered_by.add(name)
                found += 1
        pg = data.get("pagination") or {}
        if page >= int(pg.get("total_pages") or 1) or len(orgs) < 100:
            break
    ctx.source_stat(name, status="ok", companies=found)
    ctx.log(f"Apollo discovery: {found} small companies with open Data/AI roles in Ireland")


# ════════════════════════════════════════════════════════════════════════
# Ingest + filters shared by all sources
# ════════════════════════════════════════════════════════════════════════
def _type_allowed(ctx: RunContext, etype: str) -> bool:
    if etype in ctx.p.employment_types:
        return True
    return etype == "Unspecified" and ctx.p.include_unspecified_type


def _ingest(ctx: RunContext, reg: CompanyRegistry, *, source: str, title: Any, company: Any, location: Any,
            url: Any, employment_raw: Any = None, type_hint: Optional[str] = None, posted_at: Any = None,
            company_linkedin: str = "", target: Optional[Company] = None, location_known_ie: bool = False,
            assume_ie: bool = False, defer_type: bool = False, company_website: str = "",
            headcount_label: str = "", industry: str = "", description: str = "",
            company_address: str = "", url_direct: str = "", type_from_text: Optional[str] = None,
            agency_text: Optional[bool] = None) -> Optional[Tuple[Company, str]]:
    """Classify one raw posting and attach it to its company.
    Returns (company, title_key) when it qualified, else None.
    assume_ie: the source only returns Irish jobs (an empty / remote location still counts),
    but an explicit Northern Ireland or US location is still rejected.
    defer_type: the type is settled later (LinkedIn job page) — only an explicit title type filters now."""
    title = clean_text(title, 200)
    category = classify_title(title)
    if not category:
        ctx.stats["filtered"]["not_data_ai"] += 1
        return None
    where = "IE" if location_known_ie else ireland_location(location)
    if assume_ie and where == "" and not _NON_IE_EXPLICIT.search(_ascii(location)):
        where = "IE"
    if where == "NI":
        ctx.stats["filtered"]["northern_ireland"] += 1
        return None
    if where != "IE":
        ctx.stats["filtered"]["not_ireland"] += 1
        return None
    posted = to_date_str(posted_at)
    # LinkedIn already applied the window server-side (f_TPR) and shows the ORIGINAL date of reposts.
    if posted and source != "LinkedIn" and posted < (date.today() - timedelta(days=ctx.p.days_back)).isoformat():
        ctx.stats["filtered"]["older_than_window"] += 1
        return None
    etype = normalize_employment_type(employment_raw, title)
    # board adapters compute these in their worker thread; computed here only for direct callers
    from_text = type_from_text if type_from_text is not None else (
        hs.employment_from_text(description) if description else None)
    if from_text and (etype == "Unspecified"
                      or (etype == "Permanent" and from_text == "Contract"
                          and "permanent" not in _ascii(employment_raw).lower())):
        etype = from_text                              # "fulltime" on Indeed is a schedule, not a contract type
    if etype == "Unspecified" and type_hint:
        etype = type_hint
    if (not defer_type or etype != "Unspecified") and not _type_allowed(ctx, etype):
        ctx.stats["filtered"]["employment_type"] += 1
        return None
    site_domain = clean_domain(company_website) if company_website else ""
    if site_domain and hs.host_matches(site_domain, hs._SKIP_DOMAINS):
        site_domain, company_website = "", ""          # a Facebook / LinkedIn page is not the company's site
    c = target or reg.get_or_create(clean_text(company, 160), linkedin=company_linkedin, domain=site_domain)
    if c is None:
        return None
    c = CompanyRegistry.canon(c)
    c.discovered_by.add(source)
    if company_website and not c.website:
        c.website, c.domain_source = company_website, c.domain_source or source
    if industry and not c.industry:
        c.industry = clean_text(industry, 120)
    band = hs.parse_headcount_label(headcount_label) if headcount_label else None
    if band and not c.size_label:
        c.size_lo, c.size_hi = band
        label = re.sub(r"(?i)\s*employees?\s*$", "", clean_text(headcount_label, 40))
        c.size_label, c.size_source = f"{label} staff", source
    if company_address and not c.hq_text:
        c.hq_text = clean_text(company_address, 160)
        c.hq_ie = hq_in_ireland(company_address)
    is_agency_text = agency_text if agency_text is not None else bool(description and hs.agency_from_text(description))
    if is_agency_text and not c.agency_reason:
        c.agency_reason = f"recruits on behalf of a client ({source} ad text)"
    if url_direct:
        for ref in find_ats_refs(url_direct):
            if ref not in c.ats_refs:
                c.ats_refs.append(ref)
        if not c.apply_domain:
            dom = hs.employer_domain_from_apply_url(url_direct)
            stem = re.sub(r"[^a-z0-9]", "", dom.split(".")[0]) if dom else ""
            toks = [t for t in c.key.split() if len(t) >= 3]
            # only when the site plausibly IS this employer (Optum's ads apply on unitedhealthgroup.com)
            if stem and toks and (toks[0] in stem or stem in c.key.replace(" ", "")):
                c.apply_domain = dom
    tk_new = title_key(title) or title.lower()
    if etype == "Unspecified" and tk_new in c.typed_out:
        ctx.stats["filtered"]["employment_type"] += 1      # this role's type is already known — and not wanted
        return None
    if c.add_job(Job(title=title, url=str(url or ""), location=clean_text(location, 200) or "Ireland",
                     source=source, employment_type=etype, category=category, posted_at=posted)):
        ctx.source_stat(source if not source.startswith("Company") else "Company websites", jobs=1)
    return c, (title_key(title) or title.lower())


_NON_IE_EXPLICIT = re.compile(
    r"\b(?:united\s+states|usa|united\s+kingdom|england|scotland|wales|london|germany|france|spain|netherlands|"
    r"poland|india|canada|australia)\b", re.I)


# ════════════════════════════════════════════════════════════════════════
# Qualify — headcount, HQ and agency checks WITHOUT spending Apollo credits
# ════════════════════════════════════════════════════════════════════════
def _best_org_match(c: Company, orgs: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    slug = linkedin_company_slug(c.linkedin)
    best, best_score = None, 0
    for o in orgs:
        if not isinstance(o, dict):
            continue
        score = 0
        if slug and linkedin_company_slug(o.get("linkedin_url")) == slug:
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
                "estimated_num_employees", "country", "city", "industry", "sanitized_phone",
                "size_status", "size_label", "size_source", "domain", "max_hc", "hq",
                "nodomain", "min_size", "hq_out", "reason", "trusted")
CACHE_MAX_AGE_DAYS = 21
NODOMAIN_MAX_AGE_DAYS = 7
CACHE_MAX_ENTRIES = 2000              # stored as JSON on the run row — kept small on purpose


def _age_days(entry: Dict[str, Any]) -> float:
    try:
        t = datetime.fromisoformat(str(entry.get("t")).replace("Z", "+00:00"))
    except Exception:
        return 10 ** 6
    return (_now() - t).total_seconds() / 86400


def _cache_put(ctx: RunContext, keys: List[str], org: Optional[Dict[str, Any]],
               learned_at: Optional[str] = None) -> None:
    """learned_at: keep the original lookup time when re-saving a cache hit, so entries really expire."""
    entry = ({k: org.get(k) for k in CACHE_FIELDS if org.get(k) not in (None, "")} if org else {"unmatched": True})
    entry["t"] = learned_at or _iso()
    for k in keys:
        if k and len(ctx.company_cache_out) < CACHE_MAX_ENTRIES:
            ctx.company_cache_out[k] = entry


def _cache_get(ctx: RunContext, keys: List[str]) -> Optional[Dict[str, Any]]:
    for k in keys:
        e = ctx.company_cache_in.get(k)
        if not e:
            continue
        try:
            age = _now() - datetime.fromisoformat(str(e.get("t")).replace("Z", "+00:00"))
        except Exception:
            continue
        if age.days <= CACHE_MAX_AGE_DAYS:
            return e
    return None


async def load_company_cache(ctx: RunContext) -> None:
    try:
        res = await _run(lambda: _sb("hiring_intel_runs").select("company_cache").eq("status", "completed")
                         .neq("id", ctx.run_id).order("created_at", desc=True).limit(MAX_RUNS_KEPT).execute())
    except Exception as e:
        log.warning(f"[hiring-intel] company cache load failed: {_integ._redact(e)}")
        return
    for row in reversed(res.data or []):          # oldest first so the newest run's knowledge wins
        cache = row.get("company_cache") or {}
        if isinstance(cache, dict):
            ctx.company_cache_in.update(cache)


def _lookup_keys(c: Company) -> List[str]:
    keys = [f"n:{c.key}"]
    slug = linkedin_company_slug(c.linkedin)
    if slug:
        keys.insert(0, f"l:{slug}")
    return keys


def _tokens(c: Company) -> List[str]:
    return [t for t in c.key.split() if t not in ("and", "the", "of")]


_SLUG_NOISE = re.compile(r"(?:-(?:ltd|limited|ireland|ie|inc|llc|plc|dac|group|hq|global|official|co|uc|clg|"
                         r"teo|europe|emea|careers|jobs))+$|-?\d+$")


def slug_stem(linkedin_url: Any) -> str:
    """linkedin.com/company/meilitravel -> 'meilitravel'; acme-analytics-ltd -> 'acmeanalytics'."""
    slug = linkedin_company_slug(linkedin_url)
    for _ in range(3):
        slug = _SLUG_NOISE.sub("", slug)
    return re.sub(r"[^a-z0-9]", "", slug)


def domain_guesses(c: "Company") -> List[str]:
    out = list(hs.domain_candidates(_tokens(c)))
    stem = slug_stem(c.linkedin)
    if len(stem) >= 4:
        for tld in ("ie", "com", "io", "ai"):
            cand = f"{stem}.{tld}"
            if cand not in out:
                out.insert(min(len(out), 2 + ("ie", "com", "io", "ai").index(tld)), cand)
    return out[:10]


def _domain_stem(dom: str) -> str:
    return re.sub(r"[^a-z0-9]", "", dom.split(".")[0])


async def discover_domains(ctx: RunContext, reg: CompanyRegistry, companies: List[Company]) -> None:
    """Find a website for companies no source gave one, most reliable first:
         cache → 'apply on company site' link → Clearbit exact name → Wikidata exact name →
         guessed domains (name + LinkedIn slug, page must name the company).
    Every looked-up website must pass confirm(): the LinkedIn slug equals the domain, or the homepage
    names the company (one-word names: and is Irish). Only a slug match or an Irish homepage makes the
    domain TRUSTED (see Company.domain_trusted). Bounded by the caller; finish_domains() runs after."""
    todo = [c for c in companies if not c.domain]
    if not todo:
        return
    sem = asyncio.Semaphore(6)
    lookups = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=6.0))

    async def one(c: Company) -> None:
        async with sem:
            ctx.check_cancel()
            hit = _cache_get(ctx, [f"dom:{c.key}"])
            if hit is not None and hit.get("nodomain") and _age_days(hit) > NODOMAIN_MAX_AGE_DAYS:
                hit = None                               # dead ends are retried after a week
            if hit is not None:
                if hit.get("domain"):
                    _set_domain(ctx, reg, c, hit["domain"], hit.get("size_source") or "earlier scan", "cache",
                                trusted=bool(hit.get("trusted")), learned_at=hit.get("t"))
                else:
                    _cache_put(ctx, [f"dom:{c.key}"], hit, learned_at=hit.get("t"))   # carry, never re-date
                return
            if c.apply_domain:
                # the employer's own apply link, and its domain already matched the name at ingest
                _set_domain(ctx, reg, c, c.apply_domain, "apply link", "apply_link", trusted=True)
                return
            if "clearbit" not in ctx.lookups_off:
                state, rows = await hs.clearbit_suggest(lookups, c.name)
                if state == "rate_limited" or state.startswith("error:HTTP 4"):
                    ctx.lookups_off.add("clearbit")
                dom = hs.pick_clearbit_domain(rows, company_key, c.key) if state == "ok" else ""
                if dom:
                    ok, trusted = await _confirm_domain(ctx, c, dom)
                    if ok:
                        _set_domain(ctx, reg, c, dom, "Clearbit", "clearbit", trusted=trusted)
                        return
            if "wikidata" not in ctx.lookups_off:
                state, wd = await hs.wikidata_lookup(lookups, c.name, company_key, c.key)
                if state == "rate_limited":
                    ctx.lookups_off.add("wikidata")
                if wd:
                    dom = wd.get("domain") or ""
                    ok, trusted = await _confirm_domain(ctx, c, dom) if dom else (False, False)
                    # a Wikidata headcount is proof only when it is clearly THIS employer
                    tied = ok and trusted or bool(wd.get("irish")) or len(c.jobs) >= BIG_HINT_ROLES
                    if (wd.get("employees") or 0) >= 1000 and tied:
                        CompanyRegistry.canon(c).wikidata_employees = wd["employees"]
                    if ok:
                        _set_domain(ctx, reg, c, dom, "Wikidata", "wikidata", trusted=trusted)
                        return
                    if CompanyRegistry.canon(c).wikidata_employees:
                        return                           # settled as too big without a website
            for cand in domain_guesses(c):
                ctx.check_cancel()
                r = await ctx.web_get(f"https://{cand}/", headers={"User-Agent": BROWSER_UA})
                if r is None or r.status_code >= 400:
                    continue
                final_host = clean_domain(r.url)
                if final_host and await hs.in_pool(hs.page_matches_company, r.text, _tokens(c), final_host):
                    irish = final_host.endswith(".ie") or bool(hs._IRISH_HINT.search(r.text[:300000]))
                    slug_ok = slug_stem(c.linkedin) == _domain_stem(final_host)
                    _set_domain(ctx, reg, c, final_host, "guessed", "guessed", trusted=irish or slug_ok)
                    return

    try:
        results = await asyncio.gather(*(one(c) for c in todo), return_exceptions=True)
    finally:
        await lookups.aclose()
    _raise_cancel_log_rest(ctx, results, "website lookup")


def _set_domain(ctx: RunContext, reg: CompanyRegistry, c: Company, dom: str, source: str, stat: str, *,
                trusted: bool, learned_at: Optional[str] = None) -> None:
    c = CompanyRegistry.canon(c)
    if c.domain:
        return
    c.domain, c.domain_source, c.domain_trusted = dom, source, trusted
    c.website = c.website or f"https://{dom}"
    reg.reindex(c)
    dstats = ctx.stats["domains"]
    dstats[stat] = dstats.get(stat, 0) + 1
    ctx.stats["domains_found"] = ctx.stats.get("domains_found", 0) + 1
    _cache_put(ctx, [f"dom:{c.key}"], {"domain": dom, "size_source": source, "trusted": trusted},
               learned_at=learned_at)


async def _confirm_domain(ctx: RunContext, c: Company, dom: str) -> Tuple[bool, bool]:
    """(belongs to this company?, trusted?). Slug == domain is both. Otherwise the homepage must name
    the company (page_matches_company also demands an Irish signal for one-word names); an Irish
    homepage (.ie / Ireland / Dublin / +353) makes it trusted."""
    stem = slug_stem(c.linkedin)
    if stem and stem == _domain_stem(dom):
        return True, True
    r = await ctx.web_get(f"https://{dom}/", headers={"User-Agent": BROWSER_UA})
    if r is None or r.status_code >= 400:
        return False, False
    final_host = clean_domain(r.url)
    if not final_host or not await hs.in_pool(hs.page_matches_company, r.text, _tokens(c), final_host):
        return False, False
    return True, final_host.endswith(".ie") or bool(hs._IRISH_HINT.search(r.text[:300000]))


async def finish_domains(ctx: RunContext, reg: CompanyRegistry, companies: List[Company]) -> None:
    """Runs even when discover_domains hit its time limit: Google fallback (own budget), the 'not found'
    count, and the one-week dead-end cache."""
    still = [CompanyRegistry.canon(c) for c in companies]
    still = [c for c in {id(c): c for c in still}.values() if not c.domain and c.wikidata_employees is None]
    if still and hs.serper_key():
        async def google() -> None:
            async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0)) as client:
                for c in still[: ctx.serper_budget()]:
                    ctx.check_cancel()
                    if c.domain:
                        continue
                    state, organic = await hs.serper_search(client, f'"{c.name}" Ireland', num=8)
                    ctx.stats["serper_queries"] = ctx.stats.get("serper_queries", 0) + 1
                    if state != "ok":
                        if state in ("auth", "rate_limited"):
                            ctx.warn(f"Google search (Serper) stopped: {state}")
                            return
                        continue
                    dom = hs.pick_company_domain(organic, _tokens(c))
                    if dom:
                        _set_domain(ctx, reg, c, dom, "Google", "google", trusted=dom.endswith(".ie"))
        await _bounded(ctx, google(), SERPER_BUDGET, "Google website search")
    for c in still:
        if c.domain:
            continue
        ctx.stats["domains"]["none"] = ctx.stats["domains"].get("none", 0) + 1
        old = _cache_get(ctx, [f"dom:{c.key}"])
        if not (old and old.get("nodomain") and _age_days(old) <= NODOMAIN_MAX_AGE_DAYS):
            _cache_put(ctx, [f"dom:{c.key}"], {"nodomain": True})     # fresh one-week dead end
    if ctx.stats.get("domains_found"):
        ctx.log(f"Found websites for {ctx.stats['domains_found']} companies that had none")


def _raise_cancel_log_rest(ctx: RunContext, results: List[Any], what: str) -> None:
    """gather(return_exceptions=True) helper: re-raise a cancel, LOG anything else instead of losing it."""
    failures = [r for r in results if isinstance(r, BaseException)]
    if any(isinstance(r, RunCancelled) for r in failures):
        raise RunCancelled()
    for r in failures[:3]:
        log.warning(f"[hiring-intel] {what} failed: {type(r).__name__}: {redact(r)}")
    if failures:
        ctx.log(f"{what}: {len(failures)} lookup(s) failed and were skipped", "warn")


def _total_entries(data: Optional[Dict[str, Any]]) -> Optional[int]:
    if not isinstance(data, dict):
        return None
    for v in (data.get("total_entries"), (data.get("pagination") or {}).get("total_entries")):
        try:
            if v is not None:
                return int(v)
        except (TypeError, ValueError):
            pass
    people = data.get("people") or data.get("contacts")
    return len(people) if isinstance(people, list) else None


_GENERIC_NAME_WORDS = {
    "ireland", "ie", "irl", "group", "holdings", "international", "global", "europe", "emea", "uk", "hq",
    "technologies", "technology", "tech", "software", "solutions", "labs", "lab", "ai", "analytics", "digital",
    "systems", "io", "services", "consulting", "consultancy", "company", "workforce", "platform", "cloud",
}


def org_name_matches(org_name: Any, c: Company) -> bool:
    """Is Apollo's organisation name this company? Exact key (spacing / legal suffixes ignored), or one
    name extending the other ('Softworks' / 'Softworks Workforce Solutions', 'JPMorgan Chase & Co.')."""
    a, b = _nospace_key(org_name), _nospace_key(c.key)
    if not a or not b:
        return False
    if a == b:
        return True
    ta = re.sub(r"(?:\s+and)+$", "", company_key(org_name)).split()
    tb = re.sub(r"(?:\s+and)+$", "", c.key).split()
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    if not short or long_[:len(short)] != short:
        return False                      # whole words only: 'Stripe' never extends to 'Stripes Digital'
    extra = long_[len(short):]
    return len(short) >= 2 or all(t in _GENERIC_NAME_WORDS for t in extra)


def _apollo_people(data: Optional[Dict[str, Any]], c: Company, *, exact: bool = False) -> List[Dict[str, Any]]:
    """Decision-makers from mixed_people/api_search (free) whose CURRENT organisation is this company.
    The domain filter also matches PREVIOUS employers, so without this check an ex-employee who now
    runs another company would show up as this company's CEO. The free search returns only the
    organisation's name (no domain/id), so identity is by name. Surnames stay hidden until Reveal."""
    return [p for p in _apollo_matched(data, c, exact=exact) if p.get("role")]


def _apollo_matched(data: Optional[Dict[str, Any]], c: Company, *, exact: bool = False) -> List[Dict[str, Any]]:
    """Everyone in the response who currently works at this company (any title)."""
    out: List[Dict[str, Any]] = []
    for p in (data or {}).get("people") or (data or {}).get("contacts") or []:
        if not isinstance(p, dict):
            continue
        org = p.get("organization") if isinstance(p.get("organization"), dict) else {}
        org_name = org.get("name") or p.get("organization_name") or ""
        org_dom = clean_domain(org.get("primary_domain") or org.get("website_url") or "")
        if org_dom and c.domain:
            if org_dom != c.domain:
                continue                       # works somewhere else now (alumni match)
        elif not org_name:
            continue                           # can't prove where they work: never trust it
        elif exact and raw_name_key(org_name) != raw_name_key(c.name):
            continue
        elif not org_name_matches(org_name, c):
            continue
        pid = str(p.get("id") or p.get("person_id") or "")
        if not pid:
            continue
        role, rank = classify_icp(p.get("title"))
        first = clean_text(p.get("first_name"), 60)
        last = clean_text(p.get("last_name") or p.get("last_name_obfuscated"), 60)
        out.append({"apollo_person_id": pid, "first_name": first, "last_name": last,
                    "name": clean_text(f"{first} {last}", 120) or clean_text(p.get("name"), 120),
                    "title": clean_text(p.get("title"), 160), "role": role, "rank": rank,
                    "linkedin_url": p.get("linkedin_url") or "", "source": "Apollo",
                    "needs_reveal": not p.get("last_name"), "org_name": clean_text(org_name, 160)})
    return out


_RAW_LEGAL = {"ltd", "limited", "dac", "plc", "inc", "llc", "gmbh", "uc", "clg", "teoranta", "teo", "ulc",
              "unlimited", "co", "corp", "corporation", "bv", "sa", "ag", "srl", "pty", "and"}


def raw_name_key(name: Any) -> str:
    """Like company_key but KEEPS 'Ireland', 'Group', 'International', 'Holdings', 'Europe': with no
    website to anchor a match, 'Nimbus Data' (US, 800 staff) must not equal 'Nimbus Data Ireland'."""
    s = _ascii(name).lower().replace("&", " and ")
    s = re.sub(r"\(.*?\)", " ", s)
    tokens = re.findall(r"[a-z0-9]+", s)
    while tokens and tokens[-1] in _RAW_LEGAL:
        tokens.pop()
    while tokens and tokens[0] == "the":
        tokens.pop(0)
    return "".join(tokens)


def _nospace_key(name: Any) -> str:
    """'JPMorgan Chase & Co.' and 'JPMorganChase' -> 'jpmorganchase' (a trailing '& Co' leaves 'and')."""
    return re.sub(r"(?:\s+and)+$", "", company_key(name)).replace(" ", "")


def _add_apollo_people(c: Company, people: List[Dict[str, Any]]) -> None:
    have = {p["apollo_person_id"] for p in c.apollo_people}
    for p in people:
        if p["apollo_person_id"] not in have:
            c.apollo_people.append(p)
            have.add(p["apollo_person_id"])


IRISH_STAFF = [("person_locations[]", "Ireland")]
ABOVE_RANGES = ["101,200", "201,500", "501,1000", "1001,2000", "2001,5000", "5001,10000", "10001,"]


def _apollo_ranges(max_hc: int) -> Tuple[List[Tuple[str, Any]], List[Tuple[str, Any]]]:
    ranges = [("organization_num_employees_ranges[]", r) for r in APOLLO_EMPLOYEE_RANGES
              if int(r.split(",")[0]) <= max_hc]
    above = [("organization_num_employees_ranges[]", r) for r in ABOVE_RANGES]
    return ranges, above


async def _people_search(ctx: RunContext, params: List[Tuple[str, Any]]) -> Optional[Dict[str, Any]]:
    return await ctx.apollo_call("POST", "/mixed_people/api_search", kind="people_search_calls", params=params)


async def apollo_size_and_people(ctx: RunContext, c: Company) -> None:
    """0-credit Apollo people search, used three ways at once:
         * finds the CEO / CTO / Founder / Data head (surnames hidden until Reveal),
         * proves the company is under the headcount limit (Apollo's own employee-range filter),
         * and, with the HQ filter, that it is headquartered in Ireland.
       Only people whose CURRENT organisation is this company count (see _apollo_people) — raw totals
       are never used, because the domain filter also matches alumni.
       A company is only REJECTED on positive proof (its own staff found ABOVE the limit, or in range
       but outside Ireland). A failed call, a rate limit, or missing Apollo data leaves it 'unverified'."""
    if ctx.apollo_disabled or not c.domain:
        return
    max_hc = ctx.p.max_headcount
    base = [("q_organization_domains_list[]", c.domain), ("page", 1), ("per_page", 25)]
    ranges, above = _apollo_ranges(max_hc)
    loc = [("organization_locations[]", "Ireland")] if ctx.p.hq_ireland_only else []
    titles = [("person_titles[]", t) for t in APOLLO_ICP_TITLES]

    async def staff(params: List[Tuple[str, Any]], execs_only: bool = False) -> Optional[List[Dict[str, Any]]]:
        data = await _people_search(ctx, base + params)
        if data is None:
            return None
        return _apollo_people(data, c) if execs_only else _apollo_matched(data, c)

    # A looked-up website may be a foreign namesake's: it may still reject a company that clearly hires
    # like a big one (many open roles), but otherwise a domain we can't tie to this employer never rejects.
    may_reject = c.domain_trusted or len(c.jobs) >= BIG_HINT_ROLES

    async def too_big_proof() -> Optional[bool]:
        if may_reject:
            found = await staff(above)
            reason = f"over {max_hc + 1} staff (Apollo)"
        else:
            # Website only matched by name (could be a foreign namesake's). It still proves "too big"
            # when that big organisation has staff BASED IN IRELAND under this name — a US namesake
            # with no Irish staff can't trigger it; EY, PwC or AIB do. (Checked: first live v3 scans
            # shortlisted EY, PwC Ireland, AIB, Analog Devices as 'unverified'.)
            found = await staff(above + IRISH_STAFF)
            reason = f"over {max_hc + 1} staff, with staff in Ireland (Apollo)"
        if found is None:
            return None
        if found:
            c.size_status, c.reject_reason = "too_big", reason
            return True
        return False

    if c.size_status == "verified":                    # a job board / earlier scan already proved it's small
        here = await staff(loc + titles)               # ANY current staff (titles match fuzzily)
        if here is None:
            return
        execs = [p for p in here if p.get("role")]
        if execs:
            _add_apollo_people(c, execs)
        if here:
            if loc:
                c.hq_ie = True                         # found WITH Apollo's Irish-HQ filter
            return
        if loc and c.hq_ie is not True and c.domain_trusted:
            # nobody with the Ireland filter: is that because the HQ is elsewhere?
            anywhere = await staff(titles)
            if anywhere:
                c.size_status, c.reject_reason = "too_big", "HQ outside Ireland (Apollo)"
        return

    above_first = len(c.jobs) >= BIG_HINT_ROLES or (c.size_lo or 0) > 50
    if above_first and await too_big_proof():
        return
    execs = await staff(ranges + loc + titles, execs_only=True)
    if execs is None:
        return                                          # failed / rate-limited: stay unverified
    if execs:
        _add_apollo_people(c, execs)
        _mark_verified(c, max_hc, "Apollo")
        c.hq_ie = True if loc else c.hq_ie
        return
    anyone = await staff(ranges + loc)
    if anyone is None:
        return
    if anyone:
        _mark_verified(c, max_hc, "Apollo")             # small and Irish, just no exec on file
        c.hq_ie = True if loc else c.hq_ie
        return
    if not above_first and await too_big_proof():
        return
    if loc and c.hq_ie is not True and c.domain_trusted:
        elsewhere = await staff(ranges)
        if elsewhere:
            c.size_status, c.reject_reason = "too_big", "HQ outside Ireland (Apollo)"
    # otherwise Apollo simply doesn't know the company: unverified


async def apollo_name_check(ctx: RunContext, c: Company) -> None:
    """No website found: free people search by keyword, kept only when Apollo's organisation name is
    EXACTLY this company (raw name: 'Ireland', 'Group', 'Funds'… all must match).
      * inside the size (and HQ) filters  -> verified
      * above the limit WITH staff based in Ireland -> too big ('Mediolanum International Funds
        Limited', 'Britvic Ireland'). A miss proves nothing, so a miss never rejects."""
    if ctx.apollo_disabled or c.domain or c.size_status == "too_big":
        return
    ranges, above = _apollo_ranges(ctx.p.max_headcount)
    loc = [("organization_locations[]", "Ireland")] if ctx.p.hq_ireland_only else []
    titles = [("person_titles[]", t) for t in APOLLO_ICP_TITLES]
    base = [("q_keywords", c.name[:80]), ("page", 1), ("per_page", 25)]
    data = await _people_search(ctx, base + ranges + loc + titles)
    if data is None:
        return
    execs = _apollo_people(data, c, exact=True)
    if execs:
        _add_apollo_people(c, execs)
        _mark_verified(c, ctx.p.max_headcount, NAME_MATCH_SOURCE)
        return
    if c.size_status == "verified":
        return
    data = await _people_search(ctx, base + ranges + loc)
    if data is None:
        return
    if _apollo_matched(data, c, exact=True):
        _mark_verified(c, ctx.p.max_headcount, NAME_MATCH_SOURCE)
        return
    data = await _people_search(ctx, base + above + IRISH_STAFF)
    if data is not None and _apollo_matched(data, c, exact=True):
        c.size_status = "too_big"
        c.reject_reason = f"over {ctx.p.max_headcount + 1} staff, with staff in Ireland (Apollo, exact name)"


NAME_MATCH_SOURCE = "Apollo (name match)"
JOB_SIGNAL_SOURCE = "Apollo job data (name match)"
JOB_SIGNAL_PAGES = 3
JOB_SIGNAL_SANITY = 50_000     # more than this means Apollo ignored the job-posting filters


async def apollo_job_signal(ctx: RunContext, companies: List[Company]) -> int:
    """ONE free people search (≤3 pages) for decision-makers at companies Apollo itself says are
    under the headcount limit, Irish-HQ'd, and have open Data/AI postings in Ireland. Any of our
    companies that appears there is verified (and gets its contacts) without a per-company check."""
    if ctx.apollo_disabled or not companies:
        return 0
    ranges, _ = _apollo_ranges(ctx.p.max_headcount)
    loc = [("organization_locations[]", "Ireland")] if ctx.p.hq_ireland_only else []
    since = (date.today() - timedelta(days=max(ctx.p.days_back, 30))).isoformat()   # Apollo's job data lags
    params: List[Tuple[str, Any]] = ranges + loc + [("person_titles[]", t) for t in APOLLO_ICP_TITLES]
    params += [("q_organization_job_titles[]", t) for t in APOLLO_JOB_TITLES]
    params += [("organization_job_locations[]", "Ireland"), ("organization_job_posted_at_range[min]", since)]
    by_name: Dict[str, List[Dict[str, Any]]] = {}
    for page in range(1, JOB_SIGNAL_PAGES + 1):
        ctx.check_cancel()
        data = await _people_search(ctx, params + [("page", page), ("per_page", 100)])
        if data is None:
            break
        total = _total_entries(data) or 0
        if total > JOB_SIGNAL_SANITY:
            ctx.log("Apollo ignored the job-posting filters on its free search — that shortcut was skipped", "warn")
            return 0
        people = [p for p in (data.get("people") or []) if isinstance(p, dict)]
        for p in people:
            org = p.get("organization") if isinstance(p.get("organization"), dict) else {}
            name = org.get("name") or ""
            if name:
                by_name.setdefault(raw_name_key(name), []).append(p)
        if len(people) < 100 or page * 100 >= total:
            break
    matched = 0
    for c in companies:
        c = CompanyRegistry.canon(c)
        if c.size_status == "too_big" or c.domain:
            continue        # a company with a website gets the stronger domain-anchored check instead
        # No website anchors this search, so only an EXACT raw name counts ('Kerry Group' never matches
        # 'Kerry Logistics'; 'Nimbus Data' never matches 'Nimbus Data Ireland').
        rows = by_name.get(raw_name_key(c.name)) or []
        if not rows:
            continue
        execs = _apollo_people({"people": rows}, c, exact=True)
        _add_apollo_people(c, execs)
        if c.size_status != "verified":
            _mark_verified(c, ctx.p.max_headcount, JOB_SIGNAL_SOURCE)
        if ctx.p.hq_ireland_only:
            c.hq_ie = True
        matched += 1
    if by_name:
        ctx.log(f"Apollo (free): {len(by_name)} small Irish companies with open Data/AI roles; "
                f"{matched} of them are in this scan")
    return matched


def _mark_verified(c: Company, max_hc: int, source: str) -> None:
    c.size_status, c.size_source = "verified", c.size_source or source
    c.reject_reason = ""
    if not c.size_label:
        c.size_label = f"under {max_hc + 1} staff"


async def apollo_paid_lookups(ctx: RunContext, reg: CompanyRegistry, companies: List[Company]) -> None:
    """OPTIONAL credit spend (apollo_company_lookups budget, default 0): Apollo company search by name
    for companies we could not find a website for. Cached for 3 weeks across scans."""
    pending = [c for c in companies if not c.domain and not c.resolved]
    cached = 0
    still: List[Company] = []
    for c in pending:
        hit = _cache_get(ctx, _lookup_keys(c))
        if hit is None:
            still.append(c)
            continue
        cached += 1
        _cache_put(ctx, _lookup_keys(c), None if hit.get("unmatched") else hit, learned_at=hit.get("t"))
        if not hit.get("unmatched"):
            reg.apply_apollo_org(c, hit)
    ctx.stats["apollo"]["lookups_cached"] += cached
    budget = ctx.p.apollo_company_lookups
    if budget <= 0 or not still or ctx.apollo_disabled:
        return
    still.sort(key=lambda c: -len(c.jobs))
    batch = still[:budget]
    ctx.log(f"Looking up {len(batch)} companies in Apollo by name (1 credit each, budget {budget})")

    async def one(c: Company) -> None:
        ctx.check_cancel()
        data = await ctx.apollo_call("POST", "/mixed_companies/search", kind="lookup_calls",
                                     params=[("q_organization_name", c.name), ("page", 1), ("per_page", 10)])
        if data is None:
            return
        org = _best_org_match(c, (data.get("organizations") or []) + (data.get("accounts") or []))
        _cache_put(ctx, _lookup_keys(c), org)
        if org:
            reg.apply_apollo_org(c, org)

    results = await asyncio.gather(*(one(c) for c in batch), return_exceptions=True)
    if any(isinstance(r, RunCancelled) for r in results):
        raise RunCancelled()


QUALIFY_DOMAIN_BUDGET = 180       # seconds for website discovery
SERPER_BUDGET = 60                # seconds for the optional Google fallback (after discovery)
QUALIFY_APOLLO_BUDGET = 240       # seconds for the free Apollo checks


def _verification_hit(ctx: RunContext, c: Company) -> Optional[Dict[str, Any]]:
    """A previous scan's 'verified small' result for THIS website, valid only if it was checked
    against limits at least as strict as today's (headcount limit, Irish-HQ rule)."""
    if not c.domain:
        return None
    hit = _cache_get(ctx, [f"ver:{c.domain}"])
    if not hit or hit.get("size_status") != "verified" or hit.get("domain") != c.domain:
        return None
    try:
        if int(hit.get("max_hc") or 10 ** 6) > ctx.p.max_headcount:
            return None
    except (TypeError, ValueError):
        return None
    if ctx.p.hq_ireland_only and not hit.get("hq"):
        return None
    return hit


async def _bounded(ctx: RunContext, coro: Any, seconds: int, what: str) -> None:
    try:
        await asyncio.wait_for(coro, timeout=seconds)
    except asyncio.TimeoutError:
        ctx.log(f"{what}: time limit reached — the rest stay 'headcount unverified'", "warn")


_PERSON_NAME = re.compile(r"^[A-Z][a-z]{1,14}(?:-[A-Z][a-z]+)? (?:[A-Z]{4,}|[A-Z]')[A-Za-z]*$")
_BUSINESS_CAPS = {"DATA", "TECH", "LABS", "GROUP", "SOFT", "MEDIA", "CLOUD", "SYSTEMS", "SOLUTIONS", "DIGITAL",
                  "CONSULTING", "PARTNERS", "HEALTH", "ENERGY", "BANK", "FINANCE", "CAPITAL", "LOGIC", "WORKS",
                  "SOFTWARE", "ANALYTICS", "INSIGHTS", "VENTURES", "STUDIO", "STUDIOS", "GAMES", "TELECOM"}


def looks_like_a_person(name: Any) -> bool:
    """'Mariam ADEME' — Indeed lists some ads under the posting recruiter's own name (French style:
    first name + SURNAME). Not a company to prospect."""
    n = clean_text(name, 80)
    if not _PERSON_NAME.match(n) or company_key(n) != _ascii(n).lower():
        return False
    return n.split()[1].upper() not in _BUSINESS_CAPS


def _agency_reason(c: Company) -> str:
    if c.agency_reason:
        return c.agency_reason
    if looks_like_a_person(c.name) and not c.domain:
        return "posted under a person's name (individual recruiter), not a company"
    if is_agency(c.name, c.industry):
        return f"staffing/recruitment ({'industry: ' + c.industry if c.industry and is_agency('', c.industry) else 'name'})"
    return ""


def _is_hq_reason(reason: str) -> bool:
    return reason.startswith("HQ")


def _big_cache_put(ctx: RunContext, c: Company) -> None:
    """Remember a positive 'too big' / 'HQ abroad' proof for 3 weeks so the next scan skips it for free."""
    reason = c.reject_reason or ""
    if reason.endswith("earlier scan"):
        return              # came FROM the cache: carried forward with its original date, never renewed
    hq_out = _is_hq_reason(reason)
    m = re.search(r"(\d[\d,]*)", reason)
    if hq_out:
        min_size = 0
    elif c.size is not None and c.size > ctx.p.max_headcount:
        min_size = c.size
    elif c.size_lo is not None and c.size_lo > ctx.p.max_headcount:
        min_size = c.size_lo
    elif c.wikidata_employees:
        min_size = c.wikidata_employees
    elif "over" in reason and m:
        min_size = int(m.group(1).replace(",", ""))
    else:
        return
    keys = [f"big:n:{c.key}"] + ([f"big:{c.domain}"] if c.domain else [])
    _cache_put(ctx, keys, {"min_size": min_size, "hq_out": hq_out, "reason": reason[:120]})


def _big_cache_hit(ctx: RunContext, c: Company) -> Optional[str]:
    hit = _cache_get(ctx, ([f"big:{c.domain}"] if c.domain else []) + [f"big:n:{c.key}"])
    if not hit:
        return None
    if hit.get("hq_out"):
        return f"{hit.get('reason') or 'HQ outside Ireland'} — earlier scan" if ctx.p.hq_ireland_only else None
    try:
        if int(hit.get("min_size") or 0) > ctx.p.max_headcount:
            return f"{hit.get('reason') or 'over the staff limit'} — earlier scan"
    except (TypeError, ValueError):
        pass
    return None


async def qualify_companies(ctx: RunContext, reg: CompanyRegistry) -> List[Company]:
    """Keep small Irish non-agency companies. Every step here is free unless the optional
    Apollo lookup budget is set. Expensive steps are bounded in both count and time.
    Order matters for speed: cheap proofs (job-board bands, HQ addresses, caches) first, then websites,
    then ONE Apollo job-signal search, then per-company Apollo checks only for what is still open."""
    f = ctx.stats["filtered"]
    max_hc = ctx.p.max_headcount
    pool: List[Company] = []
    for c in list(reg.items):
        if not c.jobs and not c.resolved:
            continue
        if c.key in OWN_COMPANY_KEYS:
            continue
        why = _agency_reason(c)
        if why:
            f["agency"] += 1
            ctx.reject(c, why, "qualify")
            continue
        pool.append(c)

    def settle_from_known_size(c: Company) -> None:
        if c.size_status == "too_big":
            return
        if c.size is not None:                         # exact Apollo number (discovery / paid lookup)
            if c.size > max_hc:
                c.size_status, c.reject_reason = "too_big", f"{c.size} staff (Apollo)"
                return
            c.size_status, c.size_source = "verified", "Apollo"
            c.size_label = c.size_label or f"{c.size} staff"
        elif c.size_hi is not None and c.size_status != "verified":   # job-board band, e.g. "11 to 50"
            if c.size_hi <= max_hc:
                c.size_status = "verified"
            elif c.size_lo is not None and c.size_lo > max_hc:
                c.size_status, c.reject_reason = "too_big", f"{c.size_label} ({c.size_source})"
                return
        if c.wikidata_employees is not None and c.wikidata_employees > max_hc and c.size_status != "verified":
            c.size_status, c.reject_reason = "too_big", f"about {c.wikidata_employees:,} staff (Wikidata)"
            return
        if c.size_status != "verified":
            cached = _big_cache_hit(ctx, c)
            if cached:
                c.size_status, c.reject_reason = "too_big", cached
                return
            hit = _verification_hit(ctx, c)
            if hit:
                c.size_status = "verified"
                c.size_label = c.size_label or hit.get("size_label") or ""
                c.size_source = c.size_source or hit.get("size_source") or "earlier scan"
                c.size_verified_at = hit.get("t")
        if ctx.p.hq_ireland_only:
            if c.country and not is_irish_country(c.country):
                c.size_status, c.reject_reason = "too_big", f"HQ in {c.country}"
            elif c.hq_ie is False:
                c.size_status, c.reject_reason = "too_big", f"HQ in {c.hq_text} (job board)"

    for c in pool:
        settle_from_known_size(c)
    live = [c for c in pool if c.size_status != "too_big"]
    # Bound the expensive steps: verified first, then the SMALLER hirers (fewest roles) — a company
    # with 8 open Data/AI roles is rarely under 100 staff.
    def has_wanted_type(c: Company) -> bool:
        """A role whose STATED type is one the scan asked for (not just 'Unspecified')."""
        return any(j["employment_type"] in ctx.p.employment_types for j in c.jobs.values())

    # verified first, then companies already showing a role of the wanted type, then the SMALLER hirers
    # (fewest roles — a company with 8 open Data/AI roles is rarely under 100 staff).
    live.sort(key=lambda c: (c.size_status != "verified", not has_wanted_type(c), len(c.jobs) >= BIG_HINT_ROLES,
                             len(c.jobs), c.name.lower()))
    # Three times the cap is checked: LinkedIn job pages later remove many (first live contract scan:
    # 30 shortlisted, 13 lost every role to 'Full-time', only 5 left of a cap of 15).
    work = live[: ctx.p.max_companies * 3]
    for c in live[len(work):]:
        f["over_company_cap"] += 1
        ctx.reject(c, "over the company cap (raise 'Max companies' in Scan settings)", "qualify")
    ctx.log(f"Qualifying {len(work)} companies ({len(pool) - len(live)} already ruled out by job-board data or "
            f"earlier scans)")
    ctx.stats["domains"]["board"] += len([c for c in work if c.domain])
    await _bounded(ctx, discover_domains(ctx, reg, work), QUALIFY_DOMAIN_BUDGET, "Website discovery")
    await finish_domains(ctx, reg, work)
    ctx.bump(48)
    await apollo_paid_lookups(ctx, reg, work)
    work = list({id(CompanyRegistry.canon(c)): CompanyRegistry.canon(c) for c in work}.values())
    for c in work:
        settle_from_known_size(c)

    async def apollo_stage() -> None:
        await apollo_job_signal(ctx, [c for c in work if c.size_status != "too_big"])
        # per-company free checks for whatever is still open (or verified but without a contact yet)
        checks = [c for c in work if c.size_status != "too_big"
                  and (c.size_status != "verified" or not c.apollo_people)]
        if not checks:
            return
        ctx.log(f"Checking headcount and decision-makers for {len(checks)} companies in Apollo (free people search)")
        done = 0

        async def one(c: Company) -> None:
            nonlocal done
            if c.domain:
                await apollo_size_and_people(ctx, c)
            else:
                await apollo_name_check(ctx, c)
            done += 1
            ctx.bump(48 + 12 * done / max(1, len(checks)))

        results = await asyncio.gather(*(one(c) for c in checks), return_exceptions=True)
        _raise_cancel_log_rest(ctx, results, "Apollo check")

    if not ctx.apollo_disabled:
        await _bounded(ctx, apollo_stage(), QUALIFY_APOLLO_BUDGET, "Apollo headcount checks")
    keep: List[Company] = []
    survivors = {id(CompanyRegistry.canon(c)): CompanyRegistry.canon(c) for c in pool}
    ruled_out = [c for c in survivors.values() if c.size_status == "too_big"]
    for c in ruled_out:
        if _is_hq_reason(c.reject_reason or ""):
            f["hq_outside_ireland"] += 1
        else:
            f["headcount_too_big"] += 1
        ctx.reject(c, c.reject_reason or "over the staff limit", "qualify")
        _big_cache_put(ctx, c)
    for c in work:
        if c.size_status == "too_big":
            continue
        if c.size_status != "verified":
            c.size_status = "unverified"
            f["headcount_unverified"] += 1
        keep.append(c)
    # verified first, then the busiest hirers. Up to TWICE the cap goes on: LinkedIn job pages can still
    # remove companies (wrong employment type, agency wording); the cap is applied after that.
    keep.sort(key=lambda c: (c.size_status != "verified", -len(c.jobs), c.name.lower()))
    cap = ctx.p.max_companies * 2
    for c in keep[cap:]:
        f["over_company_cap"] += 1
        ctx.reject(c, "over the company cap (raise 'Max companies' in Scan settings)", "qualify")
    return keep[:cap]


# ════════════════════════════════════════════════════════════════════════
# Company websites — careers pages, public ATS boards and "team" pages
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
    if ats == "smartrecruiters":
        data = await _json(ctx, f"https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100")
        first = ((data or {}).get("content") or [{}])[0] if isinstance(data, dict) else {}
        name = ((first or {}).get("company") or {}).get("name") if isinstance(first, dict) else ""
        return parse_smartrecruiters(data, slug), str(name or "")
    if ats == "breezy":
        data = await _json(ctx, f"https://{slug}.breezy.hr/json")
        first = data[0] if isinstance(data, list) and data and isinstance(data[0], dict) else {}
        return parse_breezy(data, slug), str(((first.get("company") or {}) if isinstance(first.get("company"), dict) else {}).get("name") or "")
    return [], ""


def _analyse_home(html: str, url: str) -> Tuple[List[Tuple[str, str]], List[Dict[str, Any]], List[str], List[str],
                                                List[Dict[str, Any]]]:
    return (find_ats_refs(html), parse_jsonld_jobs(html, url), find_careers_links(html, url),
            hs.find_team_links(html, url), hs.extract_people(html))


async def scan_company_website(ctx: RunContext, reg: CompanyRegistry, c: Company) -> int:
    if not c.domain and not c.ats_refs:
        return 0
    found_postings: List[Tuple[str, Dict[str, Any]]] = []
    refs: List[Tuple[str, str]] = list(c.ats_refs)        # boards seen in Indeed / Glassdoor apply links
    team_links: List[str] = []
    pages_seen: set = set()
    queue = [f"https://{c.domain}/", f"https://{c.domain}/careers"] if c.domain else []
    while queue and len(pages_seen) < 3:
        url = queue.pop(0)
        if url in pages_seen:
            continue
        pages_seen.add(url)
        r = await ctx.web_get(url, headers={"User-Agent": BROWSER_UA, "Accept": "text/html,*/*;q=0.8"})
        if r is None or r.status_code >= 400:
            continue
        # HTML parsing is CPU work — keep it off the event loop so the CRM stays responsive.
        page_refs, page_jobs, page_links, page_team, page_people = await hs.in_pool(_analyse_home, r.text, str(r.url))
        for ref in page_refs:
            if ref not in refs:
                refs.append(ref)
        for jp in page_jobs:
            found_postings.append(("Company website", jp))
        for link in page_links:
            if link not in pages_seen and link not in queue:
                queue.insert(0, link)
        for t in page_team:
            if t not in team_links:
                team_links.append(t)
        c.site_people.extend(page_people)
    # "About / Team / Leadership" pages name founders and execs — free contacts
    for link in team_links[:2]:
        if link in pages_seen:
            continue
        pages_seen.add(link)
        r = await ctx.web_get(link, headers={"User-Agent": BROWSER_UA, "Accept": "text/html,*/*;q=0.8"})
        if r is not None and r.status_code < 400:
            c.site_people.extend(await hs.in_pool(hs.extract_people, r.text))
    verified_guess = False
    if not refs and not found_postings and c.domain:
        # No link to an ATS on the site — try the two boards that let us verify ownership by name.
        guess = c.domain.split(".")[0]
        for ats in ("greenhouse", "workable"):
            jobs, board_name = await fetch_ats_board(ctx, ats, guess)
            if jobs and board_name and company_key(board_name) == c.key:
                found_postings += [(f"Company website ({ats.title()})", j) for j in jobs]
                verified_guess = True
                break
    for ats, slug in refs[:3]:
        jobs, _ = await fetch_ats_board(ctx, ats, slug)
        found_postings += [(f"Company website ({ats.title()})", j) for j in jobs]
    added = 0
    for source, jp in found_postings:
        if _ingest(ctx, reg, source=source, title=jp.get("title"), company=c.name, location=jp.get("location"),
                   url=jp.get("url"), employment_raw=jp.get("employment_raw"), posted_at=jp.get("posted_at"),
                   target=c):
            added += 1
    if refs or found_postings or verified_guess:
        ctx.source_stat("Company websites", companies=1)
    return added


async def stage_websites(ctx: RunContext, reg: CompanyRegistry, companies: List[Company]) -> None:
    done = 0

    async def one(c: Company) -> None:
        nonlocal done
        ctx.check_cancel()
        try:
            await scan_company_website(ctx, reg, c)
        except RunCancelled:
            raise
        except Exception as e:                       # one bad website never sinks the run
            log.debug(f"[hiring-intel] website scan {c.domain}: {e}")
        done += 1
        ctx.bump(60 + 18 * done / max(1, len(companies)))

    ctx.source_stat("Company websites", status="running")
    results = await asyncio.gather(*(one(c) for c in companies), return_exceptions=True)
    if any(isinstance(r, RunCancelled) for r in results):
        raise RunCancelled()
    ctx.source_stat("Company websites", status="ok")
    ctx.log(f"Company websites: checked {len([c for c in companies if c.domain])} careers / team pages")


# ════════════════════════════════════════════════════════════════════════
# Contacts — merge free sources; Apollo credits are spent only on Reveal
# ════════════════════════════════════════════════════════════════════════
def _person_key(p: Dict[str, Any], company: str = "") -> str:
    """Apollo id or LinkedIn profile when known; otherwise the name SCOPED TO THE COMPANY, so two
    different John Smiths at two companies never share contact data."""
    if p.get("apollo_person_id"):
        return str(p["apollo_person_id"])
    li = re.search(r"linkedin\.com/in/([^/?#]+)", str(p.get("linkedin_url") or ""), re.I)
    if li:
        return "li:" + li.group(1).lower()
    return f"n:{company}:" + re.sub(r"[^a-z]", "", _ascii(p.get("name")).lower())[:60]


def _surname_compatible(hidden: str, full: str) -> bool:
    """Apollo shows 'By***e' for 'Byrne': visible prefix and suffix must both match."""
    hidden, full = hidden.lower(), full.lower()
    if "*" not in hidden:
        return hidden == full
    head, _, tail = hidden.partition("*")
    tail = tail.strip("*")
    return bool(head) and full.startswith(head) and full.endswith(tail) and len(full) >= len(head) + len(tail)


def _same_person(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    fa, fb = _ascii(a.get("name")).lower().split(), _ascii(b.get("name")).lower().split()
    if len(fa) < 2 or len(fb) < 2 or fa[0] != fb[0]:
        return False
    la, lb = fa[-1], fb[-1]
    if "*" in la:
        return _surname_compatible(la, lb)
    if "*" in lb:
        return _surname_compatible(lb, la)
    return la == lb


def merge_contacts(apollo: List[Dict[str, Any]], site: List[Dict[str, Any]], xray: List[Dict[str, Any]],
                   cap: int, company: str = "") -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = [dict(p) for p in apollo]
    for p in list(site) + list(xray):
        role, rank = classify_icp(p.get("title"))
        if not role:
            continue
        cand = {**p, "role": role, "rank": rank, "needs_reveal": False}
        twin = next((m for m in merged if _same_person(m, cand)), None)
        if twin:
            # the free source has the full name / LinkedIn the Apollo row hides
            if twin.get("needs_reveal") and cand.get("name"):
                twin["name"], twin["needs_reveal"] = cand["name"], False
                twin["name_source"] = cand.get("source")
            if cand.get("linkedin_url") and not twin.get("linkedin_url"):
                twin["linkedin_url"] = cand["linkedin_url"]
            continue
        merged.append(cand)
    seen: set = set()
    out: List[Dict[str, Any]] = []
    for p in sorted(merged, key=lambda x: (x["rank"], 0 if x.get("apollo_person_id") else 1)):
        k = _person_key(p, company)
        if k in seen:
            continue
        seen.add(k)
        p["person_key"] = k
        out.append(p)
    return out[:cap]


async def xray_people(ctx: RunContext, companies: List[Company]) -> None:
    """Optional: Google 'site:linkedin.com/in' search for companies with no data head / CTO yet."""
    if not hs.serper_key():
        return
    need = [c for c in companies if not any(classify_icp(p.get("title"))[1] <= 2
                                            for p in (c.apollo_people + c.site_people))]
    if not need:
        return
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0)) as client:
        for c in need[: ctx.serper_budget()]:
            ctx.check_cancel()
            q = (f'site:linkedin.com/in ("CEO" OR "CTO" OR "founder" OR "co-founder" OR "head of data") '
                 f'"{c.name}"')
            state, organic = await hs.serper_search(client, q, num=10)
            ctx.stats["serper_queries"] = ctx.stats.get("serper_queries", 0) + 1
            if state != "ok":
                if state in ("auth", "rate_limited"):
                    ctx.warn(f"Google search (Serper) stopped: {state}")
                    return
                continue
            for o in organic:
                person = hs.parse_xray_result(o, _tokens(c))
                if person:
                    c.xray_people.append(person)


async def _previously_revealed(person_keys: List[str], linkedin_urls: List[str]) -> Dict[str, Dict[str, Any]]:
    """Contact details already paid for in a retained scan, keyed by person_key and LinkedIn URL."""
    out: Dict[str, Dict[str, Any]] = {}
    cols = "person_key,apollo_person_id,person_name,person_title,email,email_status,linkedin_url,enriched_at"
    for field_name, values in (("person_key", person_keys), ("linkedin_url", linkedin_urls)):
        values = [v for v in dict.fromkeys(values) if v]
        for i in range(0, len(values), 100):
            chunk = values[i:i + 100]
            try:
                res = await _run(lambda chunk=chunk, fn=field_name: _sb("hiring_intel_leads").select(cols)
                                 .in_(fn, chunk).not_.is_("enriched_at", "null").execute())
            except Exception as e:
                log.warning(f"[hiring-intel] previous reveal lookup failed: {_integ._redact(e)}")
                return out
            for row in res.data or []:
                for k in (row.get("person_key"), row.get("linkedin_url")):
                    if k and (k not in out or (row.get("email") and not out[k].get("email"))):
                        out[k] = row
    return out


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


# Every lead row carries the SAME keys: a bulk insert through PostgREST fills a key missing from some
# rows with NULL (not the column default), which breaks NOT NULL columns such as name_hidden.
_EMPTY_PERSON: Dict[str, Any] = {
    "person_key": "", "apollo_person_id": None, "person_name": None, "person_title": None, "icp_role": None,
    "email": None, "email_status": None, "linkedin_url": None, "enriched_at": None, "contact_source": None,
    "name_hidden": False,
}


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
            "company_domain": c.domain or None,
            "company_website": c.website or (f"https://{c.domain}" if c.domain else None),
            "company_linkedin": c.linkedin or None, "company_size": c.size, "company_industry": c.industry or None,
            "company_city": (c.city or c.hq_text or "")[:120] or None, "company_phone": c.phone or None,
            "apollo_org_id": c.apollo_id or None,
            "size_status": c.size_status or "unverified",
            "size_label": (f"{c.size_label} · {c.size_source}" if c.size_label and c.size_source else c.size_label) or None,
            "hiring_for": titles, "job_links": links, "employment_types": types,
            "categories": cats, "is_new_company": c.key not in prev_companies,
        }
        people = contacts.get(c.key) or []
        if not people:
            lead_rows.append({**base, **_EMPTY_PERSON})
            continue
        for p in people:
            lead_rows.append({
                **base, "person_key": p["person_key"], "apollo_person_id": p.get("apollo_person_id") or None,
                "person_name": p.get("name") or None, "person_title": p.get("title") or None,
                "icp_role": p.get("role"), "email": p.get("email"), "email_status": p.get("email_status") or None,
                "linkedin_url": p.get("linkedin_url") or None, "enriched_at": p.get("enriched_at"),
                "contact_source": p.get("source"), "name_hidden": bool(p.get("needs_reveal")),
            })
    return job_rows, lead_rows


def contact_summary(lead_rows: List[Dict[str, Any]]) -> Dict[str, int]:
    people = [r for r in lead_rows if r.get("person_key")]
    return {
        "with_email": len([r for r in lead_rows if r.get("email")]),
        "with_linkedin": len([r for r in people if r.get("linkedin_url")]),
        "revealed": len([r for r in people if r.get("enriched_at")]),
        "to_reveal": len([r for r in people if not r.get("enriched_at")]),
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
SOURCE_RUNNERS = {
    "linkedin": source_linkedin,
    "indeed": source_indeed,
    "glassdoor": source_glassdoor,
    "careerjet": source_careerjet,
    "jobsireland": source_jobsireland,
    "jooble": source_jooble,
    "apollo_discovery": source_apollo_companies,
}


async def _run_source(ctx: RunContext, name: str, fn: Callable[..., Any], reg: CompanyRegistry) -> None:
    """Each board is fenced: a crash, hang or block in one never stops the others."""
    budget = LINKEDIN_TIME_BUDGET + 120 if name == "linkedin" else SOURCE_TIME_BUDGET
    try:
        await asyncio.wait_for(fn(ctx, reg), timeout=budget)
    except RunCancelled:
        raise
    except asyncio.TimeoutError:
        label = SOURCE_LABELS.get(name, name)
        ctx.source_stat(label, status="partial", note=f"stopped after {budget // 60} min")
        ctx.log(f"{label}: time limit reached — kept what it had found", "warn")
    except Exception as e:
        label = SOURCE_LABELS.get(name, name)
        ctx.source_stat(label, status="error", note=redact(f"{type(e).__name__}: {str(e)[:120]}"))
        ctx.warn(f"{label} failed ({type(e).__name__}); the other sources still ran.")
        log.exception(f"[hiring-intel] source {name} crashed")


async def pipeline(ctx: RunContext) -> Dict[str, int]:
    reg = CompanyRegistry()
    p = ctx.p

    # 1 ── DISCOVER — all boards in parallel, each fenced
    ctx.set_stage("discover", 3)
    ctx.log(f"Scanning the last {p.days_back} day(s) for {' & '.join(p.employment_types).lower()} "
            f"Data & AI roles in Ireland on: {', '.join(SOURCE_LABELS.get(s, s) for s in p.sources if s != 'websites')}")
    await load_company_cache(ctx)
    runners = [(_name, fn) for _name, fn in SOURCE_RUNNERS.items() if _name in p.sources]
    results = await asyncio.gather(*(_run_source(ctx, n, fn, reg) for n, fn in runners), return_exceptions=True)
    for r in results:
        if isinstance(r, RunCancelled):
            raise r
    ctx.check_cancel()
    total_roles = sum(len(c.jobs) for c in reg.items)
    ctx.log(f"{total_roles} matching roles at {len([c for c in reg.items if c.jobs])} companies before qualification")

    # 2 ── QUALIFY — headcount / HQ / agency, free
    ctx.set_stage("qualify", 40)
    companies = await qualify_companies(ctx, reg)
    ctx.log(f"{len([c for c in companies if c.size_status == 'verified'])} companies confirmed under "
            f"{p.max_headcount + 1} staff, {len([c for c in companies if c.size_status == 'unverified'])} not yet "
            f"confirmed (shortlist; capped at {p.max_companies} after the job pages)")
    ctx.check_cancel()

    # 3 ── COMPANY WEBSITES (careers + team pages) and LINKEDIN JOB PAGES, side by side —
    #      different hosts, so neither slows the other down
    ctx.set_stage("websites", 60)
    steps = [linkedin_job_pages(ctx, companies)]
    if "websites" in p.sources:
        steps.append(stage_websites(ctx, reg, companies))
    results = await asyncio.gather(*steps, return_exceptions=True)
    for r in results:
        if isinstance(r, RunCancelled):
            raise r
        if isinstance(r, Exception):            # one failing step never sinks the scan
            log.warning(f"[hiring-intel] post-qualify step failed: {type(r).__name__}: {redact(r)}")
            ctx.warn(f"A post-qualification step failed ({type(r).__name__}); results may be less complete.")
    companies = [CompanyRegistry.canon(c) for c in companies]
    companies = list({id(c): c for c in companies}.values())
    # Last word on employment type, for EVERY role: a role seen on LinkedIn AND a careers page was
    # typed 'Permanent' by its LinkedIn job page after the merge and slipped into a Contract-only scan
    # (CitySwift, 23 Oct). Nothing reaches the sheet that the scan settings didn't ask for.
    for c in companies:
        for tk in [tk for tk, j in c.jobs.items() if not _type_allowed(ctx, j["employment_type"])]:
            c.typed_out[tk] = c.jobs[tk]["employment_type"]
            del c.jobs[tk]
            ctx.stats["filtered"]["employment_type"] += 1
    final: List[Company] = []
    for c in companies:
        why = _agency_reason(c)                  # LinkedIn job pages can reveal an agency only now
        if why:
            ctx.stats["filtered"]["agency"] += 1
            ctx.reject(c, why, "job pages")
        elif not c.jobs:
            ctx.stats["filtered"]["no_qualifying_jobs"] += 1
            ctx.reject(c, "no role left after checking the employment type", "job pages")
        else:
            final.append(c)
    final.sort(key=lambda c: (c.size_status != "verified", -len(c.jobs), c.name.lower()))
    for c in final[p.max_companies:]:
        ctx.stats["filtered"]["over_company_cap"] += 1
        ctx.reject(c, "over the company cap (raise 'Max companies' in Scan settings)", "cap")
    final = final[: p.max_companies]
    ctx.check_cancel()

    # 4 ── CONTACTS — free: Apollo people search, team pages, optional Google X-ray
    ctx.set_stage("contacts", 80)
    await xray_people(ctx, final)
    contacts: Dict[str, List[Dict[str, Any]]] = {}
    claimed: set = set()
    for c in final:
        people = merge_contacts(c.apollo_people, c.site_people, c.xray_people, p.contacts_per_company, c.key)
        people = [x for x in people if x["person_key"] not in claimed]
        claimed.update(x["person_key"] for x in people)
        contacts[c.key] = people
    everyone = [x for ps in contacts.values() for x in ps]
    prev = await _previously_revealed([x["person_key"] for x in everyone],
                                      [x.get("linkedin_url") for x in everyone if x.get("linkedin_url")])
    reused = 0
    for x in everyone:
        old = prev.get(x["person_key"]) or (prev.get(x["linkedin_url"]) if x.get("linkedin_url") else None)
        if old:
            x.update({"name": old.get("person_name") or x.get("name"), "email": old.get("email"),
                      "email_status": old.get("email_status"), "enriched_at": old.get("enriched_at"),
                      "linkedin_url": x.get("linkedin_url") or old.get("linkedin_url"),
                      "apollo_person_id": x.get("apollo_person_id") or old.get("apollo_person_id"),
                      "needs_reveal": False})
            reused += 1
    ctx.stats["apollo"]["contacts_reused"] = reused
    ctx.log(f"{len(everyone)} decision-makers found (no credits used); {reused} already revealed in earlier scans")
    ctx.check_cancel()

    # 5 ── SAVE
    ctx.set_stage("save", 92)
    prev_jobs, prev_companies = await _previous_run_snapshot(ctx.run_id)
    job_rows, lead_rows = build_rows(ctx.run_id, final, contacts, prev_jobs, prev_companies, _iso())
    await _insert_chunks("hiring_intel_jobs", job_rows)
    await _insert_chunks("hiring_intel_leads", lead_rows)
    for c in final:                                       # remember what we learned (free next time)
        if c.size_status == "verified" and c.domain and c.size_source not in (NAME_MATCH_SOURCE, JOB_SIGNAL_SOURCE):
            # keyed by WEBSITE (names collide: 'Kerry Group' vs 'Kerry Ltd'), stamped with the limits it
            # was checked against, and keeping its original date so it really expires.
            _cache_put(ctx, [f"ver:{c.domain}"], {"domain": c.domain, "size_status": "verified",
                                                 "size_label": c.size_label, "size_source": c.size_source,
                                                 "max_hc": p.max_headcount,
                                                 "hq": p.hq_ireland_only and (c.size_source == "Apollo"
                                                                              or c.hq_ie is True)},
                       learned_at=c.size_verified_at)
    counts = {
        "jobs_count": len(job_rows),
        "companies_count": len(final),
        "contacts_count": len([r for r in lead_rows if r.get("person_key")]),
    }
    ctx.stats["summary"] = {
        **counts,
        "new_jobs": len([j for j in job_rows if j["is_new"]]),
        "new_companies": len([c for c in final if c.key not in prev_companies]),
        "verified_companies": len([c for c in final if c.size_status == "verified"]),
        "unverified_companies": len([c for c in final if c.size_status != "verified"]),
        "companies_with_contact": len({r["company_key"] for r in lead_rows if r.get("person_key")}),
        **contact_summary(lead_rows),
    }
    ctx.log(f"Saved {counts['jobs_count']} roles, {counts['companies_count']} companies, "
            f"{counts['contacts_count']} contacts")
    return counts


async def execute_run(run_id: str, params: RunParams, user_ip: str = "", user_agent: str = "") -> None:
    ctx = RunContext(run_id, params)
    ctx.user_ip, ctx.user_agent = user_ip, user_agent
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
        if ctx.li_client is not None:
            await ctx.li_client.close()
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
            "linkedin": {"configured": True, "label": "LinkedIn", "kind": "board"},
            "indeed": {"configured": True, "label": "Indeed", "kind": "board"},
            "glassdoor": {"configured": True, "label": "Glassdoor", "kind": "board"},
            "careerjet": {"configured": bool(hs.careerjet_key()), "label": "CareerJet", "kind": "board",
                          "setup": "CAREERJET_API_KEY"},
            "jobsireland": {"configured": True, "label": "JobsIreland", "kind": "board"},
            "jooble": {"configured": bool(jooble_key()), "label": "Jooble", "kind": "board", "setup": "JOOBLE_API_KEY"},
            "websites": {"configured": True, "label": "Careers & team pages", "kind": "site"},
            "apollo_discovery": {"configured": bool(apollo_key()), "label": "Apollo discovery (≈2 credits)",
                                 "kind": "paid"},
        },
        "integrations": {
            "apollo": bool(apollo_key()),          # free people search + paid Reveal
            "serper": bool(hs.serper_key()),       # optional Google search
            "website_lookup": True,                # Clearbit autocomplete + Wikidata (free, no key)
            "proxies": len(hs.proxies_from_env()),
        },
        "blocked_boards": hs.BLOCKED_BOARDS,
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
    xff = request.headers.get("x-forwarded-for", "")
    user_ip = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "")
    task = asyncio.create_task(execute_run(run["id"], body, user_ip=user_ip,
                                           user_agent=request.headers.get("user-agent", "")[:300]))
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
        # contacts whose surname is still hidden ("Jane D***e") are not pushed — Reveal them first
        people = sorted([r for r in rows if r.get("person_key") and not r.get("name_hidden")],
                        key=lambda r: rank.get(r.get("icp_role"), 9))[:3]
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


class RevealBody(BaseModel):
    lead_ids: List[str] = Field(..., min_length=1, max_length=60)


def _split_name(name: str) -> Tuple[str, str]:
    parts = [x for x in clean_text(name, 120).split() if x.lower() not in ("dr", "dr.", "mr", "ms", "mrs")]
    if len(parts) < 2 or "*" in parts[-1]:
        return (parts[0] if parts else ""), ""
    return parts[0], parts[-1]


@router.post("/runs/{run_id}/reveal")
async def reveal_contacts(run_id: str, body: RevealBody, request: Request):
    """The ONLY place Hiring Intel spends Apollo credits: full name + work email for the contacts
    you choose (about 1 credit each; Apollo charges nothing when it has no data). Anything already
    revealed in one of the kept scans is copied for free."""
    user = await _user(request)
    await _get_run(run_id, "id")
    if not apollo_key():
        raise HTTPException(503, "APOLLO_API_KEY is not configured on the backend.")
    ids = [i for i in dict.fromkeys(body.lead_ids) if re.fullmatch(r"[0-9a-fA-F-]{36}", i or "")]
    if not ids:
        raise HTTPException(400, "No valid contacts selected.")
    res = await _run(lambda: _sb("hiring_intel_leads").select("*").eq("run_id", run_id).in_("id", ids).execute())
    rows = [r for r in (res.data or []) if r.get("person_key")]
    todo = [r for r in rows if not r.get("enriched_at")]
    now = _iso()
    updates: Dict[str, Dict[str, Any]] = {}

    # 1) free: already revealed in a kept scan
    prev = await _previously_revealed([r["person_key"] for r in todo], [r.get("linkedin_url") for r in todo])
    reused = 0
    for r in todo:
        old = prev.get(r["person_key"]) or (prev.get(r["linkedin_url"]) if r.get("linkedin_url") else None)
        if old:
            updates[r["id"]] = {"person_name": old.get("person_name") or r.get("person_name"),
                                "email": old.get("email"), "email_status": old.get("email_status"),
                                "linkedin_url": r.get("linkedin_url") or old.get("linkedin_url"),
                                "apollo_person_id": r.get("apollo_person_id") or old.get("apollo_person_id"),
                                "enriched_at": old.get("enriched_at") or now, "name_hidden": False}
            reused += 1
    remaining = [r for r in todo if r["id"] not in updates]

    def apply_match(r: Dict[str, Any], m: Optional[Dict[str, Any]]) -> None:
        if not isinstance(m, dict):
            # Apollo has nothing (no credit charged) — remember it so nobody pays to ask again
            updates[r["id"]] = {"enriched_at": now, "email_status": "not_found"}
            return
        name = clean_text(m.get("name") or f"{m.get('first_name') or ''} {m.get('last_name') or ''}", 120)
        updates[r["id"]] = {
            "person_name": name or r.get("person_name"), "person_title": clean_text(m.get("title"), 160) or r.get("person_title"),
            "email": clean_email(m.get("email")), "email_status": m.get("email_status") or ("found" if m.get("email") else "not_found"),
            "linkedin_url": m.get("linkedin_url") or r.get("linkedin_url"),
            "apollo_person_id": str(m.get("id") or r.get("apollo_person_id") or "") or None,
            "enriched_at": now, "name_hidden": False,
        }

    credits = 0.0
    errors: List[str] = []
    headers = {"x-api-key": apollo_key(), "Content-Type": "application/json", "accept": "application/json",
               "Cache-Control": "no-cache"}
    async with httpx.AsyncClient(timeout=_integ._TIMEOUT, headers=headers) as client:
        by_id = [r for r in remaining if r.get("apollo_person_id")]
        for i in range(0, len(by_id), 10):
            chunk = by_id[i:i + 10]
            out = await _integ._request(client, "POST", f"{APOLLO_BASE}/people/bulk_match",
                                        params=[("reveal_personal_emails", "false")],
                                        json={"details": [{"id": r["apollo_person_id"]} for r in chunk],
                                              "reveal_personal_emails": False})
            if not out.get("ok"):
                errors.append(str(out.get("error")))
                if "auth" in str(out.get("error")):
                    break
                continue
            data = out.get("data") or {}
            try:
                credits += float(data.get("credits_consumed") or 0)
            except (TypeError, ValueError):
                pass
            # Apollo returns `matches` in request order (null for a miss); a merged person can come back
            # with a different id, so map by position, falling back to id.
            raw = data.get("matches") or []
            by_pid = {str(m.get("id")): m for m in raw if isinstance(m, dict)}
            for idx, r in enumerate(chunk):
                m = raw[idx] if idx < len(raw) and (raw[idx] is None or isinstance(raw[idx], dict)) else None
                apply_match(r, m if m is not None else by_pid.get(str(r["apollo_person_id"])))
        for r in [x for x in remaining if not x.get("apollo_person_id")]:
            first, last = _split_name(r.get("person_name") or "")
            if not (first and last) and not r.get("linkedin_url"):
                errors.append(f"{r.get('person_name') or 'contact'}: full name needed")
                continue
            params: List[Tuple[str, Any]] = [("reveal_personal_emails", "false")]
            for k, v in (("first_name", first), ("last_name", last), ("domain", r.get("company_domain")),
                         ("organization_name", r.get("company_name")), ("linkedin_url", r.get("linkedin_url"))):
                if v:
                    params.append((k, v))
            out = await _integ._request(client, "POST", f"{APOLLO_BASE}/people/match", params=params)
            if not out.get("ok"):
                errors.append(str(out.get("error")))
                if "auth" in str(out.get("error")):
                    break
                continue
            data = out.get("data") or {}
            try:
                credits += float(data.get("credits_consumed") or 0)
            except (TypeError, ValueError):
                pass
            apply_match(r, data.get("person"))
            await asyncio.sleep(0.3)

    for lead_id, patch in updates.items():
        patch = {k: v for k, v in patch.items() if v is not None or k in ("email",)}
        await _run(lambda lead_id=lead_id, patch=patch: _sb("hiring_intel_leads").update(patch).eq("id", lead_id).execute())
    try:                                                   # keep the KPI tiles in step
        run_row = await _get_run(run_id, "id,stats")
        all_leads = await _fetch_all("hiring_intel_leads", "id,person_key,email,linkedin_url,enriched_at", run_id)
        stats = run_row.get("stats") or {}
        stats["summary"] = {**(stats.get("summary") or {}), **contact_summary(all_leads)}
        apollo_stats = stats.setdefault("apollo", {})
        apollo_stats["reveal_credits"] = round(float(apollo_stats.get("reveal_credits") or 0) + credits, 2)
        await _run(lambda: _sb("hiring_intel_runs").update({"stats": stats}).eq("id", run_id).execute())
    except Exception as e:
        log.warning(f"[hiring-intel] summary refresh failed: {_integ._redact(e)}")
    found = len([u for u in updates.values() if u.get("email")])
    _fire_audit("hiring_intel_reveal", user, run_id, request,
                {"requested": len(ids), "revealed": len(updates), "credits": credits})
    if errors and not updates:
        raise HTTPException(502, f"Apollo did not reveal anything: {_integ._redact(errors[0])}")
    return {"requested": len(ids), "already_revealed": len(rows) - len(todo), "reused_free": reused,
            "revealed": len(updates) - reused, "with_email": found, "credits_used": credits,
            "errors": [_integ._redact(e) for e in errors[:5]]}


def init(*, sb: Callable[[str], Any], run: Callable[..., Any], get_current_user: Callable[..., Any],
         require_module: Callable[[dict, str], None], audit: Optional[Callable[..., Any]] = None) -> APIRouter:
    """Wire the module to server.py's Supabase helpers and auth. Returns the router to include."""
    global _sb, _run, _get_user, _require_module, _audit
    _sb, _run, _get_user, _require_module, _audit = sb, run, get_current_user, require_module, audit
    return router
