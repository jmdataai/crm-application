-- ============================================================
-- Nexus CRM — Reset Demo Data
-- Run in Supabase Dashboard → SQL Editor after each demo
-- ============================================================

-- Wipes all business data (leads, candidates, jobs, tasks, etc.)
-- while keeping your user accounts intact.

truncate table interviews               restart identity cascade;
truncate table candidate_status_history restart identity cascade;
truncate table lead_status_history      restart identity cascade;
truncate table activities               restart identity cascade;
truncate table reminders                restart identity cascade;
truncate table tasks                    restart identity cascade;
truncate table imports                  restart identity cascade;
truncate table candidates               restart identity cascade;
truncate table jobs                     restart identity cascade;
truncate table leads                    restart identity cascade;

-- ✅ Done. Users are preserved. All leads/candidates/jobs/tasks cleared.

-- ============================================================
-- FULL RESET (optional) — also wipes users
-- Only use this if you want to start completely from scratch.
-- After running, restart the backend to re-seed the admin user.
-- ============================================================
-- truncate table users restart identity cascade;
