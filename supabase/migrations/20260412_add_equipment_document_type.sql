-- ============================================================================
-- Equipment Documents — document_type categorization
-- Table: equipment_documents
--
-- Adds a document_type column so the Equipment detail page can surface
-- service manuals (PDF owner's / parts / service guides) in a dedicated
-- "Service Manual" modal, while the general Documents section continues to
-- show everything else. Both document kinds stay in the same table and
-- storage bucket (equipment-documents) so infra stays simple.
-- ============================================================================

alter table equipment_documents
  add column if not exists document_type text not null default 'general';

-- Re-create the CHECK constraint idempotently so the allowed values are
-- always in sync with the app code.
alter table equipment_documents
  drop constraint if exists equipment_documents_document_type_check;
alter table equipment_documents
  add constraint equipment_documents_document_type_check
  check (document_type in ('general', 'manual'));

-- Speeds up the per-equipment per-type filter the UI issues.
create index if not exists idx_equipment_documents_equipment_id_type
  on equipment_documents (equipment_id, document_type);
