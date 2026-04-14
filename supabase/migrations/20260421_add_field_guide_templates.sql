-- Field Guide Templates
-- Run this SQL in the Supabase SQL editor.

-- ══════════════════════════════════════════════════════════
-- 1. field_guide_templates
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS field_guide_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE field_guide_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view field guide templates"
  ON field_guide_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert field guide templates"
  ON field_guide_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update field guide templates"
  ON field_guide_templates FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete field guide templates"
  ON field_guide_templates FOR DELETE
  TO authenticated
  USING (true);

-- Auto-update updated_at on field_guide_templates
CREATE OR REPLACE FUNCTION update_field_guide_templates_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS field_guide_templates_updated_at ON field_guide_templates;
CREATE TRIGGER field_guide_templates_updated_at
  BEFORE UPDATE ON field_guide_templates
  FOR EACH ROW EXECUTE FUNCTION update_field_guide_templates_updated_at();

-- ══════════════════════════════════════════════════════════
-- 2. field_guide_sections
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS field_guide_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES field_guide_templates(id) ON DELETE CASCADE,
  heading text NOT NULL,
  body text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE field_guide_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view field guide sections"
  ON field_guide_sections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert field guide sections"
  ON field_guide_sections FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update field guide sections"
  ON field_guide_sections FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete field guide sections"
  ON field_guide_sections FOR DELETE
  TO authenticated
  USING (true);

-- ══════════════════════════════════════════════════════════
-- 3. field_guide_section_images
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS field_guide_section_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES field_guide_sections(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE field_guide_section_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view field guide section images"
  ON field_guide_section_images FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert field guide section images"
  ON field_guide_section_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update field guide section images"
  ON field_guide_section_images FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete field guide section images"
  ON field_guide_section_images FOR DELETE
  TO authenticated
  USING (true);

-- ══════════════════════════════════════════════════════════
-- 4. Storage bucket for field guide images
-- ══════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('field-guide-images', 'field-guide-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload field guide images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'field-guide-images');

CREATE POLICY "Anyone can view field guide images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'field-guide-images');

CREATE POLICY "Authenticated users can delete field guide images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'field-guide-images');
