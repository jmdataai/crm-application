from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, File, UploadFile
from starlette.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import os
import logging
import bcrypt
import jwt
import asyncio
import resend
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron  import CronTrigger
import pandas as pd
import io
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel, EmailStr
from enum import Enum

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ── Supabase client ───────────────────────────────────────────
SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]   # service role — bypasses RLS
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Resend email ──────────────────────────────────────────────
resend.api_key  = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL    = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
scheduler       = AsyncIOScheduler()

# ── JWT ───────────────────────────────────────────────────────
JWT_SECRET    = os.environ.get("JWT_SECRET", "change_me_in_production")
JWT_ALGORITHM = "HS256"

# ── App ───────────────────────────────────────────────────────
app        = FastAPI(title="Nexus CRM + ATS")
api_router = APIRouter(prefix="/api")


# ============================================================
# ENUMS
# ============================================================
class LeadStatus(str, Enum):
    NEW        = "new"
    CONTACTED  = "contacted"
    CALLED     = "called"
    INTERESTED = "interested"
    CLOSED     = "closed"
    COMPLETED  = "completed"
    REJECTED   = "rejected"
    LOST       = "lost"
    FOLLOW_UP  = "follow_up_needed"

class CandidateStatus(str, Enum):
    SOURCED              = "sourced"
    SCREENED             = "screened"
    SHORTLISTED          = "shortlisted"
    INTERVIEW_SCHEDULED  = "interview_scheduled"
    INTERVIEWED          = "interviewed"
    SELECTED             = "selected"
    REJECTED             = "rejected"
    ONBOARDED            = "onboarded"

class TaskPriority(str, Enum):
    LOW    = "low"
    MEDIUM = "medium"
    HIGH   = "high"

class ActivityType(str, Enum):
    CALL          = "call"
    EMAIL         = "email"
    MEETING       = "meeting"
    NOTE          = "note"
    STATUS_CHANGE = "status_change"
    INTERVIEW     = "interview"


# ============================================================
# PYDANTIC MODELS
# ============================================================
class UserCreate(BaseModel):
    email:    EmailStr
    password: str
    name:     str
    role:     str = "sales"   # default role for new users

class UserLogin(BaseModel):
    email:    EmailStr
    password: str

class LeadCreate(BaseModel):
    full_name:      str
    email:          Optional[EmailStr] = None
    phone:          Optional[str]      = None
    company:        Optional[str]      = None
    job_title:      Optional[str]      = None
    source:         Optional[str]      = None
    status:         LeadStatus         = LeadStatus.NEW
    notes:          Optional[str]      = None
    next_follow_up: Optional[str]      = None   # ISO date string YYYY-MM-DD

class LeadUpdate(BaseModel):
    full_name:        Optional[str]       = None
    email:            Optional[EmailStr]  = None
    phone:            Optional[str]       = None
    company:          Optional[str]       = None
    job_title:        Optional[str]       = None
    source:           Optional[str]       = None
    status:           Optional[LeadStatus]= None
    notes:            Optional[str]       = None
    next_follow_up:   Optional[str]       = None
    assigned_owner_id:Optional[str]       = None

class ActivityCreate(BaseModel):
    lead_id:       Optional[str]  = None
    candidate_id:  Optional[str]  = None
    activity_type: ActivityType
    description:   str

class TaskCreate(BaseModel):
    title:        str
    description:  Optional[str]      = None
    task_type:    Optional[str]      = "note"
    due_date:     str
    due_time:     Optional[str]      = None
    priority:     TaskPriority       = TaskPriority.MEDIUM
    lead_id:      Optional[str]      = None
    candidate_id: Optional[str]      = None
    job_id:       Optional[str]      = None

class TaskUpdate(BaseModel):
    title:       Optional[str]          = None
    description: Optional[str]          = None
    due_date:    Optional[str]          = None
    priority:    Optional[TaskPriority] = None
    completed:   Optional[bool]         = None

class ReminderCreate(BaseModel):
    title:        str
    note:         Optional[str] = None
    due_date:     str
    due_time:     Optional[str] = None
    repeat_type:  str           = "none"
    email_alert:  bool          = False
    lead_id:      Optional[str] = None
    candidate_id: Optional[str] = None

class JobCreate(BaseModel):
    title:           str
    department:      Optional[str]  = None
    location:        Optional[str]  = None
    employment_type: Optional[str]  = None
    description:     Optional[str]  = None
    requirements:    Optional[str]  = None
    salary_range:    Optional[str]  = None
    skills:          List[str]      = []
    is_active:       bool           = True
    is_urgent:       bool           = False

class JobUpdate(BaseModel):
    title:           Optional[str]  = None
    department:      Optional[str]  = None
    location:        Optional[str]  = None
    employment_type: Optional[str]  = None
    description:     Optional[str]  = None
    requirements:    Optional[str]  = None
    salary_range:    Optional[str]  = None
    skills:          Optional[List[str]] = None
    is_active:       Optional[bool] = None
    is_urgent:       Optional[bool] = None

class CandidateCreate(BaseModel):
    full_name:        str
    email:            Optional[EmailStr] = None
    phone:            Optional[str]      = None
    current_company:  Optional[str]      = None
    candidate_role:     Optional[str]      = None
    experience_years: Optional[int]      = None
    source:           Optional[str]      = None
    job_id:           Optional[str]      = None
    status:           CandidateStatus    = CandidateStatus.SOURCED
    notes:            Optional[str]      = None
    resume_url:       Optional[str]      = None
    linkedin_url:     Optional[str]      = None
    portfolio_url:    Optional[str]      = None
    skills:           List[str]          = []

class CandidateUpdate(BaseModel):
    full_name:            Optional[str]              = None
    email:                Optional[EmailStr]          = None
    phone:                Optional[str]              = None
    current_company:      Optional[str]              = None
    candidate_role:         Optional[str]              = None
    experience_years:     Optional[int]              = None
    source:               Optional[str]              = None
    job_id:               Optional[str]              = None
    status:               Optional[CandidateStatus]  = None
    notes:                Optional[str]              = None
    resume_url:           Optional[str]              = None
    linkedin_url:         Optional[str]              = None
    portfolio_url:        Optional[str]              = None
    skills:               Optional[List[str]]        = None
    assigned_recruiter_id:Optional[str]              = None

class InterviewCreate(BaseModel):
    candidate_id:   str
    job_id:         str
    scheduled_at:   str           # ISO datetime
    interview_type: str
    interviewers:   List[str] = []
    notes:          Optional[str] = None

class InterviewUpdate(BaseModel):
    scheduled_at:   Optional[str]      = None
    interview_type: Optional[str]      = None
    interviewers:   Optional[List[str]]= None
    notes:          Optional[str]      = None
    feedback:       Optional[str]      = None
    rating:         Optional[int]      = None
    completed:      Optional[bool]     = None


# ============================================================
# HELPERS
# ============================================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def create_access_token(user_id: str, email: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": email,
         "exp": datetime.now(timezone.utc) + timedelta(hours=24),
         "type": "access"},
        JWT_SECRET, algorithm=JWT_ALGORITHM
    )

def create_refresh_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id,
         "exp": datetime.now(timezone.utc) + timedelta(days=7),
         "type": "refresh"},
        JWT_SECRET, algorithm=JWT_ALGORITHM
    )

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    user = await safe_single(
        lambda: supabase.table("users")
            .select("id,email,name,role,avatar_url,created_at")
            .eq("id", payload["sub"])
            .single()
            .execute()
    )
    if not user:
        raise HTTPException(401, "User not found")
    return user

async def send_email(to: str, subject: str, html: str):
    if not resend.api_key:
        logger.info(f"[email-sim] To: {to} | {subject}")
        return {"status": "simulated"}
    try:
        result = await asyncio.to_thread(
            resend.Emails.send, {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html}
        )
        return {"status": "success", "id": result.get("id")}
    except Exception as e:
        logger.error(f"Email failed: {e}")
        return {"status": "failed", "error": str(e)}

def sb(table: str):
    """Shorthand for supabase.table()"""
    return supabase.table(table)

async def run(fn):
    """Run a synchronous supabase call in a thread pool."""
    return await asyncio.to_thread(fn)

async def safe_single(fn):
    """Run a .single() query safely — returns None on 0 rows (PGRST116) instead of crashing."""
    try:
        res = await asyncio.to_thread(fn)
        return res.data
    except Exception as e:
        err = str(e)
        if "PGRST116" in err or "0 rows" in err or "406" in err:
            return None
        raise


# ============================================================
# AUTH
# ============================================================
@api_router.post("/auth/register")
async def register(data: UserCreate, request: Request):
    # Only logged-in admins can create new users
    caller = await get_current_user(request)
    if caller.get("role") != "admin":
        raise HTTPException(403, "Only admins can create new user accounts")

    # Validate role value
    allowed_roles = {"admin", "sales", "viewer"}
    role = data.role if data.role in allowed_roles else "sales"

    existing = await run(lambda: sb("users").select("id").eq("email", data.email.lower()).execute())
    if existing.data:
        raise HTTPException(400, "Email already registered")

    user_id = str(uuid.uuid4())
    await run(lambda: sb("users").insert({
        "id":            user_id,
        "email":         data.email.lower(),
        "password_hash": hash_password(data.password),
        "name":          data.name,
        "role":          role,
    }).execute())

    return {"id": user_id, "email": data.email, "name": data.name, "role": role}


@api_router.post("/auth/login")
async def login(data: UserLogin, response: Response):
    user = await safe_single(lambda: sb("users").select("*").eq("email", data.email.lower()).single().execute())
    if not user:
        raise HTTPException(401, "Access not authorized. This email is not registered.")
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect password. Please try again.")

    access  = create_access_token(user["id"], user["email"])
    refresh = create_refresh_token(user["id"])
    _set_cookies(response, access, refresh)
    return {
        "id":    user["id"],
        "email": user["email"],
        "name":  user["name"],
        "role":  user.get("role", "viewer"),   # include role for frontend permissions
    }


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token",  path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/auth/me")
async def get_me(request: Request):
    return await get_current_user(request)


def _set_cookies(response: Response, access: str, refresh: str):
    kw = dict(httponly=True, secure=True, samesite="none", path="/")
    response.set_cookie("access_token",  access,  max_age=86400,   **kw)
    response.set_cookie("refresh_token", refresh, max_age=604800,  **kw)


# ============================================================
# USERS
# ============================================================
@api_router.get("/users")
async def get_users(request: Request):
    await get_current_user(request)
    res = await run(lambda: sb("users").select("id,email,name,role,avatar_url,created_at").execute())
    return res.data or []


@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, body: dict, request: Request):
    caller = await get_current_user(request)
    if caller.get("role") != "admin":
        raise HTTPException(403, "Only admins can change user roles")
    allowed_roles = {"admin", "sales", "viewer"}
    role = body.get("role")
    if role not in allowed_roles:
        raise HTTPException(400, f"Role must be one of: {', '.join(allowed_roles)}")
    await run(lambda: sb("users").update({"role": role}).eq("id", user_id).execute())
    return {"id": user_id, "role": role}


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    caller = await get_current_user(request)
    if caller.get("role") != "admin":
        raise HTTPException(403, "Only admins can delete users")
    if caller["id"] == user_id:
        raise HTTPException(400, "You cannot delete your own account")
    await run(lambda: sb("users").delete().eq("id", user_id).execute())
    return {"message": "User deleted"}


# ============================================================
# LEADS
# ============================================================
@api_router.post("/leads")
async def create_lead(lead: LeadCreate, request: Request):
    user = await get_current_user(request)
    doc = {
        "full_name":        lead.full_name,
        "email":            lead.email,
        "phone":            lead.phone,
        "company":          lead.company,
        "job_title":        lead.job_title,
        "source":           lead.source,
        "status":           lead.status.value,
        "notes":            lead.notes,
        "next_follow_up":   lead.next_follow_up,
        "assigned_owner_id":user["id"],
        "created_by":       user["id"],
    }
    res = await run(lambda: sb("leads").insert(doc).execute())
    lead_id = res.data[0]["id"]
    await _log_activity(lead_id=lead_id, user=user, atype="note", desc=f"Lead created by {user['name']}")
    return res.data[0]


@api_router.get("/leads")
async def get_leads(
    request:     Request,
    status:      Optional[str] = None,
    source:      Optional[str] = None,
    search:      Optional[str] = None,
    assigned_to: Optional[str] = None,
    skip:        int = 0,
    limit:       int = 50,
):
    await get_current_user(request)
    q = sb("leads").select(
        "*, assigned_owner:assigned_owner_id(name)",
        count="exact"
    ).order("created_at", desc=True).range(skip, skip + limit - 1)

    if status:      q = q.eq("status", status)
    if source:      q = q.eq("source", source)
    if assigned_to: q = q.eq("assigned_owner_id", assigned_to)
    if search:
        q = q.or_(
            f"full_name.ilike.%{search}%,"
            f"email.ilike.%{search}%,"
            f"company.ilike.%{search}%,"
            f"phone.ilike.%{search}%"
        )

    res = await run(lambda: q.execute())
    return {"leads": res.data or [], "total": res.count or 0}


@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, request: Request):
    await get_current_user(request)
    lead = await safe_single(lambda: sb("leads").select("*, assigned_owner:assigned_owner_id(name)").eq("id", lead_id).single().execute())
    if not lead:
        raise HTTPException(404, "Lead not found")

    acts = await run(lambda: sb("activities").select("*").eq("lead_id", lead_id).order("created_at", desc=True).execute())
    lead["activities"] = acts.data or []

    hist = await run(lambda: sb("lead_status_history").select("*").eq("lead_id", lead_id).order("created_at", desc=True).execute())
    lead["status_history"] = hist.data or []
    return lead


@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, lead: LeadUpdate, request: Request):
    user = await get_current_user(request)

    existing = await safe_single(lambda: sb("leads").select("status").eq("id", lead_id).single().execute())
    if not existing:
        raise HTTPException(404, "Lead not found")

    patch = {k: v for k, v in lead.model_dump().items() if v is not None}
    if "status" in patch and isinstance(patch["status"], LeadStatus):
        patch["status"] = patch["status"].value

    if lead.status and lead.status.value != existing.get("status"):
        old_status = existing.get("status")
        new_status = lead.status.value
        await run(lambda: sb("lead_status_history").insert({
            "lead_id":        lead_id,
            "old_status":     old_status,
            "new_status":     new_status,
            "changed_by":     user["id"],
            "changed_by_name":user["name"],
        }).execute())
        await _log_activity(lead_id=lead_id, user=user, atype="status_change",
                            desc=f"Status changed from {old_status} to {new_status}")

    await run(lambda: sb("leads").update(patch).eq("id", lead_id).execute())
    return {"message": "Lead updated"}


@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, request: Request):
    await get_current_user(request)
    await run(lambda: sb("leads").delete().eq("id", lead_id).execute())
    return {"message": "Lead deleted"}


# ============================================================
# CSV / EXCEL IMPORT
# ============================================================
@api_router.post("/leads/import")
async def import_leads(file: UploadFile, request: Request):
    user = await get_current_user(request)
    if not file.filename:
        raise HTTPException(400, "No file provided")
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(400, "Only CSV / Excel files are supported")

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content)) if ext == "csv" else pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Error reading file: {e}")

    # Normalise column names — handles Apollo, LinkedIn, HubSpot, manual CSVs
    df.columns = df.columns.str.lower().str.strip()

    col_map = {
        # Name
        "name": "full_name", "full name": "full_name", "fullname": "full_name",
        "contact name": "full_name", "person name": "full_name",
        # Apollo splits into first/last — handled below after rename
        "first name": "_first_name", "firstname": "_first_name",
        "last name": "_last_name", "lastname": "_last_name",
        # Email
        "email": "email", "email address": "email",
        "work email": "email", "primary email": "email",
        # Phone — Apollo has multiple phone columns, take first non-empty
        "phone": "phone", "mobile": "phone", "mobile phone": "phone",
        "phone number": "phone", "work direct phone": "phone",
        "corporate phone": "_phone2", "other phone": "_phone3",
        # Company
        "company": "company", "organization": "company",
        "account": "company", "company name": "company",
        "company name for emails": "_company2",
        # Job title
        "title": "job_title", "job title": "job_title",
        "position": "job_title", "role": "job_title",
        # Source
        "source": "source", "lead source": "source", "channel": "source",
        # LinkedIn
        "linkedin url": "linkedin_url", "linkedin": "linkedin_url",
        "person linkedin url": "linkedin_url",
        # Notes / extra
        "stage": "_stage", "seniority": "_seniority",
    }
    df = df.rename(columns=col_map)

    # Combine First Name + Last Name → full_name (Apollo format)
    if "full_name" not in df.columns and "_first_name" in df.columns:
        first = df.get("_first_name", pd.Series([""] * len(df))).fillna("")
        last  = df.get("_last_name",  pd.Series([""] * len(df))).fillna("")
        df["full_name"] = (first + " " + last).str.strip()

    # Fallback phone: if primary phone empty, use corporate/other
    if "phone" in df.columns:
        for fallback in ["_phone2", "_phone3"]:
            if fallback in df.columns:
                df["phone"] = df["phone"].fillna(df[fallback]).replace("", None)

    # Fallback company: use company name for emails if company missing
    if "_company2" in df.columns:
        if "company" not in df.columns:
            df["company"] = df["_company2"]
        else:
            df["company"] = df["company"].fillna(df["_company2"])

    import_id  = str(uuid.uuid4())
    successful = 0
    errors:    list = []
    batch:     list = []

    for idx, row in df.iterrows():
        full_name = str(row.get("full_name", "")).strip()
        if not full_name or full_name.lower() == "nan":
            errors.append({"row": idx + 2, "error": "Missing full name"})
            continue

        email = str(row.get("email", "")).strip()
        email = None if email.lower() in ("nan", "") else email

        # Duplicate check (in memory for the batch)
        if email and any(r["email"] == email for r in batch):
            errors.append({"row": idx + 2, "error": f"Duplicate email in file: {email}"})
            continue

        batch.append({
            "full_name":        full_name,
            "email":            email,
            "phone":            _clean(row, "phone"),
            "company":          _clean(row, "company"),
            "job_title":        _clean(row, "job_title"),
            "source":           _clean(row, "source") or "Apollo",
            "linkedin_url":     _clean(row, "linkedin_url"),
            "status":           "new",
            "assigned_owner_id":user["id"],
            "created_by":       user["id"],
            "import_id":        import_id,
        })

    # Bulk insert, collecting DB-level duplicate errors
    for record in batch:
        try:
            await run(lambda r=record: sb("leads").insert(r).execute())
            successful += 1
        except Exception as e:
            errors.append({"row": "?", "error": str(e)})

    await run(lambda: sb("imports").insert({
        "id":         import_id,
        "filename":   file.filename,
        "user_id":    user["id"],
        "total_rows": len(df),
        "successful": successful,
        "failed":     len(errors),
        "errors":     errors[:50],
    }).execute())

    return {
        "import_id":  import_id,
        "total_rows": len(df),
        "successful": successful,
        "failed":     len(errors),
        "errors":     errors[:20],
    }


def _clean(row, key):
    val = str(row.get(key, "")).strip()
    return None if val.lower() in ("nan", "") else val


@api_router.get("/imports")
async def get_imports(request: Request):
    await get_current_user(request)
    res = await run(lambda: sb("imports").select("*").order("created_at", desc=True).limit(100).execute())
    return res.data or []


# ============================================================
# ACTIVITIES
# ============================================================
async def _log_activity(*, lead_id=None, candidate_id=None, user: dict, atype: str, desc: str):
    doc = {
        "lead_id":       lead_id,
        "candidate_id":  candidate_id,
        "user_id":       user["id"],
        "user_name":     user["name"],
        "activity_type": atype,
        "description":   desc,
    }
    await run(lambda: sb("activities").insert(doc).execute())


@api_router.post("/activities")
async def create_activity(activity: ActivityCreate, request: Request):
    user = await get_current_user(request)
    await _log_activity(
        lead_id=activity.lead_id, candidate_id=activity.candidate_id,
        user=user, atype=activity.activity_type.value, desc=activity.description
    )
    return {"message": "Activity logged"}


@api_router.get("/activities")
async def get_activities(request: Request, lead_id: Optional[str] = None, candidate_id: Optional[str] = None):
    await get_current_user(request)
    q = sb("activities").select("*").order("created_at", desc=True)
    if lead_id:      q = q.eq("lead_id", lead_id)
    if candidate_id: q = q.eq("candidate_id", candidate_id)
    res = await run(lambda: q.execute())
    return res.data or []


# ============================================================
# TASKS
# ============================================================
@api_router.post("/tasks")
async def create_task(task: TaskCreate, request: Request):
    user = await get_current_user(request)
    res = await run(lambda: sb("tasks").insert({
        "title":           task.title,
        "description":     task.description,
        "task_type":       task.task_type,
        "due_date":        task.due_date,
        "due_time":        task.due_time,
        "priority":        task.priority.value,
        "lead_id":         task.lead_id,
        "candidate_id":    task.candidate_id,
        "job_id":          task.job_id,
        "assigned_to":     user["id"],
        "assigned_to_name":user["name"],
        "created_by":      user["id"],
    }).execute())
    return res.data[0]


@api_router.get("/tasks")
async def get_tasks(
    request:      Request,
    completed:    Optional[bool] = None,
    due_today:    Optional[bool] = None,
    overdue:      Optional[bool] = None,
    lead_id:      Optional[str]  = None,
    candidate_id: Optional[str]  = None,
):
    user = await get_current_user(request)
    today = datetime.now(timezone.utc).date().isoformat()

    q = sb("tasks").select("*").eq("assigned_to", user["id"]).order("due_date")
    if completed is not None: q = q.eq("completed", completed)
    if lead_id:               q = q.eq("lead_id", lead_id)
    if candidate_id:          q = q.eq("candidate_id", candidate_id)
    if due_today:             q = q.eq("due_date", today)
    if overdue:               q = q.lt("due_date", today).eq("completed", False)

    res = await run(lambda: q.execute())
    return res.data or []


@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, task: TaskUpdate, request: Request):
    await get_current_user(request)
    patch = {k: v for k, v in task.model_dump().items() if v is not None}
    if "priority" in patch and isinstance(patch["priority"], TaskPriority):
        patch["priority"] = patch["priority"].value
    if task.completed:
        patch["completed_at"] = datetime.now(timezone.utc).isoformat()
    await run(lambda: sb("tasks").update(patch).eq("id", task_id).execute())
    return {"message": "Task updated"}


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, request: Request):
    await get_current_user(request)
    await run(lambda: sb("tasks").delete().eq("id", task_id).execute())
    return {"message": "Task deleted"}


# ============================================================
# REMINDERS
# ============================================================
@api_router.post("/reminders")
async def create_reminder(reminder: ReminderCreate, request: Request):
    user = await get_current_user(request)
    res = await run(lambda: sb("reminders").insert({
        "title":        reminder.title,
        "note":         reminder.note,
        "due_date":     reminder.due_date,
        "due_time":     reminder.due_time,
        "repeat_type":  reminder.repeat_type,
        "email_alert":  reminder.email_alert,
        "lead_id":      reminder.lead_id,
        "candidate_id": reminder.candidate_id,
        "user_id":      user["id"],
        "user_email":   user["email"],
    }).execute())
    return res.data[0]


@api_router.get("/reminders")
async def get_reminders(request: Request, upcoming: Optional[bool] = None):
    user = await get_current_user(request)
    q = sb("reminders").select("*").eq("user_id", user["id"]).order("due_date")
    if upcoming:
        q = q.gte("due_date", datetime.now(timezone.utc).date().isoformat())
    res = await run(lambda: q.execute())
    return res.data or []


@api_router.put("/reminders/{reminder_id}/dismiss")
async def dismiss_reminder(reminder_id: str, request: Request):
    await get_current_user(request)
    await run(lambda: sb("reminders").update({
        "dismissed": True,
        "dismissed_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", reminder_id).execute())
    return {"message": "Reminder dismissed"}


@api_router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, request: Request):
    await get_current_user(request)
    await run(lambda: sb("reminders").delete().eq("id", reminder_id).execute())
    return {"message": "Reminder deleted"}


# ============================================================
# JOBS
# ============================================================
@api_router.post("/jobs")
async def create_job(job: JobCreate, request: Request):
    user = await get_current_user(request)
    res = await run(lambda: sb("jobs").insert({
        "title":           job.title,
        "department":      job.department,
        "location":        job.location,
        "employment_type": job.employment_type,
        "description":     job.description,
        "requirements":    job.requirements,
        "salary_range":    job.salary_range,
        "skills":          job.skills,
        "is_active":       job.is_active,
        "is_urgent":       job.is_urgent,
        "created_by":      user["id"],
    }).execute())
    return res.data[0]


@api_router.get("/jobs")
async def get_jobs(request: Request, is_active: Optional[bool] = None, search: Optional[str] = None):
    await get_current_user(request)
    q = sb("jobs").select("*").order("created_at", desc=True)
    if is_active is not None: q = q.eq("is_active", is_active)
    if search: q = q.or_(f"title.ilike.%{search}%,department.ilike.%{search}%")
    res = await run(lambda: q.execute())
    jobs = res.data or []

    # Attach candidate count
    for job in jobs:
        cnt = await run(lambda jid=job["id"]: sb("candidates").select("id", count="exact").eq("job_id", jid).execute())
        job["candidate_count"] = cnt.count or 0
    return jobs


@api_router.get("/jobs/{job_id}")
async def get_job(job_id: str, request: Request):
    await get_current_user(request)
    job = await safe_single(lambda: sb("jobs").select("*").eq("id", job_id).single().execute())
    if not job:
        raise HTTPException(404, "Job not found")
    cands = await run(lambda: sb("candidates").select("*").eq("job_id", job_id).execute())
    job["candidates"] = cands.data or []
    return job


@api_router.put("/jobs/{job_id}")
async def update_job(job_id: str, job: JobUpdate, request: Request):
    await get_current_user(request)
    patch = {k: v for k, v in job.model_dump().items() if v is not None}
    await run(lambda: sb("jobs").update(patch).eq("id", job_id).execute())
    return {"message": "Job updated"}


@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, request: Request):
    await get_current_user(request)
    await run(lambda: sb("jobs").delete().eq("id", job_id).execute())
    return {"message": "Job deleted"}


# ============================================================
# CANDIDATES
# ============================================================
@api_router.post("/candidates")
async def create_candidate(candidate: CandidateCreate, request: Request):
    user = await get_current_user(request)
    res = await run(lambda: sb("candidates").insert({
        "full_name":            candidate.full_name,
        "email":                candidate.email,
        "phone":                candidate.phone,
        "current_company":      candidate.current_company,
        "candidate_role":         candidate.candidate_role,
        "experience_years":     candidate.experience_years,
        "source":               candidate.source,
        "job_id":               candidate.job_id,
        "status":               candidate.status.value,
        "notes":                candidate.notes,
        "resume_url":           candidate.resume_url,
        "linkedin_url":         candidate.linkedin_url,
        "portfolio_url":        candidate.portfolio_url,
        "skills":               candidate.skills,
        "assigned_recruiter_id":user["id"],
        "created_by":           user["id"],
    }).execute())
    candidate_id = res.data[0]["id"]
    await _log_activity(candidate_id=candidate_id, user=user, atype="note",
                        desc=f"Candidate added by {user['name']}")
    return res.data[0]


@api_router.get("/candidates")
async def get_candidates(
    request:      Request,
    job_id:       Optional[str] = None,
    status:       Optional[str] = None,
    source:       Optional[str] = None,
    search:       Optional[str] = None,
    skip:         int = 0,
    limit:        int = 50,
):
    await get_current_user(request)
    q = sb("candidates").select(
        "*, job:job_id(title)",
        count="exact"
    ).order("created_at", desc=True).range(skip, skip + limit - 1)

    if job_id:  q = q.eq("job_id", job_id)
    if status:  q = q.eq("status", status)
    if source:  q = q.eq("source", source)
    if search:
        q = q.or_(
            f"full_name.ilike.%{search}%,"
            f"email.ilike.%{search}%,"
            f"current_company.ilike.%{search}%,"
            f"candidate_role.ilike.%{search}%"
        )

    res = await run(lambda: q.execute())
    return {"candidates": res.data or [], "total": res.count or 0}


@api_router.get("/candidates/pipeline")
async def get_pipeline(request: Request, job_id: Optional[str] = None):
    await get_current_user(request)
    pipeline = {}
    for s in CandidateStatus:
        q = sb("candidates").select("*").eq("status", s.value)
        if job_id: q = q.eq("job_id", job_id)
        res = await run(lambda qq=q: qq.execute())
        pipeline[s.value] = res.data or []
    return pipeline


@api_router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: str, request: Request):
    await get_current_user(request)
    candidate_data = await safe_single(lambda: sb("candidates").select("*, job:job_id(title)").eq("id", candidate_id).single().execute())
    if not candidate_data:
        raise HTTPException(404, "Candidate not found")
    cand = candidate_data

    acts = await run(lambda: sb("activities").select("*").eq("candidate_id", candidate_id).order("created_at", desc=True).execute())
    cand["activities"] = acts.data or []

    ivs = await run(lambda: sb("interviews").select("*").eq("candidate_id", candidate_id).order("scheduled_at", desc=True).execute())
    cand["interviews"] = ivs.data or []

    hist = await run(lambda: sb("candidate_status_history").select("*").eq("candidate_id", candidate_id).order("created_at", desc=True).execute())
    cand["status_history"] = hist.data or []
    return cand


@api_router.put("/candidates/{candidate_id}")
async def update_candidate(candidate_id: str, candidate: CandidateUpdate, request: Request):
    user = await get_current_user(request)
    existing = await safe_single(lambda: sb("candidates").select("status").eq("id", candidate_id).single().execute())
    if not existing:
        raise HTTPException(404, "Candidate not found")

    patch = {k: v for k, v in candidate.model_dump().items() if v is not None}
    if "status" in patch and isinstance(patch["status"], CandidateStatus):
        old_status = existing["status"]
        new_status = patch["status"].value
        patch["status"] = new_status
        if old_status != new_status:
            await run(lambda: sb("candidate_status_history").insert({
                "candidate_id":   candidate_id,
                "old_status":     old_status,
                "new_status":     new_status,
                "changed_by":     user["id"],
                "changed_by_name":user["name"],
            }).execute())
            await _log_activity(candidate_id=candidate_id, user=user, atype="status_change",
                                 desc=f"Stage moved from {old_status} to {new_status}")

    await run(lambda: sb("candidates").update(patch).eq("id", candidate_id).execute())
    return {"message": "Candidate updated"}


@api_router.delete("/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str, request: Request):
    await get_current_user(request)
    await run(lambda: sb("candidates").delete().eq("id", candidate_id).execute())
    return {"message": "Candidate deleted"}


# ============================================================
# INTERVIEWS
# ============================================================
@api_router.post("/interviews")
async def create_interview(interview: InterviewCreate, request: Request):
    user = await get_current_user(request)
    res = await run(lambda: sb("interviews").insert({
        "candidate_id":  interview.candidate_id,
        "job_id":        interview.job_id,
        "scheduled_at":  interview.scheduled_at,
        "interview_type":interview.interview_type,
        "interviewers":  interview.interviewers,
        "notes":         interview.notes,
        "created_by":    user["id"],
    }).execute())

    # Move candidate to interview_scheduled
    await run(lambda: sb("candidates").update({"status": "interview_scheduled"}).eq("id", interview.candidate_id).execute())
    await _log_activity(candidate_id=interview.candidate_id, user=user, atype="interview",
                        desc=f"{interview.interview_type} scheduled for {interview.scheduled_at}")
    return res.data[0]


@api_router.get("/interviews")
async def get_interviews(
    request:      Request,
    candidate_id: Optional[str]  = None,
    upcoming:     Optional[bool] = None,
):
    await get_current_user(request)
    q = sb("interviews").select(
        "*, candidate:candidate_id(full_name), job:job_id(title)"
    ).order("scheduled_at")
    if candidate_id: q = q.eq("candidate_id", candidate_id)
    if upcoming:
        now = datetime.now(timezone.utc).isoformat()
        q = q.gte("scheduled_at", now).eq("completed", False)
    res = await run(lambda: q.execute())
    return res.data or []


@api_router.put("/interviews/{interview_id}")
async def update_interview(interview_id: str, interview: InterviewUpdate, request: Request):
    user = await get_current_user(request)
    patch = {k: v for k, v in interview.model_dump().items() if v is not None}
    if interview.completed:
        patch["completed_at"] = datetime.now(timezone.utc).isoformat()

    await run(lambda: sb("interviews").update(patch).eq("id", interview_id).execute())

    # If marked complete, advance candidate to interviewed
    if interview.completed:
        iv_cand = await safe_single(lambda: sb("interviews").select("candidate_id").eq("id", interview_id).single().execute())
        if iv_cand:
            cand_id = iv_cand["candidate_id"]
            await run(lambda: sb("candidates").update({"status": "interviewed"}).eq("id", cand_id).execute())
            await _log_activity(candidate_id=cand_id, user=user, atype="interview",
                                 desc="Interview completed")
    return {"message": "Interview updated"}


# ============================================================
# DASHBOARD
# ============================================================
@api_router.get("/dashboard/sales")
async def sales_dashboard(request: Request):
    user  = await get_current_user(request)
    today = datetime.now(timezone.utc).date().isoformat()

    lead_stats = {}
    for s in LeadStatus:
        r = await run(lambda st=s: sb("leads").select("id", count="exact").eq("status", st.value).execute())
        lead_stats[s.value] = r.count or 0

    total_res    = await run(lambda: sb("leads").select("id", count="exact").execute())
    tasks_today  = await run(lambda: sb("tasks").select("*").eq("assigned_to", user["id"]).eq("due_date", today).eq("completed", False).execute())
    overdue_tasks= await run(lambda: sb("tasks").select("*").eq("assigned_to", user["id"]).lt("due_date", today).eq("completed", False).execute())
    followups    = await run(lambda: sb("leads").select("*").eq("next_follow_up", today).execute())
    recent_leads = await run(lambda: sb("leads").select("*").order("created_at", desc=True).limit(10).execute())
    reminders    = await run(lambda: sb("reminders").select("*").eq("user_id", user["id"]).gte("due_date", today).eq("dismissed", False).order("due_date").limit(10).execute())

    return {
        "lead_stats":    lead_stats,
        "total_leads":   total_res.count or 0,
        "today_tasks":   tasks_today.data or [],
        "overdue_tasks": overdue_tasks.data or [],
        "today_followups": followups.data or [],
        "recent_leads":  recent_leads.data or [],
        "reminders":     reminders.data or [],
    }


@api_router.get("/dashboard/recruitment")
async def recruitment_dashboard(request: Request):
    user  = await get_current_user(request)
    today = datetime.now(timezone.utc).date().isoformat()

    cand_stats = {}
    for s in CandidateStatus:
        r = await run(lambda st=s: sb("candidates").select("id", count="exact").eq("status", st.value).execute())
        cand_stats[s.value] = r.count or 0

    total_cands    = await run(lambda: sb("candidates").select("id", count="exact").execute())
    active_jobs    = await run(lambda: sb("jobs").select("id", count="exact").eq("is_active", True).execute())
    upcoming_ivs   = await run(lambda: sb("interviews").select("*, candidate:candidate_id(full_name), job:job_id(title)").gte("scheduled_at", today).eq("completed", False).order("scheduled_at").limit(10).execute())
    tasks_today    = await run(lambda: sb("tasks").select("*").eq("assigned_to", user["id"]).eq("due_date", today).eq("completed", False).execute())
    recent_cands   = await run(lambda: sb("candidates").select("*, job:job_id(title)").order("created_at", desc=True).limit(10).execute())

    return {
        "candidate_stats":    cand_stats,
        "total_candidates":   total_cands.count or 0,
        "active_jobs":        active_jobs.count or 0,
        "upcoming_interviews":upcoming_ivs.data or [],
        "today_tasks":        tasks_today.data or [],
        "recent_candidates":  recent_cands.data or [],
    }


# ============================================================
# EMAIL — send reminder
# ============================================================
@api_router.post("/reminders/{reminder_id}/send-email")
async def send_reminder_email(reminder_id: str, request: Request):
    user = await get_current_user(request)
    reminder_data = await safe_single(lambda: sb("reminders").select("*").eq("id", reminder_id).single().execute())
    if not reminder_data:
        raise HTTPException(404, "Reminder not found")
    r = reminder_data
    html = f"""
    <div style="font-family:Inter,sans-serif;padding:24px;max-width:480px">
      <h2 style="color:#131b2e;margin-bottom:8px">⏰ {r['title']}</h2>
      <p style="color:#434655">Due: <strong>{r['due_date']}</strong>{' at ' + r['due_time'] if r.get('due_time') else ''}</p>
      {f'<p style="color:#434655">{r["note"]}</p>' if r.get('note') else ''}
      <p style="color:#737686;font-size:13px;margin-top:24px">Nexus CRM Platform</p>
    </div>
    """
    result = await send_email(r.get("user_email", user["email"]), f"Reminder: {r['title']}", html)
    await run(lambda: sb("reminders").update({"email_sent": True}).eq("id", reminder_id).execute())
    return result



# ============================================================
# DAILY DIGEST EMAIL — sent every morning at 8 AM
# ============================================================
async def send_daily_digest():
    """Runs at 8 AM daily. Sends each user a digest of today's tasks + reminders."""
    today = datetime.now(timezone.utc).date().isoformat()
    logger.info(f"[digest] Running daily digest for {today}")

    try:
        users_res = await run(lambda: sb("users").select("id,email,name,role").execute())
        users_list = users_res.data or []
    except Exception as e:
        logger.error(f"[digest] Failed to fetch users: {e}")
        return

    for u in users_list:
        try:
            # Tasks due today for this user
            tasks_res = await run(lambda: sb("tasks")
                .select("title,task_type,priority,due_time")
                .eq("assigned_to", u["id"])
                .eq("due_date", today)
                .eq("completed", False)
                .order("due_time")
                .execute()
            )
            tasks_today = tasks_res.data or []

            # Reminders due today for this user
            reminders_res = await run(lambda: sb("reminders")
                .select("title,due_time,note")
                .eq("user_id", u["id"])
                .eq("due_date", today)
                .eq("dismissed", False)
                .order("due_time")
                .execute()
            )
            reminders_today = reminders_res.data or []

            # Skip if nothing due today
            if not tasks_today and not reminders_today:
                logger.info(f"[digest] Nothing due for {u['email']} — skipping")
                continue

            total = len(tasks_today) + len(reminders_today)

            # Build tasks rows
            tasks_rows = ""
            for t in tasks_today:
                priority_color = {"high": "#dc2626", "medium": "#d97706", "low": "#16a34a"}.get(t.get("priority", "medium"), "#6b7280")
                time_str = f" &middot; {t['due_time'][:5]}" if t.get("due_time") else ""
                tasks_rows += (
                    f'<tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9">'
                    f'<span style="font-weight:600;color:#1e293b">{t["title"]}</span>'
                    f'<span style="color:#94a3b8;font-size:13px">{time_str}</span></td>'
                    f'<td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right">'
                    f'<span style="font-size:12px;font-weight:700;color:{priority_color};text-transform:uppercase">'
                    f'{t.get("priority","")}</span></td></tr>'
                )

            # Build reminders rows
            reminders_rows = ""
            for r in reminders_today:
                time_str = f" &middot; {r['due_time'][:5]}" if r.get("due_time") else ""
                note_str = f'<br><span style="color:#94a3b8;font-size:12px">{r["note"]}</span>' if r.get("note") else ""
                reminders_rows += (
                    f'<tr><td colspan="2" style="padding:10px 0;border-bottom:1px solid #f1f5f9">'
                    f'<span style="font-weight:600;color:#1e293b">&#9200; {r["title"]}</span>'
                    f'<span style="color:#94a3b8;font-size:13px">{time_str}</span>{note_str}</td></tr>'
                )

            tasks_section = ""
            if tasks_today:
                tasks_section = (
                    f'<h2 style="font-size:14px;font-weight:700;color:#475569;text-transform:uppercase;'
                    f'letter-spacing:0.05em;margin:0 0 8px">Tasks ({len(tasks_today)})</h2>'
                    f'<table style="width:100%;border-collapse:collapse;margin-bottom:24px">{tasks_rows}</table>'
                )

            reminders_section = ""
            if reminders_today:
                reminders_section = (
                    f'<h2 style="font-size:14px;font-weight:700;color:#475569;text-transform:uppercase;'
                    f'letter-spacing:0.05em;margin:0 0 8px">Reminders ({len(reminders_today)})</h2>'
                    f'<table style="width:100%;border-collapse:collapse;margin-bottom:24px">{reminders_rows}</table>'
                )

            first_name = u["name"].split()[0]
            subject = f"Your schedule for today \u2014 {total} item{'s' if total != 1 else ''}"

            html = (
                f'<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">'
                f'<div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);border-radius:12px;padding:24px;margin-bottom:28px">'
                f'<h1 style="color:#ffffff;margin:0;font-size:22px">Good morning, {first_name} &#128075;</h1>'
                f'<p style="color:#bfdbfe;margin:8px 0 0;font-size:14px">Here\'s your schedule for today &mdash; '
                f'<strong style="color:#ffffff">{total} item{"s" if total != 1 else ""}</strong> on your plate.</p>'
                f'</div>'
                f'{tasks_section}{reminders_section}'
                f'<p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:32px;'
                f'border-top:1px solid #f1f5f9;padding-top:16px">Nexus CRM &nbsp;&middot;&nbsp; Automated daily digest</p>'
                f'</div>'
            )

            result = await send_email(u["email"], subject, html)
            logger.info(f"[digest] Sent to {u['email']}: {result.get('status')}")

        except Exception as e:
            logger.error(f"[digest] Failed for {u['email']}: {e}")


# ============================================================
# HEALTH CHECK
# ============================================================
@api_router.get("/health")
async def health():
    return {"status": "ok", "service": "Nexus CRM + ATS"}


# ============================================================
# STARTUP — seed admin user
# ============================================================
@app.on_event("startup")
async def startup():
    # Start daily digest scheduler
    digest_time = os.environ.get("DIGEST_TIME", "08:00")
    hour, minute = digest_time.split(":")
    scheduler.add_job(send_daily_digest, CronTrigger(hour=int(hour), minute=int(minute)), id="daily_digest", replace_existing=True)
    scheduler.start()
    logger.info(f"[scheduler] Daily digest scheduled at {digest_time}")

    admin_email    = os.environ.get("ADMIN_EMAIL", "admin@nexuscrm.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")
    admin_name     = os.environ.get("ADMIN_NAME", "Admin")

    existing = await run(lambda: sb("users").select("id").eq("email", admin_email).execute())
    if not existing.data:
        await run(lambda: sb("users").insert({
            "email":         admin_email,
            "password_hash": hash_password(admin_password),
            "name":          admin_name,
            "role":          "admin",
        }).execute())
        logger.info(f"Admin user created: {admin_email}")
    else:
        # Ensure existing admin always has the admin role (fixes missing role on older installs)
        await run(lambda: sb("users").update({"role": "admin"}).eq("email", admin_email).execute())
        logger.info(f"Admin role confirmed for: {admin_email}")


# ============================================================
# WIRE UP
# ============================================================
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    # allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)