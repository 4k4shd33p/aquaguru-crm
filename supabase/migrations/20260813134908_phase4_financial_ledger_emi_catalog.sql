/*
# Phase 4: Financial Ledgers, EMI Tracking & Product Catalog Management

1. Modified Tables
- `sales` — adds the following columns (all additive, no data loss):
  - `upfront_paid` (numeric, default 0) — amount paid upfront at time of sale
  - `emi_months` already exists (integer, default 0)
  - `emi_monthly` already exists (numeric, default 0)
  - `remaining_balance` (numeric, default 0) — outstanding EMI balance
  - `product_id` already exists — will store the RO model/asset purchased
  - `quantity` already exists

- `products` — adds the following columns (all additive, no data loss):
  - `sku` (text) — SKU / model number
  - `cost_price` (numeric, default 0) — cost price for margin tracking
  - `warranty_period` (text) — warranty period description (e.g. "1 Year", "2 Years")

2. New Tables
- `emi_installments`
  - `id` (uuid, primary key)
  - `sale_id` (uuid, foreign key to sales, ON DELETE CASCADE)
  - `installment_number` (integer, not null) — e.g. 1, 2, 3... (Month 1 of 6)
  - `total_installments` (integer, not null) — total number of installments (e.g. 6)
  - `due_date` (date, not null) — due date for this installment
  - `amount` (numeric, not null, default 0) — installment amount
  - `status` (text, default 'due') — 'paid', 'due', 'overdue'
  - `paid_date` (timestamptz, nullable) — when payment was collected
  - `created_at` (timestamptz, default now)

3. Security
- Enable RLS on `emi_installments`.
- Allow anon + authenticated CRUD (single-tenant, no sign-in).
*/

-- ===== Add columns to sales =====
ALTER TABLE sales ADD COLUMN IF NOT EXISTS upfront_paid numeric DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS remaining_balance numeric DEFAULT 0;

-- ===== Add columns to products =====
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_period text;

-- ===== Create emi_installments table =====
CREATE TABLE IF NOT EXISTS emi_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  total_installments integer NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text DEFAULT 'due',
  paid_date timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE emi_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_emi_installments" ON emi_installments;
CREATE POLICY "anon_select_emi_installments" ON emi_installments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_emi_installments" ON emi_installments;
CREATE POLICY "anon_insert_emi_installments" ON emi_installments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_emi_installments" ON emi_installments;
CREATE POLICY "anon_update_emi_installments" ON emi_installments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_emi_installments" ON emi_installments;
CREATE POLICY "anon_delete_emi_installments" ON emi_installments FOR DELETE
  TO anon, authenticated USING (true);

-- ===== Update existing products with new category structure =====
-- Migrate old categories to the new Phase 4 category system
UPDATE products SET category = 'Fittings & Tubing' WHERE category = 'Fitting';
UPDATE products SET category = 'Filter Cartridge' WHERE category = 'Core Part' AND name NOT IN ('Booster Pump', 'UV Lamp');
UPDATE products SET category = 'Pump & Electrical' WHERE category = 'Core Part' AND name IN ('Booster Pump', 'UV Lamp');

-- Add SKU and warranty to existing seeded products
UPDATE products SET sku = 'SF-100', warranty_period = '6 Months' WHERE name = 'Sediment Filter';
UPDATE products SET sku = 'CB-200', warranty_period = '6 Months' WHERE name = 'Carbon Block';
UPDATE products SET sku = 'ROM-75', warranty_period = '1 Year' WHERE name = 'RO Membrane';
UPDATE products SET sku = 'BP-100', warranty_period = '1 Year' WHERE name = 'Booster Pump';
UPDATE products SET sku = 'UVL-11W', warranty_period = '1 Year' WHERE name = 'UV Lamp';
UPDATE products SET sku = 'PFC-10', warranty_period = '3 Months' WHERE name = 'Pre-Filter Cartridge';
UPDATE products SET sku = 'FRT-025', warranty_period = 'N/A' WHERE name = 'FR Tube 1/4"';
UPDATE products SET sku = 'CON-QC', warranty_period = 'N/A' WHERE name = 'Connectors';
UPDATE products SET sku = 'TFT-ROLL', warranty_period = 'N/A' WHERE name = 'Teflon Tape';
UPDATE products SET sku = 'DV-3W', warranty_period = '3 Months' WHERE name = 'Diverter Valve';
UPDATE products SET sku = 'ILT-025', warranty_period = '3 Months' WHERE name = 'Inline T';
UPDATE products SET sku = 'BV-025', warranty_period = '3 Months' WHERE name = 'Ball Valve';
