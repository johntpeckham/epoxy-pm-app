-- ============================================================================
-- Equipment Scheduled Services — Phase 1
-- Table: equipment_scheduled_services
-- Lets users schedule upcoming services (oil change, tire rotation, etc.)
-- with optional recurrence. Completed services link to their parent via
-- parent_service_id to form a recurrence chain.
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
    CHECK (status IN ('upcoming', 'due', 'overdue', 'completed')),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  parent_service_id uuid REFERENCES equipment_scheduled_services(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equipment_scheduled_services_equipment_id
  ON equipment_scheduled_services(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_scheduled_services_status
  ON equipment_scheduled_services(status);
CREATE INDEX IF NOT EXISTS idx_equipment_scheduled_services_parent_service_id
  ON equipment_scheduled_services(parent_service_id);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE equipment_scheduled_services ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read scheduled services
CREATE POLICY "equipment_scheduled_services_select"
  ON equipment_scheduled_services
  FOR SELECT TO authenticated
  USING (true);

-- admin, foreman, office_manager can insert
CREATE POLICY "equipment_scheduled_services_insert"
  ON equipment_scheduled_services
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'foreman', 'office_manager')
    )
  );

-- admin, foreman, office_manager can update (marks complete, edit)
CREATE POLICY "equipment_scheduled_services_update"
  ON equipment_scheduled_services
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'foreman', 'office_manager')
    )
  );

-- admin, foreman can delete
CREATE POLICY "equipment_scheduled_services_delete"
  ON equipment_scheduled_services
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'foreman')
    )
  );
