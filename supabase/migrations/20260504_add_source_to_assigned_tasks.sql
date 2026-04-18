-- Add source column to distinguish where a task was created from.
-- 'manage' = created from the admin Manage work page (shows in "Assigned work")
-- 'self'   = created from the user's "+ New" button (shows in "My work")
-- Default is 'manage' so all existing tasks appear under "Assigned work".

ALTER TABLE assigned_tasks
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manage'
  CHECK (source IN ('manage', 'self'));

-- Update RLS INSERT policy to also allow users to insert their own tasks
-- (source = 'self', assigned_to = themselves).
DROP POLICY IF EXISTS "assigned_tasks_insert" ON assigned_tasks;
CREATE POLICY "assigned_tasks_insert"
  ON assigned_tasks FOR INSERT TO authenticated
  WITH CHECK (
    -- Admins can insert any task
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
    -- Non-admins can insert self-created tasks assigned to themselves
    OR (assigned_to = auth.uid() AND source = 'self')
  );

-- Allow users to delete their own self-created tasks
DROP POLICY IF EXISTS "assigned_tasks_delete" ON assigned_tasks;
CREATE POLICY "assigned_tasks_delete"
  ON assigned_tasks FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
    OR (assigned_to = auth.uid() AND source = 'self')
  );
