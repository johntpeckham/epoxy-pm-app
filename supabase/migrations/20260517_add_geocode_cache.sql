-- Geocode cache for radius search in CRM region filter
CREATE TABLE IF NOT EXISTS geocode_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_name)
);

-- Enable RLS
ALTER TABLE geocode_cache ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and insert
CREATE POLICY "Authenticated users can read geocode cache"
  ON geocode_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert geocode cache"
  ON geocode_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);
