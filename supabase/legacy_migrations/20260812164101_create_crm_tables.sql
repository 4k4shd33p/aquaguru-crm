/*
# Create AquaGuru CRM Tables (single-tenant, no auth)

1. New Tables
- `customers`
  - `id` (uuid, primary key)
  - `name` (text, not null) — customer's full name
  - `email` (text) — contact email
  - `phone` (text) — contact phone number
  - `address` (text) — physical address
  - `city` (text) — city
  - `notes` (text) — free-form notes
  - `created_at` (timestamptz, default now)
- `service_tickets`
  - `id` (uuid, primary key)
  - `customer_id` (uuid, foreign key to customers)
  - `product_id` (uuid, foreign key to products, nullable)
  - `issue` (text, not null) — description of the problem
  - `status` (text, default 'open') — open, in_progress, resolved, closed
  - `priority` (text, default 'medium') — low, medium, high
  - `created_at` (timestamptz, default now)
- `products`
  - `id` (uuid, primary key)
  - `name` (text, not null) — product name
  - `category` (text) — product category (e.g. purifier, filter, accessory)
  - `price` (numeric, default 0) — unit price
  - `stock` (integer, default 0) — quantity in stock
  - `description` (text) — product description
  - `created_at` (timestamptz, default now)
- `sales`
  - `id` (uuid, primary key)
  - `customer_id` (uuid, foreign key to customers)
  - `product_id` (uuid, foreign key to products)
  - `quantity` (integer, default 1)
  - `total_amount` (numeric, default 0)
  - `emi_months` (integer, default 0) — 0 means full payment
  - `emi_monthly` (numeric, default 0) — monthly EMI amount
  - `status` (text, default 'completed') — completed, emi_active, emi_completed
  - `created_at` (timestamptz, default now)

2. Security
- Enable RLS on all tables.
- Allow anon + authenticated CRUD on all tables because this is a single-tenant app with no sign-in screen.
*/

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  city text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_customers" ON customers;
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_customers" ON customers;
CREATE POLICY "anon_delete_customers" ON customers FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  price numeric DEFAULT 0,
  stock integer DEFAULT 0,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS service_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  issue text NOT NULL,
  status text DEFAULT 'open',
  priority text DEFAULT 'medium',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE service_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_service_tickets" ON service_tickets;
CREATE POLICY "anon_select_service_tickets" ON service_tickets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_service_tickets" ON service_tickets;
CREATE POLICY "anon_insert_service_tickets" ON service_tickets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_service_tickets" ON service_tickets;
CREATE POLICY "anon_update_service_tickets" ON service_tickets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_service_tickets" ON service_tickets;
CREATE POLICY "anon_delete_service_tickets" ON service_tickets FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  quantity integer DEFAULT 1,
  total_amount numeric DEFAULT 0,
  emi_months integer DEFAULT 0,
  emi_monthly numeric DEFAULT 0,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sales" ON sales;
CREATE POLICY "anon_select_sales" ON sales FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sales" ON sales;
CREATE POLICY "anon_insert_sales" ON sales FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sales" ON sales;
CREATE POLICY "anon_update_sales" ON sales FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sales" ON sales;
CREATE POLICY "anon_delete_sales" ON sales FOR DELETE
  TO anon, authenticated USING (true);
