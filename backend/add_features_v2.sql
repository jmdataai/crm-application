-- ============================================================
-- NEXUS CRM — Feature Pack v2
-- Run this once in Supabase SQL Editor
-- ============================================================

-- 1. Deal value on leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC(15,2) DEFAULT NULL;

-- 2. Candidate ↔ Lead submissions
CREATE TABLE IF NOT EXISTS candidate_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID REFERENCES leads(id)      ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  status       VARCHAR(50) DEFAULT 'submitted',  -- submitted | feedback_pending | accepted | rejected
  notes        TEXT,
  created_by   UUID REFERENCES users(id)      ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS cs_lead_idx      ON candidate_submissions(lead_id);
CREATE INDEX IF NOT EXISTS cs_candidate_idx ON candidate_submissions(candidate_id);

-- 3. Audit / activity log (tamper-proof — no delete endpoint ever exposed)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email  TEXT,
  user_name   TEXT,
  action      VARCHAR(50) NOT NULL,  -- login|login_failed|logout|view|create|update|delete|export
  entity_type VARCHAR(50),           -- lead|candidate|job|user|settings
  entity_id   TEXT,
  entity_name TEXT,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS al_user_idx    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS al_time_idx    ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS al_action_idx  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS al_entity_idx  ON audit_logs(entity_type, entity_id);

-- 4. RLS: only admin can SELECT audit_logs, nobody can DELETE
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_read_admin  ON audit_logs;
DROP POLICY IF EXISTS audit_insert_all  ON audit_logs;
CREATE POLICY audit_insert_all  ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY audit_read_admin  ON audit_logs FOR SELECT USING (true);
-- (Actual admin-only enforcement is handled in the API layer)

