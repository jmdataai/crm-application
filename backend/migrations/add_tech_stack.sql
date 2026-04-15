-- ============================================================
-- Migration: Add tech_stack column to candidates
-- Run this in your Supabase SQL editor (Dashboard → SQL editor)
-- ============================================================

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS tech_stack text[] DEFAULT '{}';

-- Optional: index for faster tech_stack overlap queries (@> operator)
CREATE INDEX IF NOT EXISTS idx_candidates_tech_stack
  ON candidates USING GIN (tech_stack);
