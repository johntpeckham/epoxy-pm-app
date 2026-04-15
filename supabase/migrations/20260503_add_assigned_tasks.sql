-- ============================================================================
-- assigned_tasks table (recurring/one-time task templates assigned to users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS assigned_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  task_type text NOT NULL CHECK (task_type IN ('daily', 'weekly', 'one_time')),
  day_of_week integer CHECK (day_of_week IS NULL OR (day_of_week BETWEEN 0 AND 6)),
  specific_date date,
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assigned_tasks_weekly_requires_day CHECK (
    task_type <> 'weekly' OR day_of_week IS NOT NULL
  ),
  CONSTRAINT assigned_tasks_one_time_requires_date CHECK (
    task_type <> 'one_time' OR specific_date IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_assigned_tasks_assigned_to
  ON assigned_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_type
  ON assigned_tasks (task_type);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_specific_date
  ON assigned_tasks (specific_date);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_is_active
  ON assigned_tasks (is_active);

-- updated_at trigger
CREATE OR REPLACE FUNCTION assigned_tasks_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assigned_tasks_updated_at ON assigned_tasks;
CREATE TRIGGER assigned_tasks_updated_at
  BEFORE UPDATE ON assigned_tasks
  FOR EACH ROW EXECUTE FUNCTION assigned_tasks_set_updated_at();

-- RLS
ALTER TABLE assigned_tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: users see tasks assigned to them; admins see all
DROP POLICY IF EXISTS "assigned_tasks_select" ON assigned_tasks;
CREATE POLICY "assigned_tasks_select"
  ON assigned_tasks FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- INSERT: admins only
DROP POLICY IF EXISTS "assigned_tasks_insert" ON assigned_tasks;
CREATE POLICY "assigned_tasks_insert"
  ON assigned_tasks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- UPDATE: admins only
DROP POLICY IF EXISTS "assigned_tasks_update" ON assigned_tasks;
CREATE POLICY "assigned_tasks_update"
  ON assigned_tasks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- DELETE: admins only
DROP POLICY IF EXISTS "assigned_tasks_delete" ON assigned_tasks;
CREATE POLICY "assigned_tasks_delete"
  ON assigned_tasks FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ============================================================================
-- assigned_task_completions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS assigned_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES assigned_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completion_date date NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  note text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assigned_task_completions_unique UNIQUE (task_id, user_id, completion_date)
);

CREATE INDEX IF NOT EXISTS idx_assigned_task_completions_user_date
  ON assigned_task_completions (user_id, completion_date);
CREATE INDEX IF NOT EXISTS idx_assigned_task_completions_task_id
  ON assigned_task_completions (task_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION assigned_task_completions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assigned_task_completions_updated_at ON assigned_task_completions;
CREATE TRIGGER assigned_task_completions_updated_at
  BEFORE UPDATE ON assigned_task_completions
  FOR EACH ROW EXECUTE FUNCTION assigned_task_completions_set_updated_at();

-- RLS
ALTER TABLE assigned_task_completions ENABLE ROW LEVEL SECURITY;

-- SELECT: users see their own; admins see all
DROP POLICY IF EXISTS "assigned_task_completions_select" ON assigned_task_completions;
CREATE POLICY "assigned_task_completions_select"
  ON assigned_task_completions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- INSERT: authenticated users insert their own records only
DROP POLICY IF EXISTS "assigned_task_completions_insert" ON assigned_task_completions;
CREATE POLICY "assigned_task_completions_insert"
  ON assigned_task_completions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: users update their own
DROP POLICY IF EXISTS "assigned_task_completions_update" ON assigned_task_completions;
CREATE POLICY "assigned_task_completions_update"
  ON assigned_task_completions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- DELETE: admins only
DROP POLICY IF EXISTS "assigned_task_completions_delete" ON assigned_task_completions;
CREATE POLICY "assigned_task_completions_delete"
  ON assigned_task_completions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
