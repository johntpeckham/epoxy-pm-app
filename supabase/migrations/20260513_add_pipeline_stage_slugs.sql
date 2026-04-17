-- Migration: Add immutable slug column to pipeline_stages
-- Switch estimating_projects.pipeline_stage and pipeline_history from display names to slugs

-- 1. Add slug column (nullable initially)
ALTER TABLE pipeline_stages ADD COLUMN slug TEXT;

-- 2. Backfill slugs for the 7 default stages
UPDATE pipeline_stages SET slug = 'lead' WHERE name = 'Lead';
UPDATE pipeline_stages SET slug = 'job_walk' WHERE name = 'Job Walk';
UPDATE pipeline_stages SET slug = 'estimating' WHERE name = 'Estimating';
UPDATE pipeline_stages SET slug = 'estimate_sent' WHERE name = 'Estimate Sent';
UPDATE pipeline_stages SET slug = 'follow_up' WHERE name = 'Follow Up';
UPDATE pipeline_stages SET slug = 'won' WHERE name = 'Won';
UPDATE pipeline_stages SET slug = 'lost' WHERE name = 'Lost';

-- 3. Auto-generate slugs for any custom stages (lowercase, spaces → underscores)
UPDATE pipeline_stages
SET slug = lower(replace(name, ' ', '_'))
WHERE slug IS NULL;

-- 4. Set NOT NULL + UNIQUE constraint
ALTER TABLE pipeline_stages ALTER COLUMN slug SET NOT NULL;
ALTER TABLE pipeline_stages ADD CONSTRAINT pipeline_stages_slug_unique UNIQUE (slug);

-- 5. Convert estimating_projects.pipeline_stage values from names to slugs
-- First: matched stages (via JOIN on current pipeline_stages)
UPDATE estimating_projects ep
SET pipeline_stage = ps.slug
FROM pipeline_stages ps
WHERE ep.pipeline_stage = ps.name;

-- Fallback: any remaining values (e.g. from deleted stages) get slug-ified directly
UPDATE estimating_projects
SET pipeline_stage = lower(replace(pipeline_stage, ' ', '_'))
WHERE pipeline_stage != lower(replace(pipeline_stage, ' ', '_'));

-- 6. Convert pipeline_history.from_stage from names to slugs
UPDATE pipeline_history ph
SET from_stage = ps.slug
FROM pipeline_stages ps
WHERE ph.from_stage = ps.name;

UPDATE pipeline_history
SET from_stage = lower(replace(from_stage, ' ', '_'))
WHERE from_stage IS NOT NULL
  AND from_stage != lower(replace(from_stage, ' ', '_'));

-- 7. Convert pipeline_history.to_stage from names to slugs
UPDATE pipeline_history ph
SET to_stage = ps.slug
FROM pipeline_stages ps
WHERE ph.to_stage = ps.name;

UPDATE pipeline_history
SET to_stage = lower(replace(to_stage, ' ', '_'))
WHERE to_stage != lower(replace(to_stage, ' ', '_'));
