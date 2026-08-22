"""
integrations.py — CloudTalk + Apollo, read-only metric sync.

DESIGN RULES (deliberate, please keep them):

1. READ-ONLY. Nothing here writes to CloudTalk or Apollo. Both hold live
   customer data and Apollo spends credits on writes. A sync bug should never
   be able to mutate a sequence or delete a contact.

2. NEVER RAISES INTO A REQUEST. Every public function returns a structured
   result. A missing key, a 429, or a vendor outage degrades the dashboard to
   "not configured" / "stale" — it never 500s the CRM.

3. SECRETS NEVER LOGGED. _redact() scrubs any key material before a message
   reaches a log line or an HTTP response.

4. IDEMPOTENT. Writes go through the existing uq_integration_metric unique
   index (source, metric_date, metric_key, COALESCE(dimension,'')). Re-running
   a sync for the same day overwrites rather than duplicates, so a retry after
   a partial failure is always safe.

5. NO NEW TABLES. Uses integration_metrics, created in the Batch A migration.

Env vars (HuggingFace Space secrets — see INTEGRATIONS_SETUP.md):
    APOLLO_API_KEY
    CLOUDTALK_API_KEY_ID
    CLOUDTALK_API_KEY_SECRET
"""

import os
import base64
import logging
import asyncio
from datetime import date, timedelta, datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger(__name__)

APOLLO_BASE    = "https://api.apollo.io/api/v1"
CLOUDTALK_BASE = "https://my.cloudtalk.io/api"

_TIMEOUT   = httpx.Timeout(20.0, connect=10.0)
_MAX_RETRY = 3
_PAGE_CAP  = 50          # hard stop: 50 pages x 250 = 12,500 records per sync


# ── helpers ──────────────────────────────────────────────────

def _redact(msg: Any) -> str:
    """Strip anything key-shaped out of a message before it is logged."""
    s = str(msg)
    for var in ("APOLLO_API_KEY", "CLOUDTALK_API_KEY_ID", "CLOUDTALK_API_KEY_SECRET"):
        val = os.environ.get(var)
        if val and len(val) > 6:
            s = s.replace(val, f"<{var}>")
    return s[:400]


def apollo_configured() -> bool:
    return bool(os.environ.get("APOLLO_API_KEY"))


def cloudtalk_configured() -> bool:
    return bool(os.environ.get("CLOUDTALK_API_KEY_ID")
                and os.environ.get("CLOUDTALK_API_KEY_SECRET"))


def _cloudtalk_auth_header() -> str:
    raw = f"{os.environ['CLOUDTALK_API_KEY_ID']}:{os.environ['CLOUDTALK_API_KEY_SECRET']}"
    return "Basic " + base64.b64encode(raw.encode()).decode()


async def _request(client: httpx.AsyncClient, method: str, url: str, **kw) -> Dict[str, Any]:
    """One HTTP call with backoff on 429 and 5xx.

    Apollo returns its budget on every response (x-minute-requests-left etc).
    We honour Retry-After when present, else exponential backoff. Returns a
    dict: {"ok": bool, "data": ..., "error": str, "rate": {...}}
    """
    delay = 1.0
    for attempt in range(_MAX_RETRY):
        try:
            r = await client.request(method, url, **kw)
        except (httpx.TimeoutException, httpx.TransportError) as e:
            if attempt == _MAX_RETRY - 1:
                return {"ok": False, "error": f"network: {_redact(e)}"}
            await asyncio.sleep(delay); delay *= 2
            continue

        rate = {k: v for k, v in r.headers.items() if k.lower().startswith("x-rate-limit")
                or k.lower().startswith("x-minute-") or k.lower().startswith("x-daily-")}

        if r.status_code == 429 or r.status_code >= 500:
            if attempt == _MAX_RETRY - 1:
                return {"ok": False, "error": f"HTTP {r.status_code}", "rate": rate}
            wait = float(r.headers.get("Retry-After") or delay)
            await asyncio.sleep(min(wait, 30)); delay *= 2
            continue

        if r.status_code == 401 or r.status_code == 403:
            # Do NOT retry auth failures — a wrong key will never come right,
            # and hammering the endpoint can get the key throttled.
            return {"ok": False, "error": f"auth failed (HTTP {r.status_code}) — check the key",
                    "rate": rate}

        if r.status_code >= 400:
            return {"ok": False, "error": f"HTTP {r.status_code}: {_redact(r.text)}", "rate": rate}

        try:
            return {"ok": True, "data": r.json(), "rate": rate}
        except Exception as e:
            return {"ok": False, "error": f"bad JSON: {_redact(e)}", "rate": rate}

    return {"ok": False, "error": "retries exhausted"}


# ── connectivity checks ──────────────────────────────────────

async def check_apollo() -> Dict[str, Any]:
    """GET /auth/health — free, consumes no credits."""
    if not apollo_configured():
        return {"configured": False, "ok": False, "detail": "APOLLO_API_KEY not set"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        res = await _request(c, "GET", f"{APOLLO_BASE}/auth/health",
                             headers={"x-api-key": os.environ["APOLLO_API_KEY"],
                                      "Content-Type": "application/json"})
    if not res["ok"]:
        return {"configured": True, "ok": False, "detail": res["error"]}
    logged_in = bool((res["data"] or {}).get("is_logged_in"))
    return {"configured": True, "ok": logged_in,
            "detail": "connected" if logged_in else "key rejected",
            "rate": res.get("rate", {})}


async def check_cloudtalk() -> Dict[str, Any]:
    """Smallest possible authenticated call — one agent record."""
    if not cloudtalk_configured():
        return {"configured": False, "ok": False,
                "detail": "CLOUDTALK_API_KEY_ID / _SECRET not set"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        res = await _request(c, "GET", f"{CLOUDTALK_BASE}/agents/index.json",
                             params={"limit": 1},
                             headers={"Authorization": _cloudtalk_auth_header()})
    if not res["ok"]:
        return {"configured": True, "ok": False, "detail": res["error"]}
    return {"configured": True, "ok": True, "detail": "connected"}


# ── CloudTalk ────────────────────────────────────────────────

async def _cloudtalk_calls(day: date) -> Dict[str, Any]:
    """Page through /calls/index.json for one day.

    Confirmed shape (verified via direct API call 2026-08-20): CloudTalk wraps
    everything as {responseData: {itemsCount, pageCount, pageNumber, limit,
    data: [...]}}. Each item is {Cdr, CallNumber, Agent, Contact, Ratings,
    BillingCall, Notes, Tags} — verified 2026-08-21.

    CloudTalk's date_from == date_to filter returns itemsCount: 0 even for a
    day with confirmed real calls (verified 2026-08-21: a call with
    started_at on 2026-08-19 was invisible to a date_from=19/date_to=19
    query, but present in a wider-range query). So we query a 3-day window
    centred on `day` and filter precisely by each call's own started_at date
    instead of trusting CloudTalk's day-boundary filtering.
    """
    out: List[Dict[str, Any]] = []
    headers = {"Authorization": _cloudtalk_auth_header()}
    query_from = day - timedelta(days=1)
    query_to   = day + timedelta(days=1)
    target     = day.isoformat()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        page = 1
        fetched = 0
        while page <= _PAGE_CAP:
            res = await _request(c, "GET", f"{CLOUDTALK_BASE}/calls/index.json",
                                 params={"date_from": query_from.isoformat(),
                                         "date_to":   query_to.isoformat(),
                                         "limit": 250, "page": page},
                                 headers=headers)
            if not res["ok"]:
                return {"ok": False, "error": res["error"], "rows": out}

            body  = (res["data"] or {}).get("responseData") or {}
            items = body.get("data") or []
            if not items:
                break
            fetched += len(items)

            for it in items:
                if not isinstance(it, dict):
                    continue
                cdr = it.get("Cdr") or {}
                started = str(cdr.get("started_at") or "")
                if started[:10] != target:
                    continue  # belongs to the day before/after our target
                out.append(it)  # keep Cdr + Agent + Contact + Notes + Tags together

            total = body.get("itemsCount")
            if total is not None and fetched >= int(total):
                break
            if len(items) < 250:
                break
            page += 1

    return {"ok": True, "rows": out}


async def _cloudtalk_calls_range(start_day: date, end_day: date) -> Dict[str, Any]:
    """Page through /calls/index.json ONCE for a whole date range, then
    bucket each call by its own started_at date.

    This replaces calling _cloudtalk_calls() once per day when backfilling a
    range. That looped approach cost one CloudTalk request (page) per day
    AND re-downloaded most days' calls up to 3x each, since every day's
    1-day-before/1-day-after window overlaps its neighbours' windows. A
    single range fetch dodges the date_from==date_to zero-width bug by
    construction (a multi-day range is never zero-width) and cuts a 30-day
    backfill from ~30 requests down to however many 250-per-page pages the
    account's real call volume needs — usually 1-2.
    """
    by_day: Dict[str, List[Dict[str, Any]]] = {}
    headers = {"Authorization": _cloudtalk_auth_header()}
    # Small buffer on both ends, purely as a timezone safety margin — every
    # call is still bucketed precisely by its own started_at date below, so
    # a wider fetch window can never leak a call into the wrong day.
    query_from = start_day - timedelta(days=1)
    query_to   = end_day + timedelta(days=1)
    lo, hi     = start_day.isoformat(), end_day.isoformat()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        page = 1
        fetched = 0
        while page <= _PAGE_CAP:
            res = await _request(c, "GET", f"{CLOUDTALK_BASE}/calls/index.json",
                                 params={"date_from": query_from.isoformat(),
                                         "date_to":   query_to.isoformat(),
                                         "limit": 250, "page": page},
                                 headers=headers)
            if not res["ok"]:
                return {"ok": False, "error": res["error"], "by_day": by_day}

            body  = (res["data"] or {}).get("responseData") or {}
            items = body.get("data") or []
            if not items:
                break
            fetched += len(items)

            for it in items:
                if not isinstance(it, dict):
                    continue
                cdr = it.get("Cdr") or {}
                started = str(cdr.get("started_at") or "")[:10]
                if not (lo <= started <= hi):
                    continue  # part of the timezone buffer, not the requested range
                by_day.setdefault(started, []).append(it)

            total = body.get("itemsCount")
            if total is not None and fetched >= int(total):
                break
            if len(items) < 250:
                break
            page += 1

    return {"ok": True, "by_day": by_day}


# Known synonym groups for CloudTalk's free-text disposition notes. Keys are
# canonical display labels; values are raw variants (matched case- and
# whitespace-insensitively) that collapse into that label. Deliberately
# conservative — only exact-phrase matches from this table collapse, so a
# long free-text remark (e.g. "Send An Email ---------- **Email
# Requested**...") is left exactly as typed rather than risking a wrong merge.
# "Not Received- Disconnected" and "Hung Up" are deliberately NOT merged here
# — one means the call never connected, the other means it connected and was
# then hung up on. Different outcomes, kept separate on purpose.
_DISPOSITION_CANON: Dict[str, List[str]] = {
    "Voicemail": [
        "vm", "vm again", "v.m.", "v/m", "voicemail", "voice mail",
        "left voicemail", "went to voicemail", "vm left",
    ],
    "Do Not Call": [
        "take me off your list", "remove the number", "remove my number",
        "do not call", "dnc",
    ],
}
_DISPOSITION_LOOKUP: Dict[str, str] = {
    variant: canon
    for canon, variants in _DISPOSITION_CANON.items()
    for variant in variants
}


def _normalize_disposition(raw: str):
    """Collapse case/whitespace duplicates and known synonyms onto one label.

    Returns (group_key, display_label):
      group_key     — lower-cased, whitespace-collapsed. Used to bucket counts
                       so 'VM' / 'Vm' / 'VM Again' / 'Voicemail' all land in
                       the same total no matter how the agent typed it, and
                       so any future casing-only dupe ('Not fit' vs 'not FIT')
                       collapses automatically even without a curated entry.
      display_label — the curated canonical name when the phrase is
                       recognised, otherwise the original text with only
                       whitespace collapsed (first-seen casing wins for
                       uncurated dupes).

    group_key == "voicemail" is also what _summarise_cloudtalk uses to decide
    a call should NOT be counted as answered — see below.
    """
    text = " ".join((raw or "").split())
    if not text:
        return "", ""
    lowered = text.lower()
    canon = _DISPOSITION_LOOKUP.get(lowered)
    if canon:
        return canon.lower(), canon
    return lowered, text


def _summarise_cloudtalk(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Roll raw CDRs into the metrics the desk actually reviews.

    Field names verified against a live sample 2026-08-21:
    Cdr.talking_time / Cdr.billsec (duration, seconds), Cdr.waiting_time,
    Cdr.answered_at, Cdr.type (incoming/outgoing), Agent.fullname,
    Notes[].note, Tags[].name (call-level tags, distinct from Contact.tags).

    The dispositions mirror what the team currently types by hand into the
    'Remarks' column of the call-cadence spreadsheet (VM, Gatekeeper, Not fit,
    Hung Up...). Surfacing them automatically is the point of this integration.

    A call disposed as Voicemail is never counted as answered, even if
    CloudTalk's own answered_at/duration fields say otherwise — the voicemail
    system picking up isn't a human answering. It gets its own calls_voicemail
    bucket instead, and its duration is excluded from talk time so avg_talk_sec
    reflects real conversations, not voicemail greetings.
    """
    metrics: List[Dict[str, Any]] = []
    total = len(rows)
    answered = missed = voicemail = 0
    talk = waiting = 0.0
    by_agent: Dict[str, Dict[str, float]] = {}
    by_disp:  Dict[str, Dict[str, Any]] = {}
    by_type:  Dict[str, int] = {}

    for r in rows:
        cdr = r.get("Cdr") or {}
        dur  = float(cdr.get("talking_time") or cdr.get("billsec") or 0)
        wait = float(cdr.get("waiting_time") or 0)

        notes = r.get("Notes") or []
        tags  = r.get("Tags") or []
        disp = ""
        if notes and isinstance(notes[0], dict):
            disp = (notes[0].get("note") or "").strip()
        if not disp and tags and isinstance(tags[0], dict):
            disp = (tags[0].get("name") or "").strip()
        disp_key, disp_label = _normalize_disposition(disp)
        is_voicemail = disp_key == "voicemail"

        is_ans_raw = dur > 0 or bool(cdr.get("answered_at"))
        is_ans = is_ans_raw and not is_voicemail

        if is_voicemail:
            voicemail += 1
        elif is_ans:
            answered += 1
        else:
            missed += 1

        if not is_voicemail:
            talk += dur   # exclude voicemail-greeting duration from talk time
        waiting += wait

        call_type = str(cdr.get("type") or "unknown").strip().lower()
        by_type[call_type] = by_type.get(call_type, 0) + 1

        agent_obj = r.get("Agent") or {}
        agent = (agent_obj.get("fullname") or "Unassigned").strip() or "Unassigned"
        a = by_agent.setdefault(agent, {"calls": 0, "answered": 0, "talk": 0.0})
        a["calls"] += 1
        a["answered"] += 1 if is_ans else 0
        a["talk"] += dur if not is_voicemail else 0

        if disp_key:
            entry = by_disp.setdefault(disp_key, {"label": disp_label, "count": 0})
            entry["count"] += 1

    metrics.append({"metric_key": "calls_total",      "metric_value": total})
    metrics.append({"metric_key": "calls_answered",   "metric_value": answered})
    metrics.append({"metric_key": "calls_voicemail",  "metric_value": voicemail})
    metrics.append({"metric_key": "calls_missed",     "metric_value": missed})
    metrics.append({"metric_key": "talk_time_sec",    "metric_value": round(talk)})
    metrics.append({"metric_key": "waiting_time_sec", "metric_value": round(waiting)})
    metrics.append({"metric_key": "answer_rate",
                    "metric_value": round(answered / total * 100, 1) if total else 0})
    metrics.append({"metric_key": "avg_talk_sec",
                    "metric_value": round(talk / answered) if answered else 0})
    metrics.append({"metric_key": "avg_waiting_sec",
                    "metric_value": round(waiting / total) if total else 0})

    for agent, v in by_agent.items():
        metrics.append({"metric_key": "calls_total",    "dimension": agent, "metric_value": v["calls"]})
        metrics.append({"metric_key": "calls_answered", "dimension": agent, "metric_value": v["answered"]})
        metrics.append({"metric_key": "talk_time_sec",  "dimension": agent, "metric_value": round(v["talk"])})

    for entry in by_disp.values():
        metrics.append({"metric_key": "disposition", "dimension": entry["label"], "metric_value": entry["count"]})

    for t, n in by_type.items():
        metrics.append({"metric_key": "call_type", "dimension": t, "metric_value": n})

    return metrics


# ── Apollo ───────────────────────────────────────────────────

async def _apollo_sequences() -> Dict[str, Any]:
    """POST /emailer_campaigns/search — sequence-level stats.

    Apollo charges credits for enrichment endpoints but not for reading your
    own sequence stats, which is why this integration reads sequences rather
    than enriching contacts. Enrichment stays a manual, deliberate action.
    """
    out: List[Dict[str, Any]] = []
    headers = {"x-api-key": os.environ["APOLLO_API_KEY"],
               "Content-Type": "application/json",
               "Cache-Control": "no-cache"}
    rate: Dict[str, str] = {}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        page = 1
        while page <= _PAGE_CAP:
            res = await _request(c, "POST", f"{APOLLO_BASE}/emailer_campaigns/search",
                                 json={"page": page, "per_page": 100}, headers=headers)
            if not res["ok"]:
                return {"ok": False, "error": res["error"], "rows": out, "rate": res.get("rate", {})}
            rate = res.get("rate", rate)
            data = res["data"] or {}
            items = data.get("emailer_campaigns") or []
            if not items:
                break
            out.extend(i for i in items if isinstance(i, dict))

            pg = data.get("pagination") or {}
            if page >= int(pg.get("total_pages") or 1):
                break
            page += 1

    return {"ok": True, "rows": out, "rate": rate}


def _summarise_apollo(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sequence stats, plus derived rates the raw payload does not give you."""
    metrics: List[Dict[str, Any]] = []
    tot = {"sent": 0, "opened": 0, "replied": 0, "bounced": 0, "active": 0}

    for s in rows:
        name = (s.get("name") or "Untitled").strip()[:120]
        sent    = int(s.get("unique_delivered")  or s.get("num_total_emails_sent") or s.get("emails_sent")   or 0)
        opened  = int(s.get("unique_opened")     or s.get("opened_count")                                    or 0)
        replied = int(s.get("unique_replied")    or s.get("replied_count")                                   or 0)
        bounced = int(s.get("unique_bounced")    or s.get("bounced")               or s.get("bounced_count") or 0)
        active  = int(s.get("num_contacts")      or s.get("active_contacts")                                 or 0)

        tot["sent"] += sent; tot["opened"] += opened
        tot["replied"] += replied; tot["bounced"] += bounced; tot["active"] += active

        metrics += [
            {"metric_key": "emails_sent",     "dimension": name, "metric_value": sent},
            {"metric_key": "emails_opened",   "dimension": name, "metric_value": opened},
            {"metric_key": "emails_replied",  "dimension": name, "metric_value": replied},
            {"metric_key": "contacts_active", "dimension": name, "metric_value": active},
        ]

    metrics += [
        {"metric_key": "emails_sent",     "metric_value": tot["sent"]},
        {"metric_key": "emails_opened",   "metric_value": tot["opened"]},
        {"metric_key": "emails_replied",  "metric_value": tot["replied"]},
        {"metric_key": "emails_bounced",  "metric_value": tot["bounced"]},
        {"metric_key": "contacts_active", "metric_value": tot["active"]},
        {"metric_key": "sequences_count", "metric_value": len(rows)},
        {"metric_key": "open_rate",
         "metric_value": round(tot["opened"] / tot["sent"] * 100, 1) if tot["sent"] else 0},
        {"metric_key": "reply_rate",
         "metric_value": round(tot["replied"] / tot["sent"] * 100, 1) if tot["sent"] else 0},
        {"metric_key": "bounce_rate",
         "metric_value": round(tot["bounced"] / tot["sent"] * 100, 1) if tot["sent"] else 0},
    ]
    return metrics


# ── Apollo — real per-message activity (replaces the old snapshot-only path
#    for everything EXCEPT sequences_count/contacts_active, which have no
#    per-day equivalent) ──────────────────────────────────────────

_APOLLO_MSG_PAGE_CAP = 50   # hard stop: 50 pages x 100 = 5,000 messages per query, per sync


async def _apollo_messages_page(client: httpx.AsyncClient, params: Dict[str, str]) -> Dict[str, Any]:
    """One paginated fetch of /emailer_messages/search for a given filter set.

    No total-count field exists on this endpoint — confirmed against a live
    sample 2026-08-21: `num_fetch_result` is null and there is no
    `pagination` block (unlike /emailer_campaigns/search). So we page until a
    page comes back shorter than per_page, same stopping rule already used
    for CloudTalk's pagination.
    """
    out: List[Dict[str, Any]] = []
    headers = {"x-api-key": os.environ["APOLLO_API_KEY"], "Content-Type": "application/json"}
    page = 1
    while page <= _APOLLO_MSG_PAGE_CAP:
        res = await _request(client, "GET", f"{APOLLO_BASE}/emailer_messages/search",
                             params={**params, "page": page, "per_page": 100}, headers=headers)
        if not res["ok"]:
            return {"ok": False, "error": res["error"], "rows": out}
        items = (res["data"] or {}).get("emailer_messages") or []
        out.extend(i for i in items if isinstance(i, dict))
        if len(items) < 100:
            break
        page += 1
    return {"ok": True, "rows": out}


async def _apollo_messages_range(start_day: date, end_day: date) -> Dict[str, Any]:
    """Real per-day Apollo email activity for [start_day, end_day].

    Four independent queries against /emailer_messages/search, run
    CONCURRENTLY via asyncio.gather — one round trip's latency covers all
    four instead of four in series, which matters once a 90-day/custom range
    means each query may need to page.

      1. No stats filter, completed_at in range — every message that
         finished sending in the window. Delivered/Bounced/Replied are read
         straight off each message's own bounce/spam_blocked/replied fields;
         each is bucketed by ITS OWN completed_at date — this is what fixes
         "everything lands on the sync day", since every message carries its
         own real send date instead of one shared snapshot value.
      2. stats=drafted, due_at in range   — Drafted, bucketed by due_at
         (drafted messages never get a completed_at, confirmed 2026-08-21)
      3. stats=failed_other, due_at in range — Not Sent, bucketed by due_at
      4. stats=opened, completed_at in range — Opened count only. No raw
         "opened" field is exposed on the message object itself (confirmed
         against a live sample 2026-08-21), so this has to be its own
         filtered count rather than something read off query #1's rows.
    """
    if not apollo_configured():
        return {"ok": False, "error": "not configured"}

    lo, hi = start_day.isoformat(), end_day.isoformat()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        sent_fut = _apollo_messages_page(c, {
            "emailer_message_date_range_mode": "completed_at",
            "emailer_message_date_range[min]": lo,
            "emailer_message_date_range[max]": hi,
        })
        drafted_fut = _apollo_messages_page(c, {
            "emailer_message_stats[]": "drafted",
            "emailer_message_date_range_mode": "due_at",
            "emailer_message_date_range[min]": lo,
            "emailer_message_date_range[max]": hi,
        })
        not_sent_fut = _apollo_messages_page(c, {
            "emailer_message_stats[]": "failed_other",
            "emailer_message_date_range_mode": "due_at",
            "emailer_message_date_range[min]": lo,
            "emailer_message_date_range[max]": hi,
        })
        opened_fut = _apollo_messages_page(c, {
            "emailer_message_stats[]": "opened",
            "emailer_message_date_range_mode": "completed_at",
            "emailer_message_date_range[min]": lo,
            "emailer_message_date_range[max]": hi,
        })
        sent, drafted, not_sent, opened = await asyncio.gather(
            sent_fut, drafted_fut, not_sent_fut, opened_fut
        )

    for label, res in (("sent", sent), ("drafted", drafted),
                       ("not_sent", not_sent), ("opened", opened)):
        if not res["ok"]:
            return {"ok": False, "error": f"{label} query: {res['error']}"}

    return {"ok": True, "sent_rows": sent["rows"], "drafted_rows": drafted["rows"],
            "not_sent_rows": not_sent["rows"], "opened_count": len(opened["rows"])}


def _summarise_apollo_messages(res: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Turn the four raw fetches from _apollo_messages_range into day-bucketed
    counts. Uses the SAME metric_key names the dashboard already reads
    (emails_sent, emails_delivered, emails_bounced, emails_replied) — only
    the data SOURCE changes (real per-message dates instead of one repeated
    cumulative snapshot), so existing chart wiring needs no key changes.
    """
    by_day: Dict[str, Dict[str, int]] = {}

    def bump(day: str, key: str) -> None:
        if not day:
            return
        by_day.setdefault(day, {})
        by_day[day][key] = by_day[day].get(key, 0) + 1

    for m in res["sent_rows"]:
        day = str(m.get("completed_at") or "")[:10]
        if not day:
            continue
        bounced = bool(m.get("bounce"))
        spam    = bool(m.get("spam_blocked"))
        bump(day, "emails_sent")
        if bounced:
            bump(day, "emails_bounced")
        elif spam:
            bump(day, "emails_spam_blocked")
        else:
            bump(day, "emails_delivered")
        if m.get("replied"):
            bump(day, "emails_replied")

    for m in res["drafted_rows"]:
        bump(str(m.get("due_at") or m.get("created_at") or "")[:10], "emails_drafted")

    for m in res["not_sent_rows"]:
        bump(str(m.get("due_at") or m.get("created_at") or "")[:10], "emails_not_sent")

    totals: Dict[str, int] = {}
    for day_metrics in by_day.values():
        for k, v in day_metrics.items():
            totals[k] = totals.get(k, 0) + v
    totals["emails_opened"] = res["opened_count"]

    return {"by_day": by_day, "totals": totals}


async def sync_apollo_range(sb_fn, run_fn, start_day: date, end_day: date) -> Dict[str, Any]:
    """Real per-day Apollo backfill — see _apollo_messages_range.

    sequences_count/contacts_active have no per-day equivalent (Apollo's
    sequence endpoint is still a live snapshot), so they're merged into
    end_day's row only — combined into ONE _store() call for that day, since
    _store() deletes-then-inserts the WHOLE day for a source; calling it
    twice for the same day would let the second call wipe the first.
    """
    if not apollo_configured():
        return {"source": "apollo", "ok": False, "skipped": True, "detail": "not configured",
                "from": start_day.isoformat(), "to": end_day.isoformat()}
    try:
        msg_res = await _apollo_messages_range(start_day, end_day)
        if not msg_res["ok"]:
            return {"source": "apollo", "ok": False, "detail": msg_res["error"],
                    "from": start_day.isoformat(), "to": end_day.isoformat()}
        summary = _summarise_apollo_messages(msg_res)

        seq_res = await _apollo_sequences()
        seq_snapshot = ([m for m in _summarise_apollo(seq_res["rows"])
                        if m["metric_key"] in ("sequences_count", "contacts_active")
                        and not m.get("dimension")]
                        if seq_res["ok"] else [])

        # emails_opened is a RANGE-level count, not per-day: Apollo exposes no
        # per-message "opened_at", so the opened figure can only be obtained
        # as a filtered count over the whole window (see _apollo_messages_range
        # query #4). It therefore rides along on end_day's row — same
        # treatment as the sequence snapshot, and read back by summing, which
        # is correct because it's written exactly once per range.
        range_level = [{"metric_key": "emails_opened",
                        "metric_value": summary["totals"].get("emails_opened", 0)}]

        written = 0
        d = start_day
        while d <= end_day:
            day_metrics = [{"metric_key": k, "metric_value": v}
                           for k, v in summary["by_day"].get(d.isoformat(), {}).items()]
            if d == end_day:
                day_metrics += seq_snapshot + range_level
            if day_metrics:
                written += await _store(sb_fn, run_fn, "apollo", d, day_metrics)
            d += timedelta(days=1)

        return {"source": "apollo", "ok": True, "from": start_day.isoformat(),
                "to": end_day.isoformat(), "messages": len(msg_res["sent_rows"]),
                "metrics_written": written, "detail": "ok"}
    except Exception as e:
        log.error(f"[apollo] range sync failed: {_redact(e)}")
        return {"source": "apollo", "ok": False, "detail": _redact(e),
                "from": start_day.isoformat(), "to": end_day.isoformat()}


# ── persistence ──────────────────────────────────────────────

async def _store(sb_fn, run_fn, source: str, day: date, metrics: List[Dict[str, Any]]) -> int:
    """Replace this source's rows for this day, then insert fresh ones.

    WHY NOT upsert(on_conflict=...): the unique index created in the Batch A
    migration is an EXPRESSION index —

        (source, metric_date, metric_key, COALESCE(dimension, ''))

    PostgREST's on_conflict takes a plain column list and cannot target an
    expression index, so `on_conflict="source,metric_date,metric_key,dimension"`
    fails with "no unique or exclusion constraint matching the ON CONFLICT
    specification" on EVERY sync. Delete-then-insert scoped to (source, day) is
    idempotent, needs no index, and requires no migration. The unique index
    still does its job as a guard against accidental duplicates.

    sb_fn / run_fn are injected (server.py's sb() and run()) rather than
    imported, which keeps this module free of a circular import back to server.
    """
    if not metrics:
        return 0

    iso = day.isoformat()

    # Scoped to this source and this day only — never touches the other vendor
    # or any other date.
    await run_fn(lambda: sb_fn("integration_metrics")
                 .delete().eq("source", source).eq("metric_date", iso).execute())

    payload = [{
        "source":       source,
        "metric_date":  iso,
        "metric_key":   m["metric_key"],
        "metric_value": float(m.get("metric_value") or 0),
        "dimension":    m.get("dimension"),
        "synced_at":    datetime.now(timezone.utc).isoformat(),
    } for m in metrics]

    # Chunked so one oversized request cannot fail the whole sync
    written = 0
    for i in range(0, len(payload), 200):
        chunk = payload[i:i + 200]
        await run_fn(lambda ch=chunk: sb_fn("integration_metrics").insert(ch).execute())
        written += len(chunk)
    return written


# ── public sync entry points ─────────────────────────────────

async def sync_cloudtalk(sb_fn, run_fn, day: Optional[date] = None) -> Dict[str, Any]:
    day = day or (date.today() - timedelta(days=1))
    if not cloudtalk_configured():
        return {"source": "cloudtalk", "ok": False, "skipped": True,
                "detail": "not configured", "date": day.isoformat()}
    try:
        res = await _cloudtalk_calls(day)
        metrics = _summarise_cloudtalk(res["rows"])
        n = await _store(sb_fn, run_fn, "cloudtalk", day, metrics)
        return {"source": "cloudtalk", "ok": res["ok"], "date": day.isoformat(),
                "calls": len(res["rows"]), "metrics_written": n,
                "detail": res.get("error") or "ok"}
    except Exception as e:
        log.error(f"[cloudtalk] sync failed: {_redact(e)}")
        return {"source": "cloudtalk", "ok": False, "date": day.isoformat(),
                "detail": _redact(e)}


async def sync_apollo(sb_fn, run_fn, day: Optional[date] = None) -> Dict[str, Any]:
    """Single-day Apollo sync — delegates to sync_apollo_range(day, day) for
    real per-day message data instead of the old live-snapshot-only path.
    Kept as its own function because the nightly scheduler and non-range
    manual syncs call it with just a day, not a range.
    """
    day = day or (date.today() - timedelta(days=1))
    res = await sync_apollo_range(sb_fn, run_fn, day, day)
    # Preserve the original single-day return shape (source/ok/date/
    # sequences/metrics_written/detail) that callers already expect.
    return {"source": "apollo", "ok": res.get("ok", False),
            "skipped": res.get("skipped", False), "date": day.isoformat(),
            "sequences": res.get("messages", 0), "metrics_written": res.get("metrics_written", 0),
            "detail": res.get("detail", "")}


async def sync_all(sb_fn, run_fn, day: Optional[date] = None) -> Dict[str, Any]:
    """Both vendors, sequentially. One failing must not stop the other."""
    ct = await sync_cloudtalk(sb_fn, run_fn, day)
    ap = await sync_apollo(sb_fn, run_fn, day)
    return {"cloudtalk": ct, "apollo": ap}


async def sync_cloudtalk_range(sb_fn, run_fn, start_day: date, end_day: date) -> Dict[str, Any]:
    """Backfill real per-day CloudTalk metrics across a date range.

    Fetches the whole range in ONE paginated call (_cloudtalk_calls_range)
    instead of one call per day, then writes the same one integration_metrics
    row-set per day from the bucketed results — output is identical to
    calling sync_cloudtalk() once per day, just far fewer HTTP round trips.

    Apollo now has its own real per-day range backfill — see
    sync_apollo_range — built on /emailer_messages/search rather than the
    sequence-snapshot endpoint this file used to rely on for Apollo.
    """
    if not cloudtalk_configured():
        return {"source": "cloudtalk", "ok": False, "skipped": True,
                "detail": "not configured"}

    fetch = await _cloudtalk_calls_range(start_day, end_day)
    if not fetch["ok"]:
        return {"source": "cloudtalk", "ok": False,
                "from": start_day.isoformat(), "to": end_day.isoformat(),
                "detail": fetch["error"]}

    by_day = fetch["by_day"]
    results: List[Dict[str, Any]] = []
    d = start_day
    while d <= end_day:
        rows = by_day.get(d.isoformat(), [])
        try:
            metrics = _summarise_cloudtalk(rows)
            n = await _store(sb_fn, run_fn, "cloudtalk", d, metrics)
            results.append({"source": "cloudtalk", "ok": True, "date": d.isoformat(),
                            "calls": len(rows), "metrics_written": n, "detail": "ok"})
        except Exception as e:
            log.error(f"[cloudtalk] range sync failed for {d.isoformat()}: {_redact(e)}")
            results.append({"source": "cloudtalk", "ok": False, "date": d.isoformat(),
                            "detail": _redact(e)})
        d += timedelta(days=1)

    ok = all(r.get("ok") for r in results)
    total_calls = sum(int(r.get("calls") or 0) for r in results)
    return {"source": "cloudtalk", "ok": ok, "calls": total_calls,
            "days_synced": len(results),
            "from": start_day.isoformat(), "to": end_day.isoformat(),
            "detail": "ok" if ok else "one or more days failed — see results",
            "results": results}


async def sync_all_range(sb_fn, run_fn, days: int) -> Dict[str, Any]:
    """Used when 'Sync now' is pressed while a range is selected on the
    dashboard. Both CloudTalk and Apollo now backfill real per-day history
    for the whole window — see sync_cloudtalk_range and sync_apollo_range.
    """
    end   = date.today() - timedelta(days=1)
    start = end - timedelta(days=max(1, days) - 1)
    ct = await sync_cloudtalk_range(sb_fn, run_fn, start, end)
    ap = await sync_apollo_range(sb_fn, run_fn, start, end)
    return {"cloudtalk": ct, "apollo": ap}
