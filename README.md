---
title: Nexus CRM Backend
emoji: 🚀
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---

# Nexus CRM + ATS — Backend API

FastAPI backend for Nexus CRM. Connected to Supabase PostgreSQL.

## Endpoints

- `GET /api/health` — health check
- `POST /api/auth/login` — login
- `POST /api/auth/register` — register
- Full API docs at `/docs`

Need to add more document

## Frontend Deployment Notes
- In Vercel, leave REACT_APP_API_URL unset so the app uses /api with the rewrite.
- Ensure ercel.json rewrites /api/:path* to the backend base URL.

