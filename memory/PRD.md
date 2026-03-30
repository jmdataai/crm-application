# CRM + ATS Platform PRD

## Original Problem Statement
Build a complete CRM platform for a startup with two business functions:
1. Sales of AI products (Sales CRM)
2. Recruitment / candidate management (ATS)

## Architecture
- **Backend**: FastAPI with MongoDB
- **Frontend**: React with Tailwind CSS, Shadcn UI components
- **Design System**: Digital Curator (Inter font, Action Blue #004ac6, Tertiary Green #006243)
- **Auth**: JWT with httpOnly cookies
- **Email**: Resend (simulated when API key is placeholder)

## User Personas
1. **Admin** - Full access to all features
2. **Sales Rep** - Access to Sales module (leads, tasks, reminders)
3. **Recruiter** - Access to Recruitment module (jobs, candidates, pipeline)
4. **Manager** - Access to both modules with elevated permissions

## Core Requirements (Static)
- JWT-based authentication with role-based access
- Sales CRM with lead management, CSV import, tasks, reminders
- Recruitment ATS with job postings, candidate pipeline, interviews
- Status tracking with history for leads and candidates
- Activity logging for all interactions
- Email notifications via Resend

## What's Been Implemented (March 30, 2026)
### Backend
- ✅ JWT Authentication (login, register, logout, me)
- ✅ User management with roles (admin, manager, sales_rep, recruiter)
- ✅ Leads CRUD with status tracking and history
- ✅ CSV/Excel import for leads with validation
- ✅ Activities logging system
- ✅ Tasks management with priorities
- ✅ Reminders with email notification capability
- ✅ Jobs CRUD for recruitment
- ✅ Candidates CRUD with status tracking
- ✅ Interview scheduling and management
- ✅ Dashboard APIs for both modules
- ✅ Pipeline API for kanban view

### Frontend
- ✅ Login/Register pages with Digital Curator design
- ✅ Sales Dashboard with stats widgets
- ✅ Leads list with search/filter/sort
- ✅ Lead detail page with activity timeline
- ✅ CSV/Excel import page
- ✅ Tasks management page
- ✅ Reminders page
- ✅ Recruitment Dashboard
- ✅ Jobs list and management
- ✅ Candidates list
- ✅ Candidate detail page
- ✅ Pipeline (Kanban) view
- ✅ Interviews management
- ✅ Module switcher (Sales/Recruitment)

## Prioritized Backlog

### P0 (Critical)
- All critical features implemented ✅

### P1 (High Priority)
- [ ] Bulk actions for leads (delete, status change)
- [ ] Advanced search with date ranges
- [ ] Job detail page with full description
- [ ] Resume upload for candidates

### P2 (Medium Priority)
- [ ] Email templates for notifications
- [ ] Calendar integration for interviews
- [ ] Export leads/candidates to CSV
- [ ] User management (admin panel)

### P3 (Nice to Have)
- [ ] Dashboard charts with Recharts
- [ ] Dark mode support
- [ ] Mobile responsive improvements
- [ ] Notification center

## Next Tasks
1. Add Resend API key for real email notifications
2. Implement bulk actions for leads
3. Add job detail page
4. Add resume upload with file storage
5. Implement export functionality

## Test Credentials
- Admin: admin@example.com / Admin123!
