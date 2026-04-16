-- ============================================================================
-- Estimating — Phase 2: Pipeline visual + Reminders system
-- Adds pipeline_stages, pipeline_history, estimating_reminders, reminder_rules
-- Run this SQL in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

-- 1. pipeline_stages — configurable stages
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer NOT NULL,
  color text NOT NULL DEFAULT '#5DCAA5',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_display_order
  ON pipeline_stages (display_order);

-- Seed default pipeline stages
INSERT INTO pipeline_stages (name, display_order, color, is_default, is_active)
VALUES
  ('Lead',          1, '#F59E0B', true,  true),
  ('Job Walk',      2, '#EAB308', false, true),
  ('Estimating',    3, '#F97316', false, true),
  ('Estimate Sent', 4, '#FB923C', false, true),
  ('Follow Up',     5, '#FACC15', false, true),
  ('Won',           6, '#22C55E', false, true),
  ('Lost',          7, '#9CA3AF', false, true)
ON CONFLICT DO NOTHING;

-- 2. pipeline_history — log stage changes
CREATE TABLE IF NOT EXISTS pipeline_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES estimating_projects(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_history_project_id
  ON pipeline_history (project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_history_created_at
  ON pipeline_history (created_at DESC);

-- 3. estimating_reminders
CREATE TABLE IF NOT EXISTS estimating_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES estimating_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date timestamptz NOT NULL,
  reminder_type text NOT NULL
    CHECK (reminder_type IN ('auto', 'manual')),
  trigger_event text
    CHECK (trigger_event IN ('estimate_sent', 'stage_change') OR trigger_event IS NULL),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'snoozed', 'dismissed')),
  snoozed_until timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimating_reminders_project_id
  ON estimating_reminders (project_id);
CREATE INDEX IF NOT EXISTS idx_estimating_reminders_due_date
  ON estimating_reminders (due_date);
CREATE INDEX IF NOT EXISTS idx_estimating_reminders_status
  ON estimating_reminders (status);

-- 4. reminder_rules — configurable auto-reminder timing
CREATE TABLE IF NOT EXISTS reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_event text NOT NULL,
  days_after integer NOT NULL,
  title_template text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default reminder rules
INSERT INTO reminder_rules (trigger_event, days_after, title_template, is_active)
VALUES
  ('estimate_sent',  3, 'Follow up — 3 day reminder',  true),
  ('estimate_sent',  7, 'Follow up — 1 week reminder', true),
  ('estimate_sent', 14, 'Follow up — 2 week reminder', true)
ON CONFLICT DO NOTHING;

-- 5. Update default pipeline_stage on existing rows to 'Estimating'
UPDATE estimating_projects
  SET pipeline_stage = 'Estimating'
  WHERE pipeline_stage IS NULL
     OR pipeline_stage = ''
     OR pipeline_stage = 'estimating';

ALTER TABLE estimating_projects
  ALTER COLUMN pipeline_stage SET DEFAULT 'Estimating';

-- ============================================================================
-- RLS policies
-- ============================================================================

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pipeline stages"
  ON pipeline_stages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert pipeline stages"
  ON pipeline_stages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update pipeline stages"
  ON pipeline_stages FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete pipeline stages"
  ON pipeline_stages FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE pipeline_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pipeline history"
  ON pipeline_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert pipeline history"
  ON pipeline_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update pipeline history"
  ON pipeline_history FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete pipeline history"
  ON pipeline_history FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE estimating_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view estimating reminders"
  ON estimating_reminders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert estimating reminders"
  ON estimating_reminders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update estimating reminders"
  ON estimating_reminders FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete estimating reminders"
  ON estimating_reminders FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE reminder_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view reminder rules"
  ON reminder_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert reminder rules"
  ON reminder_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update reminder rules"
  ON reminder_rules FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete reminder rules"
  ON reminder_rules FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION pipeline_stages_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pipeline_stages_updated_at ON pipeline_stages;
CREATE TRIGGER pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION pipeline_stages_set_updated_at();

CREATE OR REPLACE FUNCTION estimating_reminders_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS estimating_reminders_updated_at ON estimating_reminders;
CREATE TRIGGER estimating_reminders_updated_at
  BEFORE UPDATE ON estimating_reminders
  FOR EACH ROW EXECUTE FUNCTION estimating_reminders_set_updated_at();
