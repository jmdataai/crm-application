"""
hiring_sources.py — job-board and people-finding adapters for Hiring Intel.

Each adapter returns plain dicts; hiring_intel.py does filtering, de-duplication,
qualification and storage. Adapters never raise into the pipeline: they return a
SourceResult with a status the UI can show (ok / partial / blocked / not_configured
/ error) and whatever rows they managed to collect.

WHAT IS USED, AND WHY
    LinkedIn    Public guest job search (no login, no account). Requests go through
                curl_cffi with a real Chrome TLS fingerprint — the same technique the
                open-source JobSpy project uses — at a human pace, with exponential
                back-off when LinkedIn says "slow down" instead of giving up.
                The guest job-detail page adds the TRUE employment type and the
                industry (used to drop recruitment agencies) at no cost.
    Indeed      via JobSpy (MIT, github.com/speedyapply/JobSpy), which talks to
                Indeed's mobile API. Gives employer website and headcount band —
                both free signals that replace Apollo company lookups.
    CareerJet   Official v4 API (free publisher key, CAREERJET_API_KEY). CareerJet
                aggregates IrishJobs.ie, Jobs.ie and other Irish boards.
    JobsIreland The Department of Social Protection's board; open HTML endpoint.
    Serper      Optional (SERPER_API_KEY): Google results used to find a company's
                website and "X-ray" LinkedIn profiles of founders / CTOs.

NOT SCRAPED, ON PURPOSE
    IrishJobs.ie and Jobs.ie (Akamai) and RecruitIreland (Cloudflare) refuse
    automated access outright — verified 20 Oct 2026, they deny even a normal
    browser session driven by an extension. Getting past those protections would
    mean defeating bot detection, which we don't do. Their listings reach us
    through CareerJet and Indeed.

    Logged-in LinkedIn scraping (e.g. joeyism/linkedin_scraper) is also not used:
    it needs a real account's session, which LinkedIn restricts for automation.
"""

from __future__ import annotations

import asyncio
import functools
import json
import logging
import os
import random
import re
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

log = logging.getLogger("hiring_sources")

# Scan work (HTML parsing, DNS, JobSpy) gets its own small pool so it can never starve the default
# executor that every Supabase call in server.py runs on.
SCAN_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="hiring-intel")


async def in_pool(fn: Callable[..., Any], *args: Any) -> Any:
    return await asyncio.get_running_loop().run_in_executor(SCAN_POOL, functools.partial(fn, *args))

LINKEDIN_BASE = "https://www.linkedin.com"
LINKEDIN_SEARCH_PATH = "/jobs-guest/jobs/api/seeMoreJobPostings/search"
LINKEDIN_DETAIL_PATH = "/jobs-guest/jobs/api/jobPosting/{job_id}"
LINKEDIN_IRELAND_GEO_ID = "104738515"
CAREERJET_URL = "https://search.api.careerjet.net/v4/query"
JOBSIRELAND_URL = "https://jobsireland.ie/Jobsireland.API/JobsIreland/BrowseJobs/43"
JOBSIRELAND_DETAIL = "https://jobsireland.ie/en-US/job-Details?id={job_id}"
SERPER_URL = "https://google.serper.dev/search"

BLOCKED_BOARDS = [
    {"name": "IrishJobs.ie", "reason": "Akamai bot protection denies automated access", "covered_by": "CareerJet, Indeed"},
    {"name": "Jobs.ie", "reason": "Akamai bot protection denies automated access", "covered_by": "CareerJet, Indeed"},
    {"name": "RecruitIreland", "reason": "Cloudflare challenge on every page", "covered_by": "CareerJet, Indeed"},
]


def proxies_from_env() -> List[str]:
    """SCRAPER_PROXIES="http://user:pass@host:port,http://..." — optional, rotated per request."""
    raw = os.environ.get("SCRAPER_PROXIES", "").strip()
    return [p.strip() for p in raw.split(",") if p.strip()]


def careerjet_key() -> str:
    return os.environ.get("CAREERJET_API_KEY", "").strip()


def serper_key() -> str:
    return os.environ.get("SERPER_API_KEY", "").strip()


def _ascii(s: Any) -> str:
    return unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()


def _clean(s: Any, limit: int = 300) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()[:limit]


@dataclass
class SourceResult:
    name: str
    status: str = "ok"                 # ok | partial | blocked | not_configured | error
    rows: List[Dict[str, Any]] = field(default_factory=list)
    requests: int = 0
    note: str = ""


# ════════════════════════════════════════════════════════════════════════
# LinkedIn — guest endpoints through a browser-grade TLS client
# ════════════════════════════════════════════════════════════════════════
def parse_linkedin_detail(html: str) -> Dict[str, Any]:
    """Job-criteria block of the guest job page: Seniority level / Employment type / Job function / Industries."""
    out: Dict[str, Any] = {}
    if not html:
        return out
    soup = BeautifulSoup(html, "html.parser")
    for item in soup.select(".description__job-criteria-item"):
        h = item.select_one(".description__job-criteria-subheader")
        v = item.select_one(".description__job-criteria-text")
        if h and v:
            out[_clean(h.get_text(" "), 60).lower()] = _clean(v.get_text(" "), 160)
    org = soup.select_one("a.topcard__org-name-link, .topcard__org-name-link")
    if org and org.get("href"):
        out["company_url"] = org["href"].split("?")[0]
    return {
        "employment_type": out.get("employment type", ""),
        "seniority": out.get("seniority level", ""),
        "industries": out.get("industries", ""),
        "job_function": out.get("job function", ""),
        "company_url": out.get("company_url", ""),
    }


Getter = Callable[[str, Dict[str, Any]], Awaitable[Tuple[int, str]]]


class LinkedInClient:
    """Paced guest client. One instance per scan; all calls share one pacing clock."""

    def __init__(self, *, getter: Optional[Getter] = None, proxies: Optional[List[str]] = None,
                 min_delay: float = 2.5, max_delay: float = 5.5, backoffs: Tuple[int, ...] = (30, 75, 150),
                 time_budget: float = 600.0, cancelled: Callable[[], bool] = lambda: False):
        self._getter = getter
        self._proxies = proxies or []
        self._session = None
        self.min_delay, self.max_delay = min_delay, max_delay
        self.backoffs = backoffs
        self.deadline = time.monotonic() + time_budget
        self.cancelled = cancelled
        self._next_at = 0.0
        self.requests = 0
        self.blocks = 0
        self.gave_up = False
        self.notes: List[str] = []

    async def _default_get(self, url: str, params: Dict[str, Any]) -> Tuple[int, str]:
        from curl_cffi.requests import AsyncSession          # imported lazily: optional at test time
        if self._session is None:
            self._session = AsyncSession(impersonate="chrome", timeout=20, headers={
                "Accept-Language": "en-IE,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            })
        kw: Dict[str, Any] = {"params": params}
        if self._proxies:
            p = random.choice(self._proxies)
            kw["proxies"] = {"http": p, "https": p}
        r = await self._session.get(url, **kw)
        return r.status_code, r.text

    async def close(self) -> None:
        if self._session is not None:
            try:
                await self._session.close()
            except Exception:
                pass

    async def _pace(self) -> None:
        wait = self._next_at - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        self._next_at = time.monotonic() + random.uniform(self.min_delay, self.max_delay)

    async def get(self, path: str, params: Dict[str, Any]) -> Tuple[str, str]:
        """Returns (state, body): state is ok | empty | blocked | error | budget."""
        url = LINKEDIN_BASE + path
        attempt = 0
        while True:
            if self.cancelled():
                return "budget", ""
            if self.gave_up or time.monotonic() > self.deadline:
                self.gave_up = True
                return "budget", ""
            await self._pace()
            try:
                status, body = await (self._getter or self._default_get)(url, params)
            except Exception as e:                       # network trouble: count as a soft block
                status, body = 0, ""
                log.debug(f"[linkedin] {type(e).__name__}: {e}")
            self.requests += 1
            if status == 200:
                return ("ok" if body.strip() else "empty"), body
            if status in (400, 404):
                return "empty", ""
            # 429 = slow down; 999 = LinkedIn's bot wall; 0 = network; 5xx = transient
            self.blocks += 1
            if attempt >= len(self.backoffs):
                self.gave_up = True
                self.notes.append(f"stopped after {self.requests} requests (HTTP {status})")
                return "blocked", ""
            pause = self.backoffs[attempt] * random.uniform(0.85, 1.25)
            if time.monotonic() + pause > self.deadline:
                self.gave_up = True
                self.notes.append(f"rate-limited near the time budget (HTTP {status})")
                return "blocked", ""
            self.notes.append(f"HTTP {status}: paused {int(pause)}s")
            self._next_at = time.monotonic() + pause
            attempt += 1


async def linkedin_search(client: LinkedInClient, keywords: List[str], days_back: int, *,
                          parse_cards: Callable[[str], List[Dict[str, Any]]], max_pages: int = 4,
                          on_progress: Optional[Callable[[float], None]] = None) -> SourceResult:
    """All employment types in one pass — the TRUE type comes from the detail page (LinkedIn's own
    f_JT filter is loose: a 'Contract' search returns full-time jobs)."""
    res = SourceResult("LinkedIn")
    seen: set = set()
    for i, kw in enumerate(keywords):
        start = 0
        for _page in range(max_pages):
            state, body = await client.get(LINKEDIN_SEARCH_PATH, {
                "keywords": kw, "location": "Ireland", "geoId": LINKEDIN_IRELAND_GEO_ID,
                "f_TPR": f"r{max(1, days_back) * 86400}", "sortBy": "DD", "start": start})
            if state != "ok":
                break
            cards = await in_pool(parse_cards, body)
            if not cards:
                break
            fresh = [c for c in cards if c.get("id") and c["id"] not in seen]
            for c in fresh:
                seen.add(c["id"])
                res.rows.append(c)
            start += len(cards)
            if not fresh or len(cards) < 10:
                break
        if on_progress:
            on_progress((i + 1) / max(1, len(keywords)))
        if client.gave_up:
            break
    res.requests = client.requests
    if client.gave_up and client.blocks:
        res.status = "partial" if res.rows else "blocked"
        res.note = "; ".join(client.notes[-3:])
    elif client.notes:
        res.note = "; ".join(client.notes[-3:])
    return res


async def linkedin_details(client: LinkedInClient, job_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for jid in job_ids:
        state, body = await client.get(LINKEDIN_DETAIL_PATH.format(job_id=jid), {})
        if state == "ok":
            out[jid] = await in_pool(parse_linkedin_detail, body)
        elif state in ("blocked", "budget"):
            break
    return out


# ════════════════════════════════════════════════════════════════════════
# Indeed — JobSpy (MIT) on Indeed's mobile API
# ════════════════════════════════════════════════════════════════════════
_HEADCOUNT_RE = re.compile(r"(\d[\d,]*)\s*(?:to|-|–)\s*(\d[\d,]*)|(\d[\d,]*)\s*\+|(?:less than|fewer than|under)\s*(\d[\d,]*)", re.I)


def parse_headcount_label(label: Any) -> Optional[Tuple[int, int]]:
    """'11 to 50' -> (11, 50); '10,000+' -> (10000, 10**9); 'Less than 10' -> (1, 9)."""
    s = _clean(label, 60)
    if not s:
        return None
    m = _HEADCOUNT_RE.search(s)
    if not m:
        n = re.fullmatch(r"\s*(\d[\d,]*)\s*", s)
        if n:
            v = int(n.group(1).replace(",", ""))
            return v, v
        return None
    if m.group(1):
        return int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))
    if m.group(3):
        return int(m.group(3).replace(",", "")), 10 ** 9
    return 1, max(1, int(m.group(4).replace(",", "")) - 1)


def _df_rows(df: Any) -> List[Dict[str, Any]]:
    if df is None:
        return []
    try:
        return [{k: (None if (isinstance(v, float) and v != v) else v) for k, v in r.items()}
                for r in df.to_dict(orient="records")]
    except Exception:
        return []


def indeed_search_sync(terms: List[str], days_back: int, results_per_term: int = 60,
                       proxies: Optional[List[str]] = None,
                       scrape: Optional[Callable[..., Any]] = None,
                       deadline: Optional[float] = None,
                       cancelled: Callable[[], bool] = lambda: False) -> SourceResult:
    """Blocking (JobSpy uses curl_cffi sync sessions) — run it in a worker thread.
    Stops between search terms once `deadline` (time.monotonic()) passes or the scan is cancelled,
    returning what it has, so an abandoned thread never keeps scraping for long."""
    res = SourceResult("Indeed")
    if scrape is None:
        try:
            from jobspy import scrape_jobs as scrape          # MIT — github.com/speedyapply/JobSpy
        except Exception as e:
            res.status, res.note = "error", f"JobSpy not installed: {e}"
            return res
    seen: set = set()
    failures = 0
    for term in terms:
        if cancelled():
            res.status, res.note = "partial", "cancelled"
            break
        if deadline is not None and time.monotonic() > deadline:
            res.status, res.note = "partial", "time limit reached"
            break
        try:
            # Indeed accepts only ONE of hours_old / job_type per search, so the type is read per row.
            df = scrape(site_name=["indeed"], search_term=term, location="Ireland", country_indeed="ireland",
                        hours_old=max(1, days_back) * 24, results_wanted=results_per_term,
                        description_format="markdown", verbose=0, proxies=proxies or None)
            res.requests += 1
        except Exception as e:
            failures += 1
            res.note = f"{type(e).__name__}: {str(e)[:140]}"
            if failures >= 2:
                break
            continue
        # JobSpy does NOT raise when Indeed blocks it: it returns an empty frame and puts the
        # error in df.attrs["errors"]. Treat that exactly like an exception.
        errs = (getattr(df, "attrs", None) or {}).get("errors") or {}
        if errs:
            failures += 1
            res.note = "; ".join(f"{k}: {str(v)[:120]}" for k, v in errs.items())
            if failures >= 2:
                break
            continue
        for r in _df_rows(df):
            key = r.get("id") or r.get("job_url")
            if not key or key in seen:
                continue
            seen.add(key)
            res.rows.append({
                "title": _clean(r.get("title"), 200),
                "company": _clean(r.get("company"), 160),
                "location": _clean(r.get("location"), 200),
                "url": r.get("job_url") or r.get("job_url_direct") or "",
                "url_direct": r.get("job_url_direct") or "",
                "posted_at": str(r.get("date_posted") or "")[:10] or None,
                "employment_raw": r.get("job_type") or "",
                "company_website": r.get("company_url_direct") or "",
                "headcount_label": r.get("company_num_employees") or "",
                "industry": r.get("company_industry") or "",
                "emails": r.get("emails") or "",
            })
    if failures and not res.rows:
        res.status = "blocked" if re.search(r"403|429|block|captcha|forbidden", res.note, re.I) else "error"
    elif failures and res.status == "ok":
        res.status = "partial"
    return res


# ════════════════════════════════════════════════════════════════════════
# CareerJet — official v4 API (aggregates IrishJobs.ie, Jobs.ie, ...)
# ════════════════════════════════════════════════════════════════════════
def _careerjet_date(v: Any) -> Optional[str]:
    s = _clean(v, 60)
    if not s:
        return None
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    if m:
        return m.group(1)
    try:
        return parsedate_to_datetime(s).date().isoformat()
    except Exception:
        return None


def parse_careerjet(data: Any) -> List[Dict[str, Any]]:
    if not isinstance(data, dict) or data.get("type") not in (None, "JOBS"):
        return []
    out = []
    for j in data.get("jobs") or []:
        if not isinstance(j, dict) or not j.get("title"):
            continue
        out.append({
            "title": _clean(j.get("title"), 200),
            "company": _clean(j.get("company"), 160),
            "location": _clean(j.get("locations"), 200),
            "url": j.get("url") or "",
            "posted_at": _careerjet_date(j.get("date")),
        })
    return out


async def careerjet_search(client: httpx.AsyncClient, terms: List[str], *, user_ip: str, user_agent: str,
                           contract_types: List[str], key: Optional[str] = None, pages: int = 2,
                           cancelled: Callable[[], bool] = lambda: False) -> SourceResult:
    res = SourceResult("CareerJet")
    key = key if key is not None else careerjet_key()
    if not key:
        res.status, res.note = "not_configured", "set CAREERJET_API_KEY (free publisher key)"
        return res
    locale, location = "en_IE", None
    for term in terms:
        for ct in contract_types:                     # p = permanent, c = contract
            for page in range(1, pages + 1):
                if cancelled():
                    return res
                params = {"keywords": term, "locale_code": locale, "contract_type": ct, "sort": "date",
                          "page": page, "page_size": 100, "fragment_size": 0,
                          "user_ip": user_ip or "127.0.0.1", "user_agent": user_agent or "Mozilla/5.0"}
                if location:
                    params["location"] = location
                try:
                    r = await client.get(CAREERJET_URL, params=params, auth=(key, ""))
                except httpx.HTTPError as e:
                    res.status, res.note = "partial" if res.rows else "error", type(e).__name__
                    return res
                res.requests += 1
                if r.status_code == 400 and "locale" in r.text.lower() and locale == "en_IE":
                    locale, location = "en_GB", "Ireland"      # en_IE not supported: search Ireland via en_GB
                    params.update({"locale_code": locale, "location": location})
                    r = await client.get(CAREERJET_URL, params=params, auth=(key, ""))
                    res.requests += 1
                if r.status_code in (401, 403):
                    res.status, res.note = "error", f"CareerJet refused the request (HTTP {r.status_code}) — check the key"
                    return res
                if r.status_code != 200:
                    res.status, res.note = "partial", f"HTTP {r.status_code}"
                    break
                try:
                    data = r.json()
                except Exception:
                    break
                for row in parse_careerjet(data):
                    row["type_hint"] = "Contract" if ct == "c" else "Permanent"
                    res.rows.append(row)
                if page >= int(data.get("pages") or 1):
                    break
    return res


# ════════════════════════════════════════════════════════════════════════
# JobsIreland.ie — server-rendered HTML fragment endpoint
# ════════════════════════════════════════════════════════════════════════
_PUBLISHED_RE = re.compile(r"Published On:\s*(\d{1,2}\s+\w{3,9}\s+\d{4})", re.I)


def _parse_day_month_year(s: str) -> Optional[str]:
    for fmt in ("%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


_PLACE_WORDS = re.compile(
    r"^(?:(?:unit|suite|floor|block|apartment|apt|no|number|co|county)\b|the\s+(?:old|new)\b|\d)", re.I)
# "Mahon Industrial Estate", "Grand Canal Quay" — streets and estates, not employers
_STREET_WORDS = re.compile(
    r"\b(?:road|rd|street|st|avenue|ave|lane|quay|square|place|court|drive|way|estate|"
    r"business\s+park|industrial\s+park|retail\s+park|technology\s+park|centre|center)\.?$", re.I)
_IRISH_PLACES = {
    "dublin", "cork", "galway", "limerick", "waterford", "kilkenny", "athlone", "sligo", "wexford", "carlow",
    "kildare", "meath", "wicklow", "louth", "kerry", "clare", "mayo", "tipperary", "donegal", "westmeath",
    "offaly", "laois", "cavan", "monaghan", "longford", "leitrim", "roscommon", "ireland", "remote",
    "sandyford", "swords", "tallaght", "blanchardstown", "dun laoghaire", "maynooth", "naas", "bray", "ennis",
    "letterkenny", "dundalk", "drogheda", "mullingar", "navan", "tralee", "castlebar", "shannon",
}


def _company_from_address(address: str) -> str:
    """First address segment that looks like an organisation — never 'Unit 4' or 'Dublin 18'."""
    for seg in [p.strip() for p in address.split(",")[:2]]:
        low = re.sub(r"\s+\d+\w?$", "", seg.lower()).strip()
        if not seg or _PLACE_WORDS.match(seg) or _STREET_WORDS.search(seg) or low in _IRISH_PLACES or re.search(r"\b[a-z]\d{2}\s?[a-z0-9]{4}\b", low):
            continue
        if len(seg) < 3 or not re.search(r"[A-Za-z]{3}", seg):
            continue
        return seg
    return ""


def parse_jobsireland(html: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not html:
        return out
    soup = BeautifulSoup(html, "html.parser")
    for box in soup.select(".job-detail-right-box"):
        title_box = box.select_one(".title-box")
        h3 = box.select_one("h3")
        if not h3 or not title_box:
            continue
        title = _clean(h3.get_text(" "), 250)
        if not title or title.startswith("#"):
            continue                                   # client-side template row
        m = re.search(r"gotoJobDetail\('?(\d+)'?\)", title_box.get("onclick") or "")
        job_id = m.group(1) if m else ""
        posted, address = None, ""
        for li in box.select("li"):
            img = li.find("img")
            alt = (img.get("alt") if img else "") or ""
            text = _clean(li.get_text(" "), 250)
            if "Publishing" in alt:
                pm = _PUBLISHED_RE.search(text)
                posted = _parse_day_month_year(pm.group(1)) if pm else None
            elif "Location" in alt:
                address = text
        # "Data Analyst - ACME LIMITED" (company in the title) or the first part of the address
        company = ""
        parts = [p.strip() for p in re.split(r"\s+[-–]\s+", title) if p.strip()]
        if len(parts) >= 2 and re.search(r"\b(limited|ltd|clg|dac|plc|teoranta|inc|llc|group)\b", parts[-1], re.I):
            company, title = parts[-1], " - ".join(parts[:-1])
        elif address:
            company = _company_from_address(address)
        out.append({
            "id": job_id, "title": title, "company": company, "location": address or "Ireland",
            "url": JOBSIRELAND_DETAIL.format(job_id=job_id) if job_id else "https://jobsireland.ie/",
            "posted_at": posted,
        })
    return out


async def jobsireland_search(fetch_text: Callable[[str, Dict[str, Any]], Awaitable[Tuple[int, str]]],
                             terms: List[str]) -> SourceResult:
    res = SourceResult("JobsIreland")
    seen: set = set()
    for term in terms:
        params = {"CareerlevelId": -1, "keyWord": term, "location": "", "page": 1, "pageSize": 100,
                  "VacancyTypeId": -1, "RemoteOrBlendedJobType": -1, "NaceCode": -1}
        try:
            status, body = await fetch_text(JOBSIRELAND_URL, params)
        except Exception as e:
            res.status, res.note = ("partial" if res.rows else "error"), type(e).__name__
            break
        res.requests += 1
        if status != 200:
            res.status, res.note = ("partial" if res.rows else "blocked"), f"HTTP {status}"
            break
        for row in await in_pool(parse_jobsireland, body):
            if row["id"] and row["id"] not in seen:
                seen.add(row["id"])
                res.rows.append(row)
        await asyncio.sleep(random.uniform(0.8, 1.6))
    return res


# ════════════════════════════════════════════════════════════════════════
# Serper (Google results) — company website + LinkedIn "X-ray" for founders
# ════════════════════════════════════════════════════════════════════════
_SKIP_DOMAINS = (
    "linkedin.", "indeed.", "glassdoor.", "irishjobs.", "jobs.ie", "careerjet.", "jooble.", "facebook.",
    "instagram.", "twitter.", "x.com", "youtube.", "wikipedia.", "crunchbase.", "bloomberg.", "zoominfo.",
    "rocketreach.", "apollo.io", "dnb.com", "solocheck.", "vision-net.", "companieshouse", "cro.ie",
    "google.", "tiktok.", "pitchbook.", "owler.", "craft.co", "theorg.com", "signalhire.", "lusha.",
)


async def serper_search(client: httpx.AsyncClient, query: str, key: Optional[str] = None,
                        num: int = 10) -> Tuple[str, List[Dict[str, Any]]]:
    key = key if key is not None else serper_key()
    if not key:
        return "not_configured", []
    try:
        r = await client.post(SERPER_URL, json={"q": query, "gl": "ie", "hl": "en", "num": num},
                              headers={"X-API-KEY": key, "Content-Type": "application/json"})
    except httpx.HTTPError as e:
        return f"error:{type(e).__name__}", []
    if r.status_code in (401, 403):
        return "auth", []
    if r.status_code == 429:
        return "rate_limited", []
    if r.status_code != 200:
        return f"error:HTTP {r.status_code}", []
    try:
        return "ok", list((r.json() or {}).get("organic") or [])
    except Exception:
        return "error:bad json", []


def pick_company_domain(organic: List[Dict[str, Any]], company_tokens: List[str]) -> str:
    """First organic result that isn't a directory / social site and mentions the company."""
    for o in organic[:8]:
        link = str(o.get("link") or "")
        host = (urlparse(link).hostname or "").lower()
        if host.startswith("www."):
            host = host[4:]
        if not host or any(s in host for s in _SKIP_DOMAINS):
            continue
        hay = _ascii(f"{o.get('title', '')} {host}").lower().replace("-", "")
        if all(t in hay for t in company_tokens[:2]):
            return host
    return ""


_XRAY_TITLE_RE = re.compile(r"^(?P<name>[^|\-–—]{3,60}?)\s*[-–—|]\s*(?P<rest>.+?)(?:\s*\|\s*LinkedIn.*)?$", re.I)


def parse_xray_result(o: Dict[str, Any], company_tokens: List[str]) -> Optional[Dict[str, Any]]:
    """'Jane Doe - CTO - Acme Analytics | LinkedIn' -> {name, title, linkedin_url}; None if it isn't this company."""
    link = str(o.get("link") or "")
    if not re.search(r"linkedin\.com/in/[^/?#]+", link, re.I):
        return None
    title = _clean(o.get("title"), 200)
    m = _XRAY_TITLE_RE.match(title)
    if not m:
        return None
    name = _clean(m.group("name"), 80)
    rest = _clean(m.group("rest"), 160)
    # The headline is the CURRENT role; a snippet mention can be an ex-employee or an investor.
    hay = _ascii(rest).lower()
    if not all(t in hay for t in company_tokens[:2]):
        return None
    if not NAME_RE.fullmatch(name):
        return None
    role = re.split(r"\s+(?:at|@)\s+|\s+[-–—]\s+", rest)[0]
    return {"name": name, "title": _clean(role, 120), "linkedin_url": link.split("?")[0], "source": "LinkedIn search"}


# ════════════════════════════════════════════════════════════════════════
# Company website — domain guessing and "team" page people extraction
# ════════════════════════════════════════════════════════════════════════
_TLDS = ("ie", "com", "io", "ai")


def domain_candidates(company_tokens: List[str]) -> List[str]:
    """acme analytics -> acmeanalytics.ie, acmeanalytics.com, acme-analytics.ie, ... (max 8)."""
    toks = [t for t in company_tokens if t and t not in ("and", "the", "of")][:3]
    if not toks:
        return []
    bases = ["".join(toks)]
    if len(toks) > 1:
        bases.append("-".join(toks))
    out: List[str] = []
    for b in bases:
        if len(b) < 3:
            continue
        for tld in _TLDS:
            out.append(f"{b}.{tld}")
    return out[:8]


_PARKED = re.compile(r"domain (?:is )?for sale|buy this domain|parked free|godaddy|sedo|hugedomains|this domain may be for sale", re.I)


_IRISH_HINT = re.compile(r"\b(?:ireland|irish|dublin|cork|galway|limerick|waterford|\.ie\b|\+353)", re.I)


def page_matches_company(html: str, company_tokens: List[str], host: str = "") -> bool:
    """The guessed site must really be this company: name in <title>/og tags, and for a one-word
    name (common words collide across countries) the site must be .ie or mention Ireland."""
    if not html or _PARKED.search(html[:20000]):
        return False
    toks = [t for t in company_tokens if t][:2]
    if len(toks) == 1 and not host.endswith(".ie") and not _IRISH_HINT.search(html[:300000]):
        return False
    soup = BeautifulSoup(html[:200000], "html.parser")
    bits = [soup.title.get_text(" ") if soup.title else ""]
    for sel in ('meta[property="og:site_name"]', 'meta[property="og:title"]', 'meta[name="application-name"]'):
        m = soup.select_one(sel)
        if m and m.get("content"):
            bits.append(m["content"])
    hay = _ascii(" ".join(bits)).lower().replace("-", " ")
    joined = hay.replace(" ", "")
    if not toks:
        return False
    return all(t in hay for t in toks) or "".join(toks) in joined


_TEAM_LINK = re.compile(r"about|team|leadership|people|founder|management|who-we-are|our-story|company", re.I)
NAME_RE = re.compile(
    r"(?:Dr\.?\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’\-]+(?:\s+(?:(?:Mc|Mac|O['’])?[A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ'’\-]+|de|van|von|da|di)){1,3}")
_ICP_HINT = re.compile(
    r"\b(?:ceo|cto|coo|cdo|chief\s+\w+(?:\s+\w+)?\s+officer|founder|co[\s-]?founder|managing\s+director|"
    r"(?:head|director|vp|vice\s+president)\s+(?:of\s+)?(?:data|analytics|ai|engineering|technology|machine\s+learning))\b", re.I)
_NOT_A_NAME = re.compile(
    r"\b(?:our|team|meet|about|contact|read|more|view|profile|ltd|limited|company|services|solutions|careers|"
    r"news|blog|home|privacy|cookie|data|analytics|founder|ceo|cto|officer|director|head|ireland|dublin|"
    r"linkedin|twitter|email|learn|join|leadership|management|board|advisors?)\b", re.I)


def find_team_links(html: str, base_url: str) -> List[str]:
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    base_host = (urlparse(base_url).hostname or "").lower().removeprefix("www.")
    links: List[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        text = _clean(a.get_text(" "), 60)
        if not (_TEAM_LINK.search(href) or _TEAM_LINK.search(text)):
            continue
        if re.search(r"privacy|cookie|terms|career|job|vacanc|blog|news|contact", href, re.I):
            continue
        u = urljoin(base_url, href).split("#")[0]
        host = (urlparse(u).hostname or "").lower().removeprefix("www.")
        if u.startswith("http") and host == base_host and u not in links and u.rstrip("/") != base_url.rstrip("/"):
            links.append(u)
    return links[:3]


def extract_people(html: str) -> List[Dict[str, Any]]:
    """Founders / execs named on a company page: JSON-LD Person/founder data plus visible name+title cards."""
    out: List[Dict[str, Any]] = []
    if not html:
        return out
    seen: set = set()

    def add(name: str, title: str, li: str = "") -> None:
        name, title = _clean(name, 80), _clean(title, 120)
        if not name or not title or not NAME_RE.fullmatch(name) or _NOT_A_NAME.search(name):
            return
        if not _ICP_HINT.search(title):
            return
        k = name.lower()
        if k in seen:
            return
        seen.add(k)
        out.append({"name": name, "title": title, "linkedin_url": li, "source": "Company website"})

    # 1) JSON-LD
    for m in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
            for k in ("@graph", "founder", "founders", "employee", "employees", "member"):
                v = node.get(k)
                if isinstance(v, (list, dict)):
                    stack.extend(v if isinstance(v, list) else [v])
            t = node.get("@type")
            if (t == "Person" or (isinstance(t, list) and "Person" in t)) and node.get("name"):
                same = node.get("sameAs") or []
                same = same if isinstance(same, list) else [same]
                li = next((s for s in same if "linkedin.com/in/" in str(s)), "")
                add(str(node.get("name")), str(node.get("jobTitle") or "Founder"), str(li))

    # 2) Visible cards: a short block holding both a name and an exec title
    soup = BeautifulSoup(html[:1_500_000], "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer"]):
        tag.decompose()
    for text_node in soup.find_all(string=_ICP_HINT):
        title_text = _clean(text_node, 120)
        if len(title_text) > 90:
            continue
        container = text_node.parent
        for _ in range(3):
            if container is None:
                break
            segments = [s for s in (_clean(x, 100) for x in container.stripped_strings) if s]
            if 2 <= len(segments) <= 10:
                names = [s for s in segments if s != title_text and NAME_RE.fullmatch(s) and not _NOT_A_NAME.search(s)]
                if names:
                    li_a = container.find("a", href=re.compile(r"linkedin\.com/in/", re.I))
                    add(names[0], title_text, li_a["href"].split("?")[0] if li_a else "")
                    break
            container = container.parent
    return out[:12]
