-- Add dynamic_fields jsonb column to all form-related tables.
-- This stores custom field metadata (label, value, type, order) for fields
-- added via the Form Management admin UI, so they can be displayed in
-- preview/expand views and included in PDF downloads.

-- feed_posts: used by daily_report, jsa_report, receipt, timecard
ALTER TABLE feed_posts
ADD COLUMN IF NOT EXISTS dynamic_fields jsonb DEFAULT '[]'::jsonb;

-- tasks: used by task form
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS dynamic_fields jsonb DEFAULT '[]'::jsonb;

-- project_reports: used by project report form
ALTER TABLE project_reports
ADD COLUMN IF NOT EXISTS dynamic_fields jsonb DEFAULT '[]'::jsonb;
