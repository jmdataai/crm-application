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
    data: [...]}} — NOT {data: {items: [...], total: N}} as previously assumed.
    Each item may still be nested under a 'Cdr' key in the v1 API, so we
    flatten defensively — if that inner shape changes, we fall back to the
    item itself rather than crashing.
    """
    out: List[Dict[str, Any]] = []
    headers = {"Authorization": _cloudtalk_auth_header()}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        page = 1
        while page <= _PAGE_CAP:
            res = await _request(c, "GET", f"{CLOUDTALK_BASE}/calls/index.json",
                                 params={"date_from": day.isoformat(),
                                         "date_to":   day.isoformat(),
                                         "limit": 250, "page": page},
                                 headers=headers)
            if not res["ok"]:
                return {"ok": False, "error": res["error"], "rows": out}

            body  = (res["data"] or {}).get("responseData") or {}
            items = body.get("data") or []
            if not items:
                break

            for it in items:
                # v1 nests the record under 'Cdr'; tolerate both shapes
                rec = it.get("Cdr") if isinstance(it, dict) and "Cdr" in it else it
                if isinstance(rec, dict):
                    out.append(rec)

            total = body.get("itemsCount")
            if total is not None and len(out) >= int(total):
                break
            if len(items) < 250:
                break
            page += 1

    return {"ok": True, "rows": out}


def _summarise_cloudtalk(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Roll raw CDRs into the metrics the desk actually reviews.

    The dispositions mirror what the team currently types by hand into the
    'Remarks' column of the call-cadence spreadsheet (VM, Gatekeeper, Not fit,
    Hung Up...). Surfacing them automatically is the point of this integration.
    """
    metrics: List[Dict[str, Any]] = []
    total = len(rows)
    answered = talk = 0
    by_agent: Dict[str, Dict[str, float]] = {}
    by_disp:  Dict[str, int] = {}

    for r in rows:
        status = str(r.get("status") or r.get("call_status") or "").lower()
        dur    = float(r.get("talking_time") or r.get("billsec") or 0)
        is_ans = status in ("answered", "completed") or dur > 0
        if is_ans:
            answered += 1
        talk += dur

        agent = (r.get("agent_name") or r.get("user_name") or "Unassigned").strip() or "Unassigned"
        a = by_agent.setdefault(agent, {"calls": 0, "answered": 0, "talk": 0.0})
        a["calls"] += 1
        a["answered"] += 1 if is_ans else 0
        a["talk"] += dur

        disp = (r.get("disposition") or r.get("tag") or r.get("note") or "").strip()
        if disp:
            by_disp[disp] = by_disp.get(disp, 0) + 1

    metrics.append({"metric_key": "calls_total",    "metric_value": total})
    metrics.append({"metric_key": "calls_answered", "metric_value": answered})
    metrics.append({"metric_key": "talk_time_sec",  "metric_value": round(talk)})
    metrics.append({"metric_key": "answer_rate",
                    "metric_value": round(answered / total * 100, 1) if total else 0})
    metrics.append({"metric_key": "avg_talk_sec",
                    "metric_value": round(talk / answered) if answered else 0})

    for agent, v in by_agent.items():
        metrics.append({"metric_key": "calls_total",    "dimension": agent, "metric_value": v["calls"]})
        metrics.append({"metric_key": "calls_answered", "dimension": agent, "metric_value": v["answered"]})
        metrics.append({"metric_key": "talk_time_sec",  "dimension": agent, "metric_value": round(v["talk"])})

    for disp, n in by_disp.items():
        metrics.append({"metric_key": "disposition", "dimension": disp, "metric_value": n})

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
    day = day or (date.today() - timedelta(days=1))
    if not apollo_configured():
        return {"source": "apollo", "ok": False, "skipped": True,
                "detail": "not configured", "date": day.isoformat()}
    try:
        res = await _apollo_sequences()
        metrics = _summarise_apollo(res["rows"])
        n = await _store(sb_fn, run_fn, "apollo", day, metrics)
        return {"source": "apollo", "ok": res["ok"], "date": day.isoformat(),
                "sequences": len(res["rows"]), "metrics_written": n,
                "rate": res.get("rate", {}), "detail": res.get("error") or "ok"}
    except Exception as e:
        log.error(f"[apollo] sync failed: {_redact(e)}")
        return {"source": "apollo", "ok": False, "date": day.isoformat(),
                "detail": _redact(e)}


async def sync_all(sb_fn, run_fn, day: Optional[date] = None) -> Dict[str, Any]:
    """Both vendors, sequentially. One failing must not stop the other."""
    ct = await sync_cloudtalk(sb_fn, run_fn, day)
    ap = await sync_apollo(sb_fn, run_fn, day)
    return {"cloudtalk": ct, "apollo": ap}
