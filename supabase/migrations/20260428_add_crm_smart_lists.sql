-- ============================================================================
-- Migration: Add crm_smart_lists for the Zone Map / Smart Call Lists feature
-- Phase 7 — saves reusable, filter-driven call lists that can be launched
-- directly into the dialer via /sales/dialer?list=<id>.
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_smart_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_count integer NOT NULL DEFAULT 25,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_smart_lists_created_by
  ON crm_smart_lists (created_by);
CREATE INDEX IF NOT EXISTS idx_crm_smart_lists_updated_at
  ON crm_smart_lists (updated_at DESC);

-- Row-level security — match the rest of the CRM tables (authenticated
-- users can manage all lists).
ALTER TABLE crm_smart_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view crm_smart_lists"
  ON crm_smart_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_smart_lists"
  ON crm_smart_lists FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_smart_lists"
  ON crm_smart_lists FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete crm_smart_lists"
  ON crm_smart_lists FOR DELETE TO authenticated USING (true);
