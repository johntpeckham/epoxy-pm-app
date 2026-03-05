-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id)
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own customers"
  ON customers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own customers"
  ON customers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own customers"
  ON customers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own customers"
  ON customers FOR DELETE
  USING (auth.uid() = user_id);

-- Estimates table
CREATE TABLE IF NOT EXISTS estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_number integer NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  date date DEFAULT CURRENT_DATE,
  project_name text,
  description text,
  salesperson text,
  line_items jsonb,
  subtotal numeric,
  tax numeric DEFAULT 0,
  total numeric,
  terms text,
  notes text,
  status text DEFAULT 'Draft',
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id)
);

ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own estimates"
  ON estimates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own estimates"
  ON estimates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own estimates"
  ON estimates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own estimates"
  ON estimates FOR DELETE
  USING (auth.uid() = user_id);

-- Estimate settings table
CREATE TABLE IF NOT EXISTS estimate_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) UNIQUE,
  next_estimate_number integer DEFAULT 1000,
  company_name text,
  company_address text,
  company_city_state_zip text,
  company_website text,
  company_phone text
);

ALTER TABLE estimate_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own estimate settings"
  ON estimate_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own estimate settings"
  ON estimate_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own estimate settings"
  ON estimate_settings FOR UPDATE
  USING (auth.uid() = user_id);
