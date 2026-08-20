-- ============================================================
-- Call Cadence — replaces the Call_-Cadence_Data.xlsx workflow
--
-- THIS IS A NEW MIGRATION. Run it in the Supabase SQL Editor before
-- deploying the backend, exactly like the Batch A one.
--
-- Purely additive: two new tables, no change to anything existing.
-- ============================================================

-- ── A dated, segmented calling list — one per spreadsheet tab ──
CREATE TABLE IF NOT EXISTS call_lists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,              -- "13th Aug - Retail"
  segment         text,                       -- Retail | Software | IT | Pharma ...
  list_date       date NOT NULL DEFAULT CURRENT_DATE,
  notes           text,
  archived        boolean NOT NULL DEFAULT false,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_lists_date
  ON call_lists (archived, list_date DESC);


-- ── One contact inside a list ──
CREATE TABLE IF NOT EXISTS call_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id         uuid NOT NULL REFERENCES call_lists(id) ON DELETE CASCADE,

  -- identity (maps to the spreadsheet columns)
  first_name      text,
  last_name       text,
  full_name       text,
  title           text,
  company         text,
  email           text,
  phone           text,
  mobile_phone    text,
  corporate_phone text,
  linkedin_url    text,

  -- enrichment carried over from Apollo exports
  seniority       text,
  industry        text,
  country         text,
  email_status    text,                       -- Verified | Guessed | ...
  email_source    text,                       -- 'Apollo' etc.

  -- prep
  tier            text,                       -- Strong | Medium | Low
  cold_call_pitch text,                       -- the bespoke opener
  do_not_call     boolean NOT NULL DEFAULT false,

  -- outcome
  disposition     text,                       -- STRUCTURED — see DISPOSITIONS in server patch
  outcome_note    text,                       -- free text, alongside not instead of
  callback_at     timestamptz,                -- real timestamp, not buried in a note
  called_at       timestamptz,
  called_by       uuid,
  called_by_name  text,
  attempts        integer NOT NULL DEFAULT 0,

  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_contacts_list
  ON call_contacts (list_id, sort_order);

-- Drives the "callbacks due" view. Partial index — only rows with a callback
-- set are ever scanned, which is a tiny fraction of the table.
CREATE INDEX IF NOT EXISTS idx_call_contacts_callback
  ON call_contacts (callback_at)
  WHERE callback_at IS NOT NULL AND disposition = 'callback';

CREATE INDEX IF NOT EXISTS idx_call_contacts_disposition
  ON call_contacts (disposition)
  WHERE disposition IS NOT NULL;


-- ── Verify ──
-- Should return 2 rows
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('call_lists','call_contacts') AND table_schema='public';
