-- ============================================================
-- Nexus CRM — Add Roles Patch
-- Run this in Supabase SQL Editor (one-time, safe to re-run)
-- ============================================================

-- 1. Add role column to users table
alter table users
  add column if not exists role text not null default 'sales'
  check (role in ('admin', 'sales', 'viewer'));

-- 2. Set your developer/admin account (replace with your actual email)
update users set role = 'admin'  where email = 'ravi@jmdatatalent.com';  -- your admin email

-- 3. Verify
select id, email, name, role, created_at from users order by created_at;

-- ============================================================
-- After running this:
--   - All existing users default to 'sales' role
--   - Update your developer email to 'admin' above
--   - New users created via /api/auth/register default to 'sales'
--   - Use /api/users/{id}/role endpoint to change roles
-- ============================================================
