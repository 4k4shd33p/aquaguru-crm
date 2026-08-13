/*
# Phase 3: Unified Service Ticket Log & Field Billing Engine

1. New Tables
- `customer_assets`
  - `id` (uuid, primary key)
  - `customer_id` (uuid, foreign key to customers, ON DELETE CASCADE)
  - `product_id` (uuid, foreign key to products, nullable, ON DELETE SET NULL)
  - `machine_name` (text, not null) — display name of the machine/asset
  - `model` (text) — model number
  - `serial_number` (text) — serial number
  - `install_date` (date) — installation date
  - `warranty_expiry` (date) — warranty end date
  - `amc_expiry` (date) — AMC end date
  - `is_primary` (boolean, default false) — flags the customer's primary asset for auto-fill
  - `created_at` (timestamptz, default now)
- `ticket_parts`
  - `id` (uuid, primary key)
  - `ticket_id` (uuid, foreign key to service_tickets, ON DELETE CASCADE)
  - `part_type` (text, not null) — 'core', 'fitting', or 'custom'
  - `name` (text, not null) — part name / description
  - `quantity` (integer, default 1)
  - `unit_price` (numeric, default 0)
  - `line_total` (numeric, default 0) — quantity * unit_price
  - `created_at` (timestamptz, default now)

2. Modified Tables
- `service_tickets` — adds the following columns (all additive, no data loss):
  - `coverage_type` (text, default 'paid_on_demand') — 'warranty', 'amc', 'paid_on_demand'
  - `ticket_type` (text) — 'filter_replacement', 'leakage_repair', 'low_flow', 'installation', 'routine_maintenance'
  - `asset_id` (uuid, foreign key to customer_assets, nullable, ON DELETE SET NULL)
  - `labor_charge` (numeric, default 0)
  - `subtotal` (numeric, default 0) — parts + labor before discounts
  - `coverage_discount` (numeric, default 0) — auto-applied for AMC/Warranty (100% of covered items)
  - `goodwill_discount` (numeric, default 0) — manual goodwill discount
  - `final_amount` (numeric, default 0) — subtotal - coverage_discount - goodwill_discount
  - `payment_status` (text, default 'pending') — 'paid_on_site', 'pending', 'waived'
  - `notes` (text) — technician notes

3. Seed Data
- Inserts standard RO water purifier core parts and quick fitting items into `products`:
  - Core parts: Sediment Filter, Carbon Block, RO Membrane, Booster Pump, UV Lamp, Pre-Filter Cartridge
  - Fittings: FR Tube 1/4", Connectors, Teflon Tape, Diverter Valve, Inline T, Ball Valve

4. Security
- Enable RLS on `customer_assets` and `ticket_parts`.
- Allow anon + authenticated CRUD on both new tables (single-tenant, no sign-in).
*/

-- ===== Create customer_assets table first (needed for FK in service_tickets) =====
CREATE TABLE IF NOT EXISTS customer_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  machine_name text NOT NULL,
  model text,
  serial_number text,
  install_date date,
  warranty_expiry date,
  amc_expiry date,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_customer_assets" ON customer_assets;
CREATE POLICY "anon_select_customer_assets" ON customer_assets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_customer_assets" ON customer_assets;
CREATE POLICY "anon_insert_customer_assets" ON customer_assets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_customer_assets" ON customer_assets;
CREATE POLICY "anon_update_customer_assets" ON customer_assets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_customer_assets" ON customer_assets;
CREATE POLICY "anon_delete_customer_assets" ON customer_assets FOR DELETE
  TO anon, authenticated USING (true);

-- ===== Add columns to service_tickets =====
ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS coverage_type text DEFAULT 'paid_on_demand';
ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS ticket_type text;
ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES customer_assets(id) ON DELETE SET NULL;
ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS labor_charge numeric DEFAULT 0;
ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS coverage_discount numeric DEFAULT 0;
ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS goodwill_discount numeric DEFAULT 0;
ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS final_amount numeric DEFAULT 0;
ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';
ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS notes text;

-- ===== Create ticket_parts table =====
CREATE TABLE IF NOT EXISTS ticket_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES service_tickets(id) ON DELETE CASCADE,
  part_type text NOT NULL,
  name text NOT NULL,
  quantity integer DEFAULT 1,
  unit_price numeric DEFAULT 0,
  line_total numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ticket_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ticket_parts" ON ticket_parts;
CREATE POLICY "anon_select_ticket_parts" ON ticket_parts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ticket_parts" ON ticket_parts;
CREATE POLICY "anon_insert_ticket_parts" ON ticket_parts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ticket_parts" ON ticket_parts;
CREATE POLICY "anon_update_ticket_parts" ON ticket_parts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ticket_parts" ON ticket_parts;
CREATE POLICY "anon_delete_ticket_parts" ON ticket_parts FOR DELETE
  TO anon, authenticated USING (true);

-- ===== Seed standard catalog parts =====
INSERT INTO products (name, category, price, stock, description) VALUES
  ('Sediment Filter', 'Core Part', 250, 50, '5-micron sediment pre-filter cartridge'),
  ('Carbon Block', 'Core Part', 350, 40, 'Activated carbon block filter for chlorine removal'),
  ('RO Membrane', 'Core Part', 1200, 30, '75 GPD reverse osmosis membrane'),
  ('Booster Pump', 'Core Part', 1800, 15, '100 PSI RO booster pump'),
  ('UV Lamp', 'Core Part', 900, 20, '11W UV sterilization lamp'),
  ('Pre-Filter Cartridge', 'Core Part', 200, 60, 'Spun pre-filter cartridge 10 inch'),
  ('FR Tube 1/4"', 'Fitting', 15, 200, '1/4 inch FR tube per meter'),
  ('Connectors', 'Fitting', 25, 150, 'Quick connect fittings set'),
  ('Teflon Tape', 'Fitting', 10, 300, 'PTFE thread seal tape roll'),
  ('Diverter Valve', 'Fitting', 180, 40, '3-way diverter valve for RO systems'),
  ('Inline T', 'Fitting', 45, 100, '1/4 inch inline T connector'),
  ('Ball Valve', 'Fitting', 65, 80, '1/4 inch shut-off ball valve')
ON CONFLICT DO NOTHING;
