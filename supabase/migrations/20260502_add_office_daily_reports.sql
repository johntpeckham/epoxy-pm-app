-- ============================================================================
-- Migration: 20260502_add_office_daily_reports.sql
-- Purpose:  office_daily_reports table for office workers' end-of-day
--           reports (clock in/out, work summary, sales metrics).
-- ============================================================================

-- ============================================================================
-- office_daily_reports table
-- ============================================================================

CREATE TABLE IF NOT EXISTS office_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  clock_in time,
  clock_out time,
  work_summary text,
  sales_not_applicable boolean NOT NULL DEFAULT false,
  sales_calls integer NOT NULL DEFAULT 0,
  sales_emails integer NOT NULL DEFAULT 0,
  sales_appointments integer NOT NULL DEFAULT 0,
  sales_texts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_daily_reports_user_date_unique UNIQUE (user_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_office_daily_reports_user_id
  ON office_daily_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_office_daily_reports_report_date
  ON office_daily_reports (report_date DESC);

-- ============================================================================
-- updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION office_daily_reports_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS office_daily_reports_updated_at ON office_daily_reports;
CREATE TRIGGER office_daily_reports_updated_at
  BEFORE UPDATE ON office_daily_reports
  FOR EACH ROW EXECUTE FUNCTION office_daily_reports_set_updated_at();

-- ============================================================================
-- RLS policies
-- ============================================================================

ALTER TABLE office_daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_daily_reports_select" ON office_daily_reports;
DROP POLICY IF EXISTS "office_daily_reports_insert" ON office_daily_reports;
DROP POLICY IF EXISTS "office_daily_reports_update" ON office_daily_reports;
DROP POLICY IF EXISTS "office_daily_reports_delete" ON office_daily_reports;

-- SELECT: users see their own; admins see all
CREATE POLICY "office_daily_reports_select"
  ON office_daily_reports
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- INSERT: authenticated users insert their own report
CREATE POLICY "office_daily_reports_insert"
  ON office_daily_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: users update their own; admins update any
CREATE POLICY "office_daily_reports_update"
  ON office_daily_reports
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- DELETE: admins only
CREATE POLICY "office_daily_reports_delete"
  ON office_daily_reports
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
