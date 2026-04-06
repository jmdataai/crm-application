-- ============================================================
-- NEXUS CRM — Feature Pack v3
-- Run this once in Supabase SQL Editor (after v2)
-- ============================================================

-- ── LEADS: extended data collection fields ──────────────────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_url         TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_value           NUMERIC(15,2);

-- Source tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_file          TEXT;        -- filename + sheet that data came from

-- Company enrichment
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website              TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS industry             TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_type        TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address              TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS country              TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS turnover_headcount   TEXT;

-- Outreach tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS intro_sent           DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_invite_sent      BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_invite_accepted  BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_share_date      DATE;

-- Skills / requirements
ALTER TABLE leads ADD COLUMN IF NOT EXISTS solution_skills      TEXT;

-- Additional contacts (Contact Person 2 & 3)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_person_2_name        TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_person_2_designation TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_person_2_phone       TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_person_2_email       TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_person_3_name        TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_person_3_designation TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_person_3_phone       TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_person_3_email       TEXT;

-- ── CANDIDATES: domestic / international + experience ───────

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS candidate_type      TEXT DEFAULT 'domestic';   -- 'domestic' | 'international'
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS visa_status         TEXT;                       -- for international
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS total_experience    TEXT;                       -- e.g. "10+ Years", "3.5 years"
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS relevant_experience TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location            TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS relocation          TEXT;                       -- relocation preference

-- ── Indexes for new filter columns ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_source_file     ON leads(source_file);
CREATE INDEX IF NOT EXISTS idx_leads_industry        ON leads(industry);
CREATE INDEX IF NOT EXISTS idx_leads_country         ON leads(country);
CREATE INDEX IF NOT EXISTS idx_candidates_type       ON candidates(candidate_type);
CREATE INDEX IF NOT EXISTS idx_candidates_visa       ON candidates(visa_status);
