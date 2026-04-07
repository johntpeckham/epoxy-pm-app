-- ============================================================================
-- Pre-Lien Notice System — Phase 1
-- Tables: prelien_templates, project_preliens
-- ============================================================================

-- 1. prelien_templates
CREATE TABLE IF NOT EXISTS prelien_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  body text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. project_preliens
CREATE TABLE IF NOT EXISTS project_preliens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  template_id uuid REFERENCES prelien_templates(id),
  template_name text,
  form_data jsonb,
  pdf_url text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_preliens_project_id ON project_preliens(project_id);
CREATE INDEX IF NOT EXISTS idx_project_preliens_deleted_at ON project_preliens(deleted_at);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE prelien_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_preliens ENABLE ROW LEVEL SECURITY;

-- prelien_templates: all authenticated can read
CREATE POLICY "prelien_templates_select" ON prelien_templates
  FOR SELECT TO authenticated USING (true);

-- prelien_templates: admin, office_manager, salesman can insert
CREATE POLICY "prelien_templates_insert" ON prelien_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

-- prelien_templates: admin, office_manager, salesman can update
CREATE POLICY "prelien_templates_update" ON prelien_templates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

-- prelien_templates: admin, office_manager, salesman can delete
CREATE POLICY "prelien_templates_delete" ON prelien_templates
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman')
    )
  );

-- project_preliens: all authenticated can read
CREATE POLICY "project_preliens_select" ON project_preliens
  FOR SELECT TO authenticated USING (true);

-- project_preliens: admin, office_manager, salesman, foreman can insert
CREATE POLICY "project_preliens_insert" ON project_preliens
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman', 'foreman')
    )
  );

-- project_preliens: admin, office_manager, salesman, foreman can update
CREATE POLICY "project_preliens_update" ON project_preliens
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'salesman', 'foreman')
    )
  );

-- project_preliens: admin, office_manager can delete
CREATE POLICY "project_preliens_delete" ON project_preliens
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- ============================================================================
-- Default Template Seed
-- ============================================================================

INSERT INTO prelien_templates (name, description, body)
VALUES (
  'California Preliminary 20-Day Notice',
  'Standard preliminary 20-day notice per California Civil Code §§ 8200-8216',
  '{"blocks":[{"id":"b1","type":"header","content":"PRELIMINARY 20-DAY NOTICE","color":"#000000"},{"id":"b2","type":"sub_header","content":"Project Documentation – California Civil Code Compliance","color":"#000000"},{"id":"b3","type":"body","content":"{{company_name}} is providing the attached Preliminary 20-Day Notice in accordance with California Civil Code §§ 8200–8216.","color":"#000000"},{"id":"b4","type":"body","content":"This notice is a standard statutory requirement intended to preserve lien rights on construction projects within the State of California. It is not a reflection of project performance, payment status, or the integrity of any party involved. As a matter of company policy, {{company_name}} issues this notice on all applicable projects to ensure compliance with state law and to maintain proper documentation.","color":"#000000"},{"id":"b5","type":"body","content":"We appreciate the opportunity to work on this project and look forward to its successful completion. If you have any questions regarding this notice, please feel free to contact our office.","color":"#000000"},{"id":"b6","type":"divider","content":"","color":"#000000"},{"id":"b7","type":"header","content":"CALIFORNIA PRELIMINARY 20-DAY NOTICE","color":"#000000"},{"id":"b8","type":"sub_header","content":"(Civil Code §§ 8200–8216)","color":"#000000"},{"id":"b9","type":"header","content":"TO (Owner or Reputed Owner):","color":"#000000"},{"id":"b10","type":"body","content":"Name: {{owner_name}}\nAddress: {{owner_address}}","color":"#000000"},{"id":"b11","type":"header","content":"AND TO (Direct Contractor – if applicable):","color":"#000000"},{"id":"b12","type":"body","content":"Name: {{direct_contractor_name}}\nAddress: {{direct_contractor_address}}","color":"#000000"},{"id":"b13","type":"header","content":"AND TO (Construction Lender – if applicable):","color":"#000000"},{"id":"b14","type":"body","content":"Name: {{construction_lender_name}}\nAddress: {{construction_lender_address}}","color":"#000000"},{"id":"b15","type":"header","content":"FROM (Claimant):","color":"#000000"},{"id":"b16","type":"body","content":"{{company_name}}\nAddress: {{company_address}}\nPhone: {{company_phone}}\nEmail: {{company_email}}\nContractor License No.: {{cslb_license}}","color":"#000000"},{"id":"b17","type":"divider","content":"","color":"#000000"},{"id":"b18","type":"header","content":"Hiring Party (Party Who Contracted for Our Work):","color":"#000000"},{"id":"b19","type":"body","content":"Name: {{hiring_party_name}}\nAddress: {{hiring_party_address}}\nRelationship: {{hiring_party_relationship}}","color":"#000000"},{"id":"b20","type":"header","content":"Project Information:","color":"#000000"},{"id":"b21","type":"body","content":"Project Name: {{project_name}}\nProject Address: {{project_address}}\nDescription of Work: {{description_of_work}}\nEstimated Total Price: ${{estimated_total_price}}","color":"#000000"},{"id":"b22","type":"divider","content":"","color":"#000000"},{"id":"b23","type":"header","content":"IMPORTANT NOTICE TO PROPERTY OWNER","color":"#000000"},{"id":"b24","type":"body","content":"Even though you have paid your contractor in full, if the person or firm that has given you this notice is not paid in full for labor, services, equipment, or materials provided or to be provided to your construction project, a mechanics lien may be placed on your property. Foreclosure of the mechanics lien may lead to loss of all or part of your property. You may wish to protect yourself against this by (1) requiring your contractor to provide a signed release by the person or firm that has given you this notice before making payment to your contractor, or (2) any other method that is appropriate under the circumstances.","color":"#000000"},{"id":"b25","type":"body","content":"This notice is required by law to be served by the undersigned as a statement of your legal rights. This notice is not a reflection on the integrity of any contractor or subcontractor.","color":"#000000"},{"id":"b26","type":"body","content":"Date: {{date}}","color":"#000000"},{"id":"b27","type":"signature","content":"","color":"#000000","signatureData":"","signatureName":"","signatureTitle":""}],"headerDivider":{"enabled":true,"color":"#000000"}}'
);
