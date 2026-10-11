-- ============================================================
-- Hiring Intel — Irish Data & AI hiring signals + Apollo ICP contacts
--
-- NEW MIGRATION. Run it in the Supabase SQL Editor BEFORE deploying the
-- backend (SQL first, code second). Purely additive: three new tables,
-- nothing existing is altered. Safe to re-run (IF NOT EXISTS everywhere).
--
-- Storage discipline (the Supabase free tier is tight):
--   * The app keeps only the 5 most recent runs; older runs are deleted on
--     completion and ON DELETE CASCADE removes their jobs and contacts.
--   * Job descriptions are never stored — only title, link and metadata.
-- ============================================================

-- ── One row per scan ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hiring_intel_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','completed','failed','cancelled')),
  stage             text,                         -- discover | qualify | websites | contacts | save | done
  progress          smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  params            jsonb NOT NULL DEFAULT '{}'::jsonb,
  stats             jsonb NOT NULL DEFAULT '{}'::jsonb,
  events            jsonb NOT NULL DEFAULT '[]'::jsonb,   -- last ~60 log lines for the live feed
  error             text,
  cancel_requested  boolean NOT NULL DEFAULT false,
  jobs_count        integer NOT NULL DEFAULT 0,
  companies_count   integer NOT NULL DEFAULT 0,
  contacts_count    integer NOT NULL DEFAULT 0,
  triggered_by      uuid,
  triggered_by_name text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  heartbeat_at      timestamptz NOT NULL DEFAULT now()
);

-- Apollo company lookups cost a credit each. Every run stores what it learned
-- (headcount, HQ, domain — or "not in Apollo") so the next run can skip the
-- lookup. Bounded: ~1000 small entries per run, 5 runs kept.
ALTER TABLE hiring_intel_runs
  ADD COLUMN IF NOT EXISTS company_cache jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_hiring_intel_runs_created
  ON hiring_intel_runs (created_at DESC);

-- At most ONE queued/running scan at any time. A double-click, two browser
-- tabs, or two users pressing "Run scan" together all hit this index and get
-- a clean 409 instead of two scans burning Apollo credits in parallel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hiring_intel_one_active
  ON hiring_intel_runs ((true))
  WHERE status IN ('queued','running');


-- ── Every qualifying job opening found in a run ──────────────
CREATE TABLE IF NOT EXISTS hiring_intel_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid NOT NULL REFERENCES hiring_intel_runs(id) ON DELETE CASCADE,
  fingerprint      text NOT NULL,          -- company_key | normalised title
  company_key      text NOT NULL,
  company_name     text NOT NULL,
  title            text NOT NULL,
  category         text,                   -- Data Engineering | Data Science | AI / ML | Analytics / BI | Data Leadership | Data Governance
  employment_type  text,                   -- Permanent | Contract | Unspecified
  location         text,
  job_url          text,
  other_urls       jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources          text[] NOT NULL DEFAULT '{}',
  posted_at        date,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  is_new           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- the same opening seen on LinkedIn AND the company's own careers page is ONE row
  CONSTRAINT uq_hiring_intel_job UNIQUE (run_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_hiring_intel_jobs_run
  ON hiring_intel_jobs (run_id, company_key);


-- ── The deliverable sheet: one row per decision-maker per company ──
CREATE TABLE IF NOT EXISTS hiring_intel_leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES hiring_intel_runs(id) ON DELETE CASCADE,
  company_key        text NOT NULL,
  company_name       text NOT NULL,
  company_domain     text,
  company_website    text,
  company_linkedin   text,
  company_size       integer,
  company_industry   text,
  company_city       text,
  company_phone      text,
  apollo_org_id      text,
  person_key         text NOT NULL DEFAULT '',   -- apollo person id, '' for a company-only row
  apollo_person_id   text,
  person_name        text,
  person_title       text,
  icp_role           text,                       -- Data Head | CTO | CEO | Founder | Co-Founder
  email              text,
  email_status       text,
  phone              text,
  phone_status       text,                       -- found | pending | none | not_requested
  phone_request_id   text,
  linkedin_url       text,
  hiring_for         text[] NOT NULL DEFAULT '{}',
  job_links          text[] NOT NULL DEFAULT '{}',
  employment_types   text[] NOT NULL DEFAULT '{}',
  categories         text[] NOT NULL DEFAULT '{}',
  is_new_company     boolean NOT NULL DEFAULT true,
  crm_lead_id        uuid,                       -- set when pushed into the Leads table
  enriched_at        timestamptz,                -- when Apollo enrichment actually returned this person
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- one person appears once per run even if the company has five open roles
  CONSTRAINT uq_hiring_intel_lead UNIQUE (run_id, company_key, person_key)
);

CREATE INDEX IF NOT EXISTS idx_hiring_intel_leads_run
  ON hiring_intel_leads (run_id, company_key);

ALTER TABLE hiring_intel_leads ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

-- Lets a new run re-use contact data already paid for in a previous run
-- instead of spending Apollo credits on the same person again.
CREATE INDEX IF NOT EXISTS idx_hiring_intel_leads_person
  ON hiring_intel_leads (apollo_person_id)
  WHERE apollo_person_id IS NOT NULL;


-- ── RLS: the backend uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. ──
-- Enabling RLS with no policies blocks the public anon key from reading
-- contact data directly (same approach as audit_logs).
ALTER TABLE hiring_intel_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hiring_intel_jobs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hiring_intel_leads ENABLE ROW LEVEL SECURITY;

-- ── Rollback (run manually only if you need to remove the feature) ──
-- DROP TABLE IF EXISTS hiring_intel_leads;
-- DROP TABLE IF EXISTS hiring_intel_jobs;
-- DROP TABLE IF EXISTS hiring_intel_runs;
