-- project_preliens.project_id was missing ON DELETE CASCADE, causing project
-- deletes to fail with a FK violation when prelien rows exist for the project.
ALTER TABLE project_preliens
  DROP CONSTRAINT project_preliens_project_id_fkey,
  ADD CONSTRAINT project_preliens_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
