-- Add assigned_to column to leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill existing leads: set assigned_to from created_by where NULL
UPDATE leads SET assigned_to = created_by WHERE assigned_to IS NULL AND created_by IS NOT NULL;

-- Add composite index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_leads_company_id_assigned_to ON leads (company_id, assigned_to);

-- Add assigned_to column to job_walks table
ALTER TABLE job_walks
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill existing job_walks: set assigned_to from created_by where NULL
UPDATE job_walks SET assigned_to = created_by WHERE assigned_to IS NULL AND created_by IS NOT NULL;

-- Add composite index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_job_walks_company_id_assigned_to ON job_walks (company_id, assigned_to);
