-- ============================================================================
-- Equipment Scheduled Services
-- Table: equipment_scheduled_services
--
-- Lets users schedule upcoming services (oil change, tire rotation, etc.)
-- with optional recurrence. Completed services link to their parent via
-- parent_service_id to form a recurrence chain. Each scheduled service may
-- optionally be linked to an office_task via task_id, so an assigned user
-- sees the work on their My Work page.
--
-- Combined Phase 1 (table + indexes + RLS), Phase 2 (task_id column), and
-- Phase 3 (in_progress status + foreman write access) into a single
-- idempotent migration that can be re-run safely.
-- ============================================================================

CREATE TABLE IF NOT EXISTS equipment_scheduled_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  description text NOT NULL,
  scheduled_date date NOT NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_interval integer,
  recurrence_unit text CHECK (recurrence_unit IN ('weeks', 'months')),
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'in_progress', 'due', 'overdue', 'completed')),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  parent_service_id uuid REFERENCES equipment_scheduled_services(id) ON DELETE SET NULL,
  task_id uuid REFERENCES office_tasks(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Phase 2 backfill: add task_id if the table pre-dates Phase 2.
ALTER TABLE equipment_scheduled_services
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES office_tasks(id) ON DELETE SET NULL;

-- Phase 3 backfill: widen the status CHECK constraint to include 'in_progress'
-- ("Working on it"). Drop-and-re-add so existing installs are updated in place.
ALTER TABLE equipment_scheduled_services
  DROP CONSTRAINT IF EXISTS equipment_scheduled_services_status_check;
ALTER TABLE equipment_scheduled_services
  ADD CONSTRAINT equipment_scheduled_services_status_check
  CHECK (status IN ('upcoming', 'in_progress', 'due', 'overdue', 'completed'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equipment_scheduled_services_equipment_id
  ON equipment_scheduled_services(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_scheduled_services_status
  ON equipment_scheduled_services(status);
CREATE INDEX IF NOT EXISTS idx_equipment_scheduled_services_parent_service_id
  ON equipment_scheduled_services(parent_service_id);
CREATE INDEX IF NOT EXISTS idx_equipment_scheduled_services_task_id
  ON equipment_scheduled_services(task_id);

-- ============================================================================
-- RLS — read open to all authenticated users; write access for admin,
-- office_manager, and foreman (matches the equipment detail UI canManage
-- gate which allows foreman to manage scheduled services).
-- ============================================================================

ALTER TABLE equipment_scheduled_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_scheduled_services_select" ON equipment_scheduled_services;
DROP POLICY IF EXISTS "equipment_scheduled_services_insert" ON equipment_scheduled_services;
DROP POLICY IF EXISTS "equipment_scheduled_services_update" ON equipment_scheduled_services;
DROP POLICY IF EXISTS "equipment_scheduled_services_delete" ON equipment_scheduled_services;

CREATE POLICY "equipment_scheduled_services_select"
  ON equipment_scheduled_services
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "equipment_scheduled_services_insert"
  ON equipment_scheduled_services
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'foreman')
    )
  );

CREATE POLICY "equipment_scheduled_services_update"
  ON equipment_scheduled_services
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'foreman')
    )
  );

CREATE POLICY "equipment_scheduled_services_delete"
  ON equipment_scheduled_services
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'foreman')
    )
  );
