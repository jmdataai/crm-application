from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, File, UploadFile
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import asyncio
import resend
import pandas as pd
import io
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Resend setup
resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret_key')
JWT_ALGORITHM = "HS256"

# Create the main app
app = FastAPI(title="CRM + ATS Platform")
api_router = APIRouter(prefix="/api")

# ==================== ENUMS ====================
class LeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    CALLED = "called"
    INTERESTED = "interested"
    CLOSED = "closed"
    COMPLETED = "completed"
    REJECTED = "rejected"
    LOST = "lost"
    FOLLOW_UP = "follow_up_needed"

class CandidateStatus(str, Enum):
    SOURCED = "sourced"
    SCREENED = "screened"
    SHORTLISTED = "shortlisted"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEWED = "interviewed"
    SELECTED = "selected"
    REJECTED = "rejected"
    ONBOARDED = "onboarded"

class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class ActivityType(str, Enum):
    CALL = "call"
    EMAIL = "email"
    MEETING = "meeting"
    NOTE = "note"
    STATUS_CHANGE = "status_change"

# ==================== PYDANTIC MODELS ====================
class UserBase(BaseModel):
    email: EmailStr
    name: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: str

class LeadCreate(BaseModel):
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    source: Optional[str] = None
    status: LeadStatus = LeadStatus.NEW
    notes: Optional[str] = None
    next_follow_up: Optional[str] = None

class LeadUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    source: Optional[str] = None
    status: Optional[LeadStatus] = None
    notes: Optional[str] = None
    next_follow_up: Optional[str] = None
    assigned_owner_id: Optional[str] = None

class LeadResponse(BaseModel):
    id: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    source: Optional[str] = None
    status: str
    notes: Optional[str] = None
    assigned_owner_id: Optional[str] = None
    assigned_owner_name: Optional[str] = None
    next_follow_up: Optional[str] = None
    created_at: str
    updated_at: str

class ActivityCreate(BaseModel):
    lead_id: Optional[str] = None
    candidate_id: Optional[str] = None
    activity_type: ActivityType
    description: str

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: str
    priority: TaskPriority = TaskPriority.MEDIUM
    lead_id: Optional[str] = None
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[TaskPriority] = None
    completed: Optional[bool] = None

class ReminderCreate(BaseModel):
    title: str
    due_date: str
    lead_id: Optional[str] = None
    candidate_id: Optional[str] = None
    send_email: bool = False

class JobCreate(BaseModel):
    title: str
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    salary_range: Optional[str] = None
    is_active: bool = True

class JobUpdate(BaseModel):
    title: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    salary_range: Optional[str] = None
    is_active: Optional[bool] = None

class CandidateCreate(BaseModel):
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    current_company: Optional[str] = None
    current_role: Optional[str] = None
    experience_years: Optional[int] = None
    source: Optional[str] = None
    job_id: Optional[str] = None
    status: CandidateStatus = CandidateStatus.SOURCED
    notes: Optional[str] = None
    resume_url: Optional[str] = None

class CandidateUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    current_company: Optional[str] = None
    current_role: Optional[str] = None
    experience_years: Optional[int] = None
    source: Optional[str] = None
    job_id: Optional[str] = None
    status: Optional[CandidateStatus] = None
    notes: Optional[str] = None
    resume_url: Optional[str] = None
    assigned_recruiter_id: Optional[str] = None

class InterviewCreate(BaseModel):
    candidate_id: str
    job_id: str
    scheduled_at: str
    interview_type: str
    interviewers: List[str] = []
    notes: Optional[str] = None

class InterviewUpdate(BaseModel):
    scheduled_at: Optional[str] = None
    interview_type: Optional[str] = None
    interviewers: Optional[List[str]] = None
    notes: Optional[str] = None
    feedback: Optional[str] = None
    rating: Optional[int] = None
    completed: Optional[bool] = None

# ==================== AUTH HELPERS ====================
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        del user["_id"]
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_role(request: Request, roles: List[UserRole]):
    user = await get_current_user(request)
    if user["role"] not in [r.value for r in roles]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user

# ==================== EMAIL HELPER ====================
async def send_email_notification(to_email: str, subject: str, html_content: str):
    if not resend.api_key or resend.api_key == 're_placeholder_key':
        logger.info(f"Email would be sent to {to_email}: {subject}")
        return {"status": "simulated", "message": f"Email simulated to {to_email}"}
    
    params = {
        "from": SENDER_EMAIL,
        "to": [to_email],
        "subject": subject,
        "html": html_content
    }
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "success", "email_id": email.get("id")}
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return {"status": "failed", "error": str(e)}

# ==================== AUTH ENDPOINTS ====================
@api_router.post("/auth/register")
async def register(user_data: UserCreate, response: Response):
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_doc = {
        "email": user_data.email.lower(),
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, user_data.email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {"id": user_id, "email": user_data.email, "name": user_data.name}

@api_router.post("/auth/login")
async def login(user_data: UserLogin, response: Response):
    user = await db.users.find_one({"email": user_data.email.lower()})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, user["email"])
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {"id": user_id, "email": user["email"], "name": user["name"]}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

# ==================== USERS ENDPOINTS ====================
@api_router.get("/users")
async def get_users(request: Request):
    await get_current_user(request)
    users = await db.users.find({}, {"password_hash": 0}).to_list(1000)
    for u in users:
        u["id"] = str(u["_id"])
        del u["_id"]
    return users

@api_router.get("/users/sales-reps")
async def get_sales_reps(request: Request):
    await get_current_user(request)
    users = await db.users.find({"role": {"$in": ["sales_rep", "manager", "admin"]}}, {"password_hash": 0}).to_list(1000)
    for u in users:
        u["id"] = str(u["_id"])
        del u["_id"]
    return users

@api_router.get("/users/recruiters")
async def get_recruiters(request: Request):
    await get_current_user(request)
    users = await db.users.find({"role": {"$in": ["recruiter", "manager", "admin"]}}, {"password_hash": 0}).to_list(1000)
    for u in users:
        u["id"] = str(u["_id"])
        del u["_id"]
    return users

# ==================== LEADS ENDPOINTS ====================
@api_router.post("/leads")
async def create_lead(lead: LeadCreate, request: Request):
    user = await get_current_user(request)
    lead_doc = {
        "full_name": lead.full_name,
        "email": lead.email,
        "phone": lead.phone,
        "company": lead.company,
        "job_title": lead.job_title,
        "source": lead.source,
        "status": lead.status.value,
        "notes": lead.notes,
        "assigned_owner_id": user["id"],
        "next_follow_up": lead.next_follow_up,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.leads.insert_one(lead_doc)
    lead_id = str(result.inserted_id)
    
    # Log activity
    await db.activities.insert_one({
        "lead_id": lead_id,
        "user_id": user["id"],
        "activity_type": "note",
        "description": f"Lead created by {user['name']}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"id": lead_id, **{k: v for k, v in lead_doc.items() if k != "_id"}}

@api_router.get("/leads")
async def get_leads(
    request: Request,
    status: Optional[str] = None,
    search: Optional[str] = None,
    assigned_to: Optional[str] = None,
    source: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    if assigned_to:
        query["assigned_owner_id"] = assigned_to
    if source:
        query["source"] = source
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"company": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    
    total = await db.leads.count_documents(query)
    leads = await db.leads.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Get owner names
    owner_ids = list(set([l.get("assigned_owner_id") for l in leads if l.get("assigned_owner_id")]))
    owners = {}
    if owner_ids:
        owner_docs = await db.users.find({"_id": {"$in": [ObjectId(oid) for oid in owner_ids]}}).to_list(100)
        for o in owner_docs:
            owners[str(o["_id"])] = o["name"]
    
    for l in leads:
        l["id"] = str(l["_id"])
        del l["_id"]
        if l.get("assigned_owner_id"):
            l["assigned_owner_name"] = owners.get(l["assigned_owner_id"], "Unknown")
    
    return {"leads": leads, "total": total}

@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, request: Request):
    await get_current_user(request)
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead["id"] = str(lead["_id"])
    del lead["_id"]
    
    # Get owner name
    if lead.get("assigned_owner_id"):
        owner = await db.users.find_one({"_id": ObjectId(lead["assigned_owner_id"])})
        lead["assigned_owner_name"] = owner["name"] if owner else "Unknown"
    
    # Get activities
    activities = await db.activities.find({"lead_id": lead_id}).sort("created_at", -1).to_list(100)
    for a in activities:
        a["id"] = str(a["_id"])
        del a["_id"]
    lead["activities"] = activities
    
    # Get status history
    history = await db.lead_status_history.find({"lead_id": lead_id}).sort("created_at", -1).to_list(100)
    for h in history:
        h["id"] = str(h["_id"])
        del h["_id"]
    lead["status_history"] = history
    
    return lead

@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, lead: LeadUpdate, request: Request):
    user = await get_current_user(request)
    existing = await db.leads.find_one({"_id": ObjectId(lead_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    update_data = {k: v for k, v in lead.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Track status change
    if lead.status and lead.status.value != existing.get("status"):
        await db.lead_status_history.insert_one({
            "lead_id": lead_id,
            "old_status": existing.get("status"),
            "new_status": lead.status.value,
            "changed_by": user["id"],
            "changed_by_name": user["name"],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        await db.activities.insert_one({
            "lead_id": lead_id,
            "user_id": user["id"],
            "activity_type": "status_change",
            "description": f"Status changed from {existing.get('status')} to {lead.status.value}",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        update_data["status"] = lead.status.value
    
    await db.leads.update_one({"_id": ObjectId(lead_id)}, {"$set": update_data})
    return {"message": "Lead updated successfully"}

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, request: Request):
    user = await require_role(request, [UserRole.ADMIN, UserRole.MANAGER])
    result = await db.leads.delete_one({"_id": ObjectId(lead_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"message": "Lead deleted successfully"}

# ==================== IMPORT ENDPOINTS ====================
@api_router.post("/leads/import")
async def import_leads(file: UploadFile, request: Request):
    user = await get_current_user(request)
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    ext = file.filename.split('.')[-1].lower()
    if ext not in ['csv', 'xlsx', 'xls']:
        raise HTTPException(status_code=400, detail="Invalid file format. Use CSV or Excel files.")
    
    content = await file.read()
    
    try:
        if ext == 'csv':
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    # Column mapping
    column_map = {
        'name': 'full_name', 'full name': 'full_name', 'fullname': 'full_name',
        'email': 'email', 'email address': 'email',
        'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone',
        'company': 'company', 'organization': 'company', 'company name': 'company',
        'title': 'job_title', 'job title': 'job_title', 'position': 'job_title',
        'source': 'source', 'lead source': 'source'
    }
    
    df.columns = df.columns.str.lower().str.strip()
    df = df.rename(columns=column_map)
    
    import_id = str(uuid.uuid4())
    import_doc = {
        "import_id": import_id,
        "filename": file.filename,
        "user_id": user["id"],
        "total_rows": len(df),
        "successful": 0,
        "failed": 0,
        "errors": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    successful = 0
    errors = []
    
    for idx, row in df.iterrows():
        try:
            full_name = str(row.get('full_name', '')).strip()
            if not full_name or full_name == 'nan':
                errors.append({"row": idx + 2, "error": "Missing full name"})
                continue
            
            email = str(row.get('email', '')).strip()
            if email == 'nan':
                email = None
            
            # Check for duplicates by email
            if email:
                existing = await db.leads.find_one({"email": email})
                if existing:
                    errors.append({"row": idx + 2, "error": f"Duplicate email: {email}"})
                    continue
            
            lead_doc = {
                "full_name": full_name,
                "email": email if email else None,
                "phone": str(row.get('phone', '')).strip() if str(row.get('phone', '')) != 'nan' else None,
                "company": str(row.get('company', '')).strip() if str(row.get('company', '')) != 'nan' else None,
                "job_title": str(row.get('job_title', '')).strip() if str(row.get('job_title', '')) != 'nan' else None,
                "source": str(row.get('source', file.filename)).strip() if str(row.get('source', '')) != 'nan' else file.filename,
                "status": "new",
                "assigned_owner_id": user["id"],
                "import_id": import_id,
                "created_by": user["id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.leads.insert_one(lead_doc)
            successful += 1
        except Exception as e:
            errors.append({"row": idx + 2, "error": str(e)})
    
    import_doc["successful"] = successful
    import_doc["failed"] = len(errors)
    import_doc["errors"] = errors[:50]  # Limit errors stored
    await db.imports.insert_one(import_doc)
    
    return {
        "import_id": import_id,
        "total_rows": len(df),
        "successful": successful,
        "failed": len(errors),
        "errors": errors[:20]
    }

@api_router.get("/imports")
async def get_imports(request: Request):
    await get_current_user(request)
    imports = await db.imports.find({}).sort("created_at", -1).to_list(100)
    for i in imports:
        i["id"] = str(i["_id"])
        del i["_id"]
    return imports

# ==================== ACTIVITIES ENDPOINTS ====================
@api_router.post("/activities")
async def create_activity(activity: ActivityCreate, request: Request):
    user = await get_current_user(request)
    activity_doc = {
        "lead_id": activity.lead_id,
        "candidate_id": activity.candidate_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "activity_type": activity.activity_type.value,
        "description": activity.description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.activities.insert_one(activity_doc)
    return {"id": str(result.inserted_id), "message": "Activity logged successfully"}

@api_router.get("/activities")
async def get_activities(request: Request, lead_id: Optional[str] = None, candidate_id: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if lead_id:
        query["lead_id"] = lead_id
    if candidate_id:
        query["candidate_id"] = candidate_id
    
    activities = await db.activities.find(query).sort("created_at", -1).to_list(100)
    for a in activities:
        a["id"] = str(a["_id"])
        del a["_id"]
    return activities

# ==================== TASKS ENDPOINTS ====================
@api_router.post("/tasks")
async def create_task(task: TaskCreate, request: Request):
    user = await get_current_user(request)
    task_doc = {
        "title": task.title,
        "description": task.description,
        "due_date": task.due_date,
        "priority": task.priority.value,
        "lead_id": task.lead_id,
        "candidate_id": task.candidate_id,
        "job_id": task.job_id,
        "assigned_to": user["id"],
        "assigned_to_name": user["name"],
        "completed": False,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.tasks.insert_one(task_doc)
    return {"id": str(result.inserted_id), "message": "Task created successfully"}

@api_router.get("/tasks")
async def get_tasks(
    request: Request,
    completed: Optional[bool] = None,
    due_today: Optional[bool] = None,
    overdue: Optional[bool] = None,
    lead_id: Optional[str] = None,
    candidate_id: Optional[str] = None
):
    user = await get_current_user(request)
    query = {"assigned_to": user["id"]}
    
    if completed is not None:
        query["completed"] = completed
    if lead_id:
        query["lead_id"] = lead_id
    if candidate_id:
        query["candidate_id"] = candidate_id
    
    today = datetime.now(timezone.utc).date().isoformat()
    
    if due_today:
        query["due_date"] = {"$regex": f"^{today}"}
    if overdue:
        query["due_date"] = {"$lt": today}
        query["completed"] = False
    
    tasks = await db.tasks.find(query).sort("due_date", 1).to_list(200)
    for t in tasks:
        t["id"] = str(t["_id"])
        del t["_id"]
    return tasks

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, task: TaskUpdate, request: Request):
    await get_current_user(request)
    update_data = {k: v for k, v in task.model_dump().items() if v is not None}
    if task.priority:
        update_data["priority"] = task.priority.value
    
    result = await db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task updated successfully"}

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, request: Request):
    await get_current_user(request)
    result = await db.tasks.delete_one({"_id": ObjectId(task_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted successfully"}

# ==================== REMINDERS ENDPOINTS ====================
@api_router.post("/reminders")
async def create_reminder(reminder: ReminderCreate, request: Request):
    user = await get_current_user(request)
    reminder_doc = {
        "title": reminder.title,
        "due_date": reminder.due_date,
        "lead_id": reminder.lead_id,
        "candidate_id": reminder.candidate_id,
        "user_id": user["id"],
        "user_email": user["email"],
        "send_email": reminder.send_email,
        "sent": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.reminders.insert_one(reminder_doc)
    return {"id": str(result.inserted_id), "message": "Reminder created successfully"}

@api_router.get("/reminders")
async def get_reminders(request: Request, upcoming: Optional[bool] = None):
    user = await get_current_user(request)
    query = {"user_id": user["id"]}
    
    if upcoming:
        today = datetime.now(timezone.utc).date().isoformat()
        query["due_date"] = {"$gte": today}
    
    reminders = await db.reminders.find(query).sort("due_date", 1).to_list(100)
    for r in reminders:
        r["id"] = str(r["_id"])
        del r["_id"]
    return reminders

@api_router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, request: Request):
    await get_current_user(request)
    result = await db.reminders.delete_one({"_id": ObjectId(reminder_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"message": "Reminder deleted successfully"}

# ==================== JOBS ENDPOINTS ====================
@api_router.post("/jobs")
async def create_job(job: JobCreate, request: Request):
    user = await require_role(request, [UserRole.ADMIN, UserRole.MANAGER, UserRole.RECRUITER])
    job_doc = {
        "title": job.title,
        "department": job.department,
        "location": job.location,
        "employment_type": job.employment_type,
        "description": job.description,
        "requirements": job.requirements,
        "salary_range": job.salary_range,
        "is_active": job.is_active,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.jobs.insert_one(job_doc)
    return {"id": str(result.inserted_id), "message": "Job created successfully"}

@api_router.get("/jobs")
async def get_jobs(request: Request, is_active: Optional[bool] = None, search: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if is_active is not None:
        query["is_active"] = is_active
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"department": {"$regex": search, "$options": "i"}}
        ]
    
    jobs = await db.jobs.find(query).sort("created_at", -1).to_list(100)
    
    # Get candidate count per job
    for j in jobs:
        j["id"] = str(j["_id"])
        job_id = j["id"]
        del j["_id"]
        j["candidate_count"] = await db.candidates.count_documents({"job_id": job_id})
    
    return jobs

@api_router.get("/jobs/{job_id}")
async def get_job(job_id: str, request: Request):
    await get_current_user(request)
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job["id"] = str(job["_id"])
    del job["_id"]
    
    # Get candidates for this job
    candidates = await db.candidates.find({"job_id": job_id}).to_list(500)
    for c in candidates:
        c["id"] = str(c["_id"])
        del c["_id"]
    job["candidates"] = candidates
    
    return job

@api_router.put("/jobs/{job_id}")
async def update_job(job_id: str, job: JobUpdate, request: Request):
    await require_role(request, [UserRole.ADMIN, UserRole.MANAGER, UserRole.RECRUITER])
    update_data = {k: v for k, v in job.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.jobs.update_one({"_id": ObjectId(job_id)}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Job updated successfully"}

@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, request: Request):
    await require_role(request, [UserRole.ADMIN, UserRole.MANAGER])
    result = await db.jobs.delete_one({"_id": ObjectId(job_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Job deleted successfully"}

# ==================== CANDIDATES ENDPOINTS ====================
@api_router.post("/candidates")
async def create_candidate(candidate: CandidateCreate, request: Request):
    user = await get_current_user(request)
    candidate_doc = {
        "full_name": candidate.full_name,
        "email": candidate.email,
        "phone": candidate.phone,
        "current_company": candidate.current_company,
        "current_role": candidate.current_role,
        "experience_years": candidate.experience_years,
        "source": candidate.source,
        "job_id": candidate.job_id,
        "status": candidate.status.value,
        "notes": candidate.notes,
        "resume_url": candidate.resume_url,
        "assigned_recruiter_id": user["id"],
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.candidates.insert_one(candidate_doc)
    candidate_id = str(result.inserted_id)
    
    # Log activity
    await db.activities.insert_one({
        "candidate_id": candidate_id,
        "user_id": user["id"],
        "activity_type": "note",
        "description": f"Candidate added by {user['name']}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"id": candidate_id, "message": "Candidate created successfully"}

@api_router.get("/candidates")
async def get_candidates(
    request: Request,
    job_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    await get_current_user(request)
    query = {}
    if job_id:
        query["job_id"] = job_id
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"current_company": {"$regex": search, "$options": "i"}}
        ]
    
    total = await db.candidates.count_documents(query)
    candidates = await db.candidates.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Get job titles
    job_ids = list(set([c.get("job_id") for c in candidates if c.get("job_id")]))
    jobs = {}
    if job_ids:
        job_docs = await db.jobs.find({"_id": {"$in": [ObjectId(jid) for jid in job_ids]}}).to_list(100)
        for j in job_docs:
            jobs[str(j["_id"])] = j["title"]
    
    for c in candidates:
        c["id"] = str(c["_id"])
        del c["_id"]
        if c.get("job_id"):
            c["job_title"] = jobs.get(c["job_id"], "Unknown")
    
    return {"candidates": candidates, "total": total}

@api_router.get("/candidates/pipeline")
async def get_pipeline(request: Request, job_id: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if job_id:
        query["job_id"] = job_id
    
    pipeline_data = {}
    for status in CandidateStatus:
        query["status"] = status.value
        candidates = await db.candidates.find(query).to_list(200)
        for c in candidates:
            c["id"] = str(c["_id"])
            del c["_id"]
        pipeline_data[status.value] = candidates
    
    return pipeline_data

@api_router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: str, request: Request):
    await get_current_user(request)
    candidate = await db.candidates.find_one({"_id": ObjectId(candidate_id)})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate["id"] = str(candidate["_id"])
    del candidate["_id"]
    
    # Get job info
    if candidate.get("job_id"):
        job = await db.jobs.find_one({"_id": ObjectId(candidate["job_id"])})
        candidate["job_title"] = job["title"] if job else "Unknown"
    
    # Get activities
    activities = await db.activities.find({"candidate_id": candidate_id}).sort("created_at", -1).to_list(100)
    for a in activities:
        a["id"] = str(a["_id"])
        del a["_id"]
    candidate["activities"] = activities
    
    # Get interviews
    interviews = await db.interviews.find({"candidate_id": candidate_id}).sort("scheduled_at", -1).to_list(50)
    for i in interviews:
        i["id"] = str(i["_id"])
        del i["_id"]
    candidate["interviews"] = interviews
    
    # Get status history
    history = await db.candidate_status_history.find({"candidate_id": candidate_id}).sort("created_at", -1).to_list(100)
    for h in history:
        h["id"] = str(h["_id"])
        del h["_id"]
    candidate["status_history"] = history
    
    return candidate

@api_router.put("/candidates/{candidate_id}")
async def update_candidate(candidate_id: str, candidate: CandidateUpdate, request: Request):
    user = await get_current_user(request)
    existing = await db.candidates.find_one({"_id": ObjectId(candidate_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    update_data = {k: v for k, v in candidate.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Track status change
    if candidate.status and candidate.status.value != existing.get("status"):
        await db.candidate_status_history.insert_one({
            "candidate_id": candidate_id,
            "old_status": existing.get("status"),
            "new_status": candidate.status.value,
            "changed_by": user["id"],
            "changed_by_name": user["name"],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        await db.activities.insert_one({
            "candidate_id": candidate_id,
            "user_id": user["id"],
            "activity_type": "status_change",
            "description": f"Status changed from {existing.get('status')} to {candidate.status.value}",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        update_data["status"] = candidate.status.value
    
    await db.candidates.update_one({"_id": ObjectId(candidate_id)}, {"$set": update_data})
    return {"message": "Candidate updated successfully"}

@api_router.delete("/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str, request: Request):
    await require_role(request, [UserRole.ADMIN, UserRole.MANAGER, UserRole.RECRUITER])
    result = await db.candidates.delete_one({"_id": ObjectId(candidate_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return {"message": "Candidate deleted successfully"}

# ==================== INTERVIEWS ENDPOINTS ====================
@api_router.post("/interviews")
async def create_interview(interview: InterviewCreate, request: Request):
    user = await get_current_user(request)
    interview_doc = {
        "candidate_id": interview.candidate_id,
        "job_id": interview.job_id,
        "scheduled_at": interview.scheduled_at,
        "interview_type": interview.interview_type,
        "interviewers": interview.interviewers,
        "notes": interview.notes,
        "completed": False,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.interviews.insert_one(interview_doc)
    
    # Update candidate status
    await db.candidates.update_one(
        {"_id": ObjectId(interview.candidate_id)},
        {"$set": {"status": "interview_scheduled", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Log activity
    await db.activities.insert_one({
        "candidate_id": interview.candidate_id,
        "user_id": user["id"],
        "activity_type": "meeting",
        "description": f"Interview scheduled for {interview.scheduled_at}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"id": str(result.inserted_id), "message": "Interview scheduled successfully"}

@api_router.get("/interviews")
async def get_interviews(request: Request, candidate_id: Optional[str] = None, upcoming: Optional[bool] = None):
    await get_current_user(request)
    query = {}
    if candidate_id:
        query["candidate_id"] = candidate_id
    if upcoming:
        now = datetime.now(timezone.utc).isoformat()
        query["scheduled_at"] = {"$gte": now}
        query["completed"] = False
    
    interviews = await db.interviews.find(query).sort("scheduled_at", 1).to_list(100)
    
    # Get candidate names
    candidate_ids = list(set([i.get("candidate_id") for i in interviews if i.get("candidate_id")]))
    candidates = {}
    if candidate_ids:
        candidate_docs = await db.candidates.find({"_id": {"$in": [ObjectId(cid) for cid in candidate_ids]}}).to_list(100)
        for c in candidate_docs:
            candidates[str(c["_id"])] = c["full_name"]
    
    for i in interviews:
        i["id"] = str(i["_id"])
        del i["_id"]
        if i.get("candidate_id"):
            i["candidate_name"] = candidates.get(i["candidate_id"], "Unknown")
    
    return interviews

@api_router.put("/interviews/{interview_id}")
async def update_interview(interview_id: str, interview: InterviewUpdate, request: Request):
    user = await get_current_user(request)
    update_data = {k: v for k, v in interview.model_dump().items() if v is not None}
    
    result = await db.interviews.update_one({"_id": ObjectId(interview_id)}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    # If completed, update candidate status
    if interview.completed:
        interview_doc = await db.interviews.find_one({"_id": ObjectId(interview_id)})
        if interview_doc:
            await db.candidates.update_one(
                {"_id": ObjectId(interview_doc["candidate_id"])},
                {"$set": {"status": "interviewed", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
    
    return {"message": "Interview updated successfully"}

# ==================== DASHBOARD ENDPOINTS ====================
@api_router.get("/dashboard/sales")
async def get_sales_dashboard(request: Request):
    user = await get_current_user(request)
    today = datetime.now(timezone.utc).date().isoformat()
    
    # Lead stats by status
    lead_stats = {}
    for status in LeadStatus:
        count = await db.leads.count_documents({"status": status.value})
        lead_stats[status.value] = count
    
    total_leads = await db.leads.count_documents({})
    
    # Today's tasks
    today_tasks = await db.tasks.find({
        "assigned_to": user["id"],
        "due_date": {"$regex": f"^{today}"},
        "completed": False,
        "lead_id": {"$ne": None}
    }).to_list(20)
    for t in today_tasks:
        t["id"] = str(t["_id"])
        del t["_id"]
    
    # Overdue tasks
    overdue_tasks = await db.tasks.find({
        "assigned_to": user["id"],
        "due_date": {"$lt": today},
        "completed": False,
        "lead_id": {"$ne": None}
    }).to_list(20)
    for t in overdue_tasks:
        t["id"] = str(t["_id"])
        del t["_id"]
    
    # Today's follow-ups
    today_followups = await db.leads.find({
        "next_follow_up": {"$regex": f"^{today}"}
    }).to_list(20)
    for l in today_followups:
        l["id"] = str(l["_id"])
        del l["_id"]
    
    # Recent leads
    recent_leads = await db.leads.find({}).sort("created_at", -1).limit(10).to_list(10)
    for l in recent_leads:
        l["id"] = str(l["_id"])
        del l["_id"]
    
    # Upcoming reminders
    reminders = await db.reminders.find({
        "user_id": user["id"],
        "due_date": {"$gte": today}
    }).sort("due_date", 1).limit(10).to_list(10)
    for r in reminders:
        r["id"] = str(r["_id"])
        del r["_id"]
    
    return {
        "lead_stats": lead_stats,
        "total_leads": total_leads,
        "today_tasks": today_tasks,
        "overdue_tasks": overdue_tasks,
        "today_followups": today_followups,
        "recent_leads": recent_leads,
        "reminders": reminders
    }

@api_router.get("/dashboard/recruitment")
async def get_recruitment_dashboard(request: Request):
    user = await get_current_user(request)
    today = datetime.now(timezone.utc).date().isoformat()
    
    # Candidate stats by status
    candidate_stats = {}
    for status in CandidateStatus:
        count = await db.candidates.count_documents({"status": status.value})
        candidate_stats[status.value] = count
    
    total_candidates = await db.candidates.count_documents({})
    active_jobs = await db.jobs.count_documents({"is_active": True})
    
    # Upcoming interviews
    upcoming_interviews = await db.interviews.find({
        "scheduled_at": {"$gte": today},
        "completed": False
    }).sort("scheduled_at", 1).limit(10).to_list(10)
    
    # Get candidate names for interviews
    candidate_ids = [i.get("candidate_id") for i in upcoming_interviews if i.get("candidate_id")]
    candidates = {}
    if candidate_ids:
        candidate_docs = await db.candidates.find({"_id": {"$in": [ObjectId(cid) for cid in candidate_ids]}}).to_list(100)
        for c in candidate_docs:
            candidates[str(c["_id"])] = c["full_name"]
    
    for i in upcoming_interviews:
        i["id"] = str(i["_id"])
        del i["_id"]
        if i.get("candidate_id"):
            i["candidate_name"] = candidates.get(i["candidate_id"], "Unknown")
    
    # Today's recruitment tasks
    today_tasks = await db.tasks.find({
        "assigned_to": user["id"],
        "due_date": {"$regex": f"^{today}"},
        "completed": False,
        "candidate_id": {"$ne": None}
    }).to_list(20)
    for t in today_tasks:
        t["id"] = str(t["_id"])
        del t["_id"]
    
    # Recent candidates
    recent_candidates = await db.candidates.find({}).sort("created_at", -1).limit(10).to_list(10)
    for c in recent_candidates:
        c["id"] = str(c["_id"])
        del c["_id"]
    
    # Pipeline summary per job
    jobs = await db.jobs.find({"is_active": True}).to_list(20)
    job_pipelines = []
    for job in jobs:
        job_id = str(job["_id"])
        pipeline = {}
        for status in CandidateStatus:
            count = await db.candidates.count_documents({"job_id": job_id, "status": status.value})
            pipeline[status.value] = count
        job_pipelines.append({
            "job_id": job_id,
            "job_title": job["title"],
            "pipeline": pipeline
        })
    
    return {
        "candidate_stats": candidate_stats,
        "total_candidates": total_candidates,
        "active_jobs": active_jobs,
        "upcoming_interviews": upcoming_interviews,
        "today_tasks": today_tasks,
        "recent_candidates": recent_candidates,
        "job_pipelines": job_pipelines
    }

# ==================== NOTIFICATION EMAIL ====================
@api_router.post("/send-reminder-email")
async def send_reminder_email(request: Request, reminder_id: str):
    user = await get_current_user(request)
    reminder = await db.reminders.find_one({"_id": ObjectId(reminder_id)})
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    
    html_content = f"""
    <div style="font-family: Inter, sans-serif; padding: 20px;">
        <h2 style="color: #131b2e;">Reminder: {reminder['title']}</h2>
        <p style="color: #434655;">Due: {reminder['due_date']}</p>
        <p style="color: #434655;">This is your scheduled reminder from the CRM platform.</p>
    </div>
    """
    
    result = await send_email_notification(
        reminder.get("user_email", user["email"]),
        f"Reminder: {reminder['title']}",
        html_content
    )
    
    await db.reminders.update_one({"_id": ObjectId(reminder_id)}, {"$set": {"sent": True}})
    return result

# ==================== STARTUP ====================
@app.on_event("startup")
async def startup_db():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.leads.create_index("email")
    await db.leads.create_index("status")
    await db.leads.create_index("assigned_owner_id")
    await db.candidates.create_index("email")
    await db.candidates.create_index("status")
    await db.candidates.create_index("job_id")
    await db.tasks.create_index("assigned_to")
    await db.tasks.create_index("due_date")
    await db.interviews.create_index("candidate_id")
    await db.interviews.create_index("scheduled_at")
    
    # Seed admin user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin user created: {admin_email}")
    
    # Create test credentials file
    import pathlib
    memory_dir = pathlib.Path("/app/memory")
    memory_dir.mkdir(exist_ok=True)
    with open(memory_dir / "test_credentials.md", "w") as f:
        f.write(f"# Test Credentials\n\n")
        f.write(f"## Admin Account\n")
        f.write(f"- Email: {admin_email}\n")
        f.write(f"- Password: {admin_password}\n")
        f.write(f"- Role: admin\n\n")
        f.write(f"## Auth Endpoints\n")
        f.write(f"- POST /api/auth/login\n")
        f.write(f"- POST /api/auth/register\n")
        f.write(f"- GET /api/auth/me\n")
        f.write(f"- POST /api/auth/logout\n")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Include router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
