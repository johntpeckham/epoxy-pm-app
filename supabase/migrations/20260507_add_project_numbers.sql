-- ============================================================================
-- Estimating — Phase 4: Project numbers
-- Adds project_number TEXT column to estimating_projects
-- Adds user_project_sequences table (per-user auto-increment config)
-- Run this SQL in the Supabase SQL editor. Do NOT auto-run.
-- ============================================================================

-- 1. project_number column on estimating_projects
ALTER TABLE estimating_projects
  ADD COLUMN IF NOT EXISTS project_number text;

CREATE INDEX IF NOT EXISTS idx_estimating_projects_project_number
  ON estimating_projects (project_number);

-- 2. user_project_sequences
CREATE TABLE IF NOT EXISTS user_project_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prefix text NOT NULL DEFAULT '',
  suffix text NOT NULL DEFAULT '',
  current_number integer NOT NULL DEFAULT 999,
  format_example text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_project_sequences_user_id_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_project_sequences_user_id
  ON user_project_sequences (user_id);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE user_project_sequences ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read sequences (needed to assign next number)
CREATE POLICY "Authenticated users can view user project sequences"
  ON user_project_sequences FOR SELECT
  TO authenticated
  USING (true);

-- A user may insert/update their own row (so auto-assignment works on creation)
CREATE POLICY "Users can insert their own project sequence"
  ON user_project_sequences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own project sequence"
  ON user_project_sequences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins can manage anyone's sequence (Sales Management settings)
CREATE POLICY "Admins can insert any project sequence"
  ON user_project_sequences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update any project sequence"
  ON user_project_sequences FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete any project sequence"
  ON user_project_sequences FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================================================
-- updated_at trigger on user_project_sequences
-- ============================================================================

CREATE OR REPLACE FUNCTION user_project_sequences_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_project_sequences_updated_at ON user_project_sequences;
CREATE TRIGGER user_project_sequences_updated_at
  BEFORE UPDATE ON user_project_sequences
  FOR EACH ROW EXECUTE FUNCTION user_project_sequences_set_updated_at();
