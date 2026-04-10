-- ── TIMESHEET FEATURE MIGRATION ─────────────────────────────────────────────
-- Run this in Supabase SQL Editor

-- Add 'worker' role support (no schema change needed — role is a text column)

-- ── 1. TIMESHEETS (one per user per week) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheets (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,           -- Friday of the week (ISO: always Friday)
  status       TEXT NOT NULL DEFAULT 'draft',  -- draft | submitted | approved | rejected
  total_hours  NUMERIC(5,2) DEFAULT 0,
  note         TEXT,                    -- CEO's note on approve/reject
  submitted_at TIMESTAMPTZ,
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_timesheets_user    ON timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_week    ON timesheets(week_start);
CREATE INDEX IF NOT EXISTS idx_timesheets_status  ON timesheets(status);

-- ── 2. TIMESHEET ENTRIES (one per day) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id  UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  entry_date    DATE NOT NULL,
  hours         NUMERIC(4,2) DEFAULT 0 CHECK (hours >= 0 AND hours <= 24),
  comments      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(timesheet_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_ts_entries_timesheet ON timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_ts_entries_date      ON timesheet_entries(entry_date);
