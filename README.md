# Nexus CRM + ATS

A full-stack CRM and Applicant Tracking System for managing the complete sales and recruitment lifecycle — from lead capture and outreach through candidate sourcing, interviews, and onboarding — with built-in timesheets, expense tracking, and role-based dashboards.

## Features

### Sales CRM
- **Leads management** — list, detail, and bulk import of leads (supports up to 5,000 records)
- **Lead enrichment** — automated enrichment runs with status tracking
- **Bulk email** — compose and send campaigns to selected recipients, with test-send and sent-history
- **Sales tracker** — daily activity log, deal pipeline, weekly reviews, and monthly rollups
- **Tasks & reminders** — follow-up reminders with dismiss and send-email actions
- **Dashboards** — sales dashboard and CEO overview

### Recruitment (ATS)
- **Jobs & candidates** — job postings, candidate profiles, and hiring pipeline
- **Resume handling** — bulk ZIP resume upload, resume parsing, and masked-resume views
- **ATS matching & scoring** — parse a job description and score resumes against it
- **Interviews** — scheduling and tracking
- **Public job board** — public job listings and an apply flow via shareable links

### Operations
- **Timesheets** — weekly entry, submission, manager review/approval, and yearly summaries
- **Expenses** — expense tracking with summaries
- **Users & roles** — registration, login, role assignment, and audit logging
- **Tutorials** — in-app, per-page help content

## Architecture

| Component | Path | Stack |
|-----------|------|-------|
| Frontend | [frontend/](frontend/) | React 19, React Router, Radix UI, Tailwind CSS (CRA + craco) |
| Core API | [backend/](backend/) | FastAPI, Supabase PostgreSQL |
| Recruit service | [recruit/](recruit/) | FastAPI microservice for the ATS/recruitment module |
| Shared utilities | [shared/](shared/) | Google Drive integration, LLM helpers |
| Tests | [tests/](tests/), [frontend/tests/](frontend/tests/) | Playwright (frontend), pytest-style API tests |

Both backend services are containerized (Dockerfiles included) and deployable to Hugging Face Spaces (port 7860). The frontend deploys to Vercel.

## Getting Started

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload
```
Interactive API docs are served at `/docs`. Database schema and migrations live in [backend/schema.sql](backend/schema.sql) and [backend/migrations/](backend/migrations/).

### Recruit service
```bash
cd recruit
pip install -r requirements.txt
uvicorn server:app --reload --port 7861
```

### Frontend
```bash
cd frontend
yarn install
yarn start
```

## Deployment Notes
- In Vercel, leave `REACT_APP_API_URL` unset so the app calls `/api` and relies on the rewrite.
- Ensure [frontend/vercel.json](frontend/vercel.json) rewrites `/api/:path*` to the backend base URL.
