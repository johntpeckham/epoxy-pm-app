-- ============================================================================
-- CASCADE DELETE: Rewire all company foreign keys to companies(id) ON DELETE CASCADE
-- Run this SQL manually in the Supabase SQL editor.
-- ============================================================================

-- ============================================================================
-- Section 1: CRM tables — FK currently points to crm_companies(id)
-- Rewire to companies(id) ON DELETE CASCADE
-- ============================================================================

-- crm_contacts
ALTER TABLE crm_contacts DROP CONSTRAINT crm_contacts_company_id_fkey;
ALTER TABLE crm_contacts ADD CONSTRAINT crm_contacts_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- crm_company_addresses
ALTER TABLE crm_company_addresses DROP CONSTRAINT crm_company_addresses_company_id_fkey;
ALTER TABLE crm_company_addresses ADD CONSTRAINT crm_company_addresses_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- crm_company_tags
ALTER TABLE crm_company_tags DROP CONSTRAINT crm_company_tags_company_id_fkey;
ALTER TABLE crm_company_tags ADD CONSTRAINT crm_company_tags_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- crm_call_log
ALTER TABLE crm_call_log DROP CONSTRAINT crm_call_log_company_id_fkey;
ALTER TABLE crm_call_log ADD CONSTRAINT crm_call_log_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- crm_comments
ALTER TABLE crm_comments DROP CONSTRAINT crm_comments_company_id_fkey;
ALTER TABLE crm_comments ADD CONSTRAINT crm_comments_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- crm_files
ALTER TABLE crm_files DROP CONSTRAINT crm_files_company_id_fkey;
ALTER TABLE crm_files ADD CONSTRAINT crm_files_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- crm_appointments
ALTER TABLE crm_appointments DROP CONSTRAINT crm_appointments_company_id_fkey;
ALTER TABLE crm_appointments ADD CONSTRAINT crm_appointments_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- crm_follow_up_reminders
ALTER TABLE crm_follow_up_reminders DROP CONSTRAINT crm_follow_up_reminders_company_id_fkey;
ALTER TABLE crm_follow_up_reminders ADD CONSTRAINT crm_follow_up_reminders_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- ============================================================================
-- Section 2: Tables with ON DELETE SET NULL → ON DELETE CASCADE
-- ============================================================================

-- leads (company_id → crm_companies, rewire to companies)
ALTER TABLE leads DROP CONSTRAINT leads_company_id_fkey;
ALTER TABLE leads ADD CONSTRAINT leads_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- leads (unified_company_id)
ALTER TABLE leads DROP CONSTRAINT leads_unified_company_id_fkey;
ALTER TABLE leads ADD CONSTRAINT leads_unified_company_id_fkey
  FOREIGN KEY (unified_company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- estimates
ALTER TABLE estimates DROP CONSTRAINT estimates_company_id_fkey;
ALTER TABLE estimates ADD CONSTRAINT estimates_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- invoices
ALTER TABLE invoices DROP CONSTRAINT invoices_company_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- job_walks
ALTER TABLE job_walks DROP CONSTRAINT job_walks_company_id_fkey;
ALTER TABLE job_walks ADD CONSTRAINT job_walks_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- estimating_projects
ALTER TABLE estimating_projects DROP CONSTRAINT estimating_projects_company_id_fkey;
ALTER TABLE estimating_projects ADD CONSTRAINT estimating_projects_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- project_takeoff_projects
ALTER TABLE project_takeoff_projects DROP CONSTRAINT project_takeoff_projects_company_id_fkey;
ALTER TABLE project_takeoff_projects ADD CONSTRAINT project_takeoff_projects_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- ============================================================================
-- Section 3: Tables with no ON DELETE action (defaults to RESTRICT)
-- ============================================================================

-- check_deposits
ALTER TABLE check_deposits DROP CONSTRAINT check_deposits_company_id_fkey;
ALTER TABLE check_deposits ADD CONSTRAINT check_deposits_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- ============================================================================
-- Section 4: contacts table (already CASCADE to companies — no change needed)
-- Verified: contacts.company_id REFERENCES companies(id) ON DELETE CASCADE
-- ============================================================================
