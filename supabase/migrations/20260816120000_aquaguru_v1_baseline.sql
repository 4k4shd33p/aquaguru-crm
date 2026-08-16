-- Aquaguru CRM V1 authoritative baseline. Legacy migrations are intentionally not used.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;

create table private.crm_code_sequences (
  entity text primary key,
  next_value bigint not null default 1 check (next_value > 0)
);

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function private.assign_crm_code()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare n bigint;
begin
  if (to_jsonb(new) ->> tg_argv[1]) is not null then return new; end if;
  insert into private.crm_code_sequences(entity) values (tg_argv[0]) on conflict (entity) do nothing;
  update private.crm_code_sequences set next_value = next_value + 1
    where entity = tg_argv[0] returning next_value - 1 into n;
  new := jsonb_populate_record(new, jsonb_build_object(tg_argv[1], tg_argv[2] || '-' || lpad(n::text, 5, '0')));
  return new;
end $$;
revoke all on function private.assign_crm_code() from public;

create table public.equipment_types (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null unique,
  description text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customer_types (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null unique,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.service_types (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.component_roles (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.lead_sources (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.technicians (
  id uuid primary key default gen_random_uuid(), technician_code text not null unique, name text not null,
  phone text, technician_type text, is_active boolean not null default true, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.parts (
  id uuid primary key default gen_random_uuid(), part_code text not null unique, name text not null,
  category text, brand text, model text, component_role_id uuid references public.component_roles(id) on delete restrict,
  standard_cost numeric(14,2) check (standard_cost is null or standard_cost >= 0),
  standard_selling_price numeric(14,2) check (standard_selling_price is null or standard_selling_price >= 0),
  equipment_tracking_enabled boolean not null default false, part_warranty_eligible boolean not null default false,
  default_warranty_months integer check (default_warranty_months is null or default_warranty_months > 0),
  is_active boolean not null default true, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (not equipment_tracking_enabled or component_role_id is not null)
);
create unique index parts_name_brand_model_unique on public.parts (name, brand, model) nulls not distinct;
create table public.product_models (
  id uuid primary key default gen_random_uuid(), product_code text not null unique, model_name text not null,
  equipment_type_id uuid not null references public.equipment_types(id) on delete restrict,
  description text, default_selling_price numeric(14,2) check (default_selling_price is null or default_selling_price >= 0),
  default_cost numeric(14,2) check (default_cost is null or default_cost >= 0), is_active boolean not null default true, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (model_name, equipment_type_id)
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), customer_code text not null unique, name text not null,
  customer_type_id uuid references public.customer_types(id) on delete restrict, phone text, alternate_phone text, email text,
  notes text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.locations (
  id uuid primary key default gen_random_uuid(), location_code text not null unique,
  customer_id uuid not null references public.customers(id) on delete cascade, location_name text, address text, area text, city text, pincode text,
  notes text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.equipment (
  id uuid primary key default gen_random_uuid(), equipment_code text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict, location_id uuid references public.locations(id) on delete restrict,
  equipment_type_id uuid references public.equipment_types(id) on delete restrict, product_model_id uuid references public.product_models(id) on delete restrict,
  source text not null default 'Unknown' check (source in ('Aquaguru Sale','Purchased Elsewhere','Customer-Owned / Existing','Other','Unknown')),
  serial_number text,
  status text not null default 'Unknown' check (status in ('Active','Inactive','Decommissioned','Unknown')),
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (location_id is null or customer_id is not null)
);
create table public.equipment_components (
  id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipment(id) on delete cascade,
  part_id uuid not null references public.parts(id) on delete restrict, component_role_id uuid not null references public.component_roles(id) on delete restrict,
  installed_date date, removed_date date, source_service_item_id uuid, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (removed_date is null or installed_date is null or removed_date >= installed_date)
);
create unique index equipment_components_one_open_role on public.equipment_components(equipment_id, component_role_id) where removed_date is null;
create table public.sales (
  id uuid primary key default gen_random_uuid(), sale_code text not null unique, customer_id uuid not null references public.customers(id) on delete restrict,
  sale_date date not null, invoice_number text, invoice_date date, status text not null default 'Unknown' check (status in ('Draft','Confirmed','Completed','Cancelled','Void','Unknown')), lead_source_id uuid references public.lead_sources(id) on delete restrict,
  source_detail text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.sale_items (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id) on delete cascade,
  product_model_id uuid not null references public.product_models(id) on delete restrict, quantity integer not null check (quantity > 0),
  standard_unit_price numeric(14,2) check (standard_unit_price is null or standard_unit_price >= 0), actual_unit_price numeric(14,2) not null check (actual_unit_price >= 0),
  unit_cost numeric(14,2) check (unit_cost is null or unit_cost >= 0), discount numeric(14,2) not null default 0 check (discount >= 0), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.sale_payments (
  id uuid primary key default gen_random_uuid(), payment_code text not null unique, sale_id uuid not null references public.sales(id) on delete restrict,
  payment_date date not null, amount numeric(14,2) not null check (amount > 0), payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  reference_number text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.emi_accounts (
  id uuid primary key default gen_random_uuid(), emi_code text not null unique, sale_id uuid not null unique references public.sales(id) on delete restrict,
  total_financed_amount numeric(14,2) not null check (total_financed_amount > 0), expected_payment_amount numeric(14,2) check (expected_payment_amount is null or expected_payment_amount > 0),
  expected_payment_frequency text, expected_payment_day integer check (expected_payment_day is null or expected_payment_day between 1 and 31),
  start_date date, end_date date, status text not null default 'Unknown' check (status in ('Active','Completed','Cancelled','Defaulted','Void','Unknown')), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create table public.emi_payments (
  id uuid primary key default gen_random_uuid(), payment_code text not null unique, emi_account_id uuid not null references public.emi_accounts(id) on delete restrict,
  payment_date date not null, amount numeric(14,2) not null check (amount > 0), payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  reference_number text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.installations (
  id uuid primary key default gen_random_uuid(), installation_code text not null unique, equipment_id uuid not null references public.equipment(id) on delete restrict,
  sale_item_id uuid references public.sale_items(id) on delete restrict, scheduled_date date, installation_date date, technician_id uuid references public.technicians(id) on delete restrict,
  status text not null default 'Unknown' check (status in ('Scheduled','Rescheduled','Completed','Cancelled','Unknown')), tds_in numeric(10,2) check (tds_in is null or tds_in >= 0), tds_out numeric(10,2) check (tds_out is null or tds_out >= 0),
  installation_charge numeric(14,2) check (installation_charge is null or installation_charge >= 0), technician_charge numeric(14,2) check (technician_charge is null or technician_charge >= 0),
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'Completed' or installation_date is not null)
);
create table public.equipment_warranties (
  id uuid primary key default gen_random_uuid(), warranty_code text not null unique, equipment_id uuid not null references public.equipment(id) on delete restrict,
  sale_id uuid references public.sales(id) on delete restrict, installation_id uuid references public.installations(id) on delete restrict,
  start_date date not null, end_date date not null, duration_months integer not null check (duration_months > 0),
  planned_visits integer not null default 3 check (planned_visits >= 0), status text not null default 'Unknown' check (status in ('Active','Expired','Cancelled','Void','Unknown')), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (end_date >= start_date)
);
create table public.amc_cycles (
  id uuid primary key default gen_random_uuid(), amc_code text not null unique, equipment_id uuid not null references public.equipment(id) on delete restrict,
  cycle_number integer not null check (cycle_number > 0), start_date date not null, end_date date not null,
  standard_price numeric(14,2) check (standard_price is null or standard_price >= 0), agreed_price numeric(14,2) check (agreed_price is null or agreed_price >= 0),
  planned_visits integer not null default 3 check (planned_visits >= 0), status text not null default 'Unknown' check (status in ('Active','Expired','Cancelled','Void','Unknown')), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(equipment_id, cycle_number), check(end_date >= start_date)
);
create table public.amc_payments (
  id uuid primary key default gen_random_uuid(), payment_code text not null unique, amc_cycle_id uuid not null references public.amc_cycles(id) on delete restrict,
  payment_date date not null, amount numeric(14,2) not null check(amount > 0), payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  reference_number text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.services (
  id uuid primary key default gen_random_uuid(), service_code text not null unique, equipment_id uuid not null references public.equipment(id) on delete restrict,
  service_date date not null, technician_id uuid references public.technicians(id) on delete restrict, service_type_id uuid not null references public.service_types(id) on delete restrict,
  issue_reported text, diagnosis text, work_performed text, tds_in numeric(10,2) check(tds_in is null or tds_in >= 0), tds_out numeric(10,2) check(tds_out is null or tds_out >= 0),
  next_service_due date, technician_charge numeric(14,2) check(technician_charge is null or technician_charge >= 0),
  equipment_warranty_id uuid references public.equipment_warranties(id) on delete restrict, amc_cycle_id uuid references public.amc_cycles(id) on delete restrict,
  status text not null default 'Unknown' check (status in ('Scheduled','Open','Completed','Cancelled','Void','Unknown')), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (equipment_warranty_id is null or amc_cycle_id is null)
);
create table public.service_items (
  id uuid primary key default gen_random_uuid(), service_id uuid not null references public.services(id) on delete cascade,
  part_id uuid references public.parts(id) on delete restrict, item_type text not null check(item_type in ('Replacement','Repair','Maintenance','Labour / Work','Other')),
  description text, quantity numeric(14,3) not null default 1 check(quantity > 0), standard_price numeric(14,2) check(standard_price is null or standard_price >= 0),
  actual_customer_price numeric(14,2) not null default 0 check(actual_customer_price >= 0), internal_cost numeric(14,2) not null default 0 check(internal_cost >= 0),
  coverage_type text not null check(coverage_type in ('Equipment Warranty','AMC','Part Warranty','Paid','Complimentary','Other')),
  equipment_warranty_id uuid, amc_cycle_id uuid, service_item_warranty_id uuid, updates_equipment_component boolean not null default false, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((coverage_type = 'Equipment Warranty' and equipment_warranty_id is not null and amc_cycle_id is null and service_item_warranty_id is null)
      or (coverage_type = 'AMC' and amc_cycle_id is not null and equipment_warranty_id is null and service_item_warranty_id is null)
      or (coverage_type = 'Part Warranty' and service_item_warranty_id is not null and equipment_warranty_id is null and amc_cycle_id is null)
      or (coverage_type in ('Paid','Complimentary','Other') and equipment_warranty_id is null and amc_cycle_id is null and service_item_warranty_id is null))
);
create table public.service_item_warranties (
  id uuid primary key default gen_random_uuid(), part_warranty_code text not null unique, service_item_id uuid not null unique references public.service_items(id) on delete restrict,
  equipment_id uuid not null references public.equipment(id) on delete restrict, part_id uuid not null references public.parts(id) on delete restrict,
  start_date date not null, end_date date not null, duration_months integer not null check(duration_months > 0), status text not null default 'Unknown' check (status in ('Active','Expired','Replaced','Cancelled','Void','Unknown')),
  replaced_warranty_id uuid references public.service_item_warranties(id) on delete restrict, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(end_date >= start_date), check(replaced_warranty_id is null or replaced_warranty_id <> id)
);
alter table public.service_items add constraint service_items_equipment_warranty_fk foreign key (equipment_warranty_id) references public.equipment_warranties(id) on delete restrict;
alter table public.service_items add constraint service_items_amc_cycle_fk foreign key (amc_cycle_id) references public.amc_cycles(id) on delete restrict;
alter table public.service_items add constraint service_items_part_warranty_fk foreign key (service_item_warranty_id) references public.service_item_warranties(id) on delete restrict;
alter table public.equipment_components add constraint equipment_components_source_service_item_fk foreign key (source_service_item_id) references public.service_items(id) on delete restrict;
create table public.service_payments (
  id uuid primary key default gen_random_uuid(), payment_code text not null unique, service_id uuid not null references public.services(id) on delete restrict,
  payment_date date not null, amount numeric(14,2) not null check(amount > 0), payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  reference_number text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create or replace function private.validate_service_item_coverage()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare equipment uuid; warranty_equipment uuid; warranty_part uuid; item_part uuid;
begin
  select s.equipment_id, new.part_id into equipment, item_part from public.services s where s.id = new.service_id;
  if new.equipment_warranty_id is not null then select equipment_id into warranty_equipment from public.equipment_warranties where id = new.equipment_warranty_id; end if;
  if new.amc_cycle_id is not null then select equipment_id into warranty_equipment from public.amc_cycles where id = new.amc_cycle_id; end if;
  if new.service_item_warranty_id is not null then select equipment_id, part_id into warranty_equipment, warranty_part from public.service_item_warranties where id = new.service_item_warranty_id; end if;
  if warranty_equipment is not null and warranty_equipment <> equipment then raise exception 'Coverage record must belong to the service equipment'; end if;
  if new.service_item_warranty_id is not null and (item_part is null or warranty_part <> item_part) then raise exception 'Part-warranty coverage must match the service item part'; end if;
  return new;
end $$;
create trigger validate_service_item_coverage before insert or update on public.service_items for each row execute function private.validate_service_item_coverage();

create or replace function private.validate_equipment_customer_location()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare location_customer uuid;
begin
  if new.location_id is not null then
    select customer_id into location_customer from public.locations where id = new.location_id;
    if location_customer <> new.customer_id then raise exception 'Equipment customer must own its location'; end if;
  end if;
  return new;
end $$;
create trigger validate_equipment_customer_location before insert or update on public.equipment for each row execute function private.validate_equipment_customer_location();

create or replace function private.validate_service_item_warranty()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare item_equipment uuid; item_part uuid; replaced_equipment uuid; replaced_part uuid;
begin
  select s.equipment_id, si.part_id into item_equipment, item_part
    from public.service_items si join public.services s on s.id = si.service_id where si.id = new.service_item_id;
  if item_equipment <> new.equipment_id or item_part is distinct from new.part_id then
    raise exception 'Part warranty must match its source service item equipment and part';
  end if;
  if new.replaced_warranty_id is not null then
    select equipment_id, part_id into replaced_equipment, replaced_part from public.service_item_warranties where id = new.replaced_warranty_id;
    if replaced_equipment <> new.equipment_id or replaced_part <> new.part_id then
      raise exception 'Replaced part warranty must match the same equipment and part';
    end if;
  end if;
  return new;
end $$;
create trigger validate_service_item_warranty before insert or update on public.service_item_warranties for each row execute function private.validate_service_item_warranty();

create or replace function private.validate_equipment_component_source()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare source_equipment uuid;
begin
  if new.source_service_item_id is not null then
    select s.equipment_id into source_equipment from public.service_items si join public.services s on s.id = si.service_id where si.id = new.source_service_item_id;
    if source_equipment <> new.equipment_id then raise exception 'Component source service item must belong to the equipment'; end if;
  end if;
  return new;
end $$;
create trigger validate_equipment_component_source before insert or update on public.equipment_components for each row execute function private.validate_equipment_component_source();

create or replace function private.validate_equipment_warranty_installation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare installation_equipment uuid; installation_status text; actual_date date;
begin
  if new.installation_id is not null then
    select equipment_id, status, installation_date into installation_equipment, installation_status, actual_date
      from public.installations where id = new.installation_id;
    if installation_equipment <> new.equipment_id then
      raise exception 'Warranty installation must belong to the warranty equipment';
    end if;
    if installation_status <> 'Completed' or actual_date is null then
      raise exception 'Warranty installation must be completed and have an actual installation date';
    end if;
    if new.start_date <> actual_date then
      raise exception 'Warranty start date must equal the actual installation date';
    end if;
  end if;
  return new;
end $$;
create trigger validate_equipment_warranty_installation before insert or update on public.equipment_warranties for each row execute function private.validate_equipment_warranty_installation();

create or replace function private.validate_service_visit_context()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare context_equipment uuid;
begin
  if new.equipment_warranty_id is not null then
    select equipment_id into context_equipment from public.equipment_warranties where id = new.equipment_warranty_id;
  elsif new.amc_cycle_id is not null then
    select equipment_id into context_equipment from public.amc_cycles where id = new.amc_cycle_id;
  end if;
  if context_equipment is not null and context_equipment <> new.equipment_id then
    raise exception 'Service visit context must belong to the service equipment';
  end if;
  return new;
end $$;
create trigger validate_service_visit_context before insert or update on public.services for each row execute function private.validate_service_visit_context();

create index locations_customer_id_idx on public.locations(customer_id);
create index equipment_customer_id_idx on public.equipment(customer_id);
create index equipment_location_id_idx on public.equipment(location_id);
create index equipment_components_equipment_id_idx on public.equipment_components(equipment_id);
create index product_models_equipment_type_id_idx on public.product_models(equipment_type_id);
create index sales_customer_id_sale_date_idx on public.sales(customer_id, sale_date);
create index sale_items_sale_id_idx on public.sale_items(sale_id);
create index sale_payments_sale_id_idx on public.sale_payments(sale_id);
create index emi_payments_account_id_idx on public.emi_payments(emi_account_id);
create index installations_equipment_id_idx on public.installations(equipment_id);
create index equipment_warranties_equipment_id_idx on public.equipment_warranties(equipment_id);
create index amc_cycles_equipment_id_idx on public.amc_cycles(equipment_id);
create index services_equipment_id_service_date_idx on public.services(equipment_id, service_date);
create index services_equipment_warranty_id_idx on public.services(equipment_warranty_id) where equipment_warranty_id is not null;
create index services_amc_cycle_id_idx on public.services(amc_cycle_id) where amc_cycle_id is not null;
create index service_items_service_id_idx on public.service_items(service_id);
create index service_payments_service_id_idx on public.service_payments(service_id);

do $$ declare t text; code_table text; code_col text; prefix text;
begin
  for t, code_col, prefix in values
    ('equipment_types','code','ETP'), ('customer_types','code','CTY'), ('technicians','technician_code','TECH'), ('parts','part_code','PRT'),
    ('product_models','product_code','PRD'), ('customers','customer_code','CUS'), ('locations','location_code','LOC'), ('equipment','equipment_code','EQP'),
    ('sales','sale_code','SAL'), ('sale_payments','payment_code','PAY'), ('emi_accounts','emi_code','EMI'), ('emi_payments','payment_code','PAY'),
    ('installations','installation_code','INS'), ('equipment_warranties','warranty_code','WAR'), ('amc_cycles','amc_code','AMC'), ('amc_payments','payment_code','PAY'),
    ('services','service_code','SRV'), ('service_item_warranties','part_warranty_code','PWR'), ('service_payments','payment_code','PAY')
  loop
    execute format('create trigger %I before insert on public.%I for each row execute function private.assign_crm_code(%L,%L,%L)',
      t || '_assign_code', t, t || ':' || code_col, code_col, prefix);
  end loop;
  foreach t in array array['equipment_types','customer_types','service_types','component_roles','lead_sources','payment_methods','technicians','parts','product_models','customers','locations','equipment','equipment_components','sales','sale_items','sale_payments','emi_accounts','emi_payments','installations','equipment_warranties','amc_cycles','amc_payments','services','service_items','service_item_warranties','service_payments'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_set_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', 'authenticated_crm_access', t);
  end loop;
end $$;

insert into public.equipment_types(name) values
 ('Residential RO Purifier'),('Commercial RO Purifier'),('Industrial RO System'),('UV / UF Purifier'),('Water Softener'),('Sand / Sediment Filter'),('Iron Remover'),('Other') on conflict (name) do nothing;
insert into public.customer_types(name) values ('Residential'),('Commercial'),('Industrial'),('Other') on conflict (name) do nothing;
insert into public.component_roles(name) values ('Membrane'),('Pump'),('Other') on conflict (name) do nothing;
insert into public.parts(name, equipment_tracking_enabled, part_warranty_eligible, default_warranty_months, component_role_id) values
 ('Membrane',true,true,12,(select id from public.component_roles where name = 'Membrane')),
 ('Pump',true,true,12,(select id from public.component_roles where name = 'Pump')),
 ('Inline Sediment',false,true,12,null),('Inline Pre Carbon',false,true,12,null),('Inline Post Carbon',false,true,12,null),
 ('Adapter',false,false,null,null),('SV',false,false,null,null),('FR',false,false,null,null),('Float',false,false,null,null),('RO Tap',false,false,null,null),('Tank',false,false,null,null),('Stand',false,false,null,null),('Cover',false,false,null,null),('Body',false,false,null,null),('Membrane Housing',false,false,null,null),('Spun Filter Housing',false,false,null,null),('UV',false,false,null,null),('Alkaline / mineral cartridges',false,false,null,null),('Copper',false,false,null,null),('Other',false,false,null,null) on conflict (name, brand, model) do nothing;
insert into public.service_types(name) values ('Scheduled Maintenance'),('Breakdown'),('Complaint'),('Inspection'),('Follow-up'),('Other') on conflict (name) do nothing;
insert into public.lead_sources(name) values ('Referral'),('Door Knock'),('Cold Call'),('WhatsApp'),('Phone Call'),('Website'),('Google Search'),('Google Ads'),('Meta Ads'),('Instagram Organic'),('Facebook Organic'),('Existing Customer'),('Service / Technician'),('Walk-in'),('Partner / Dealer Referral'),('Other') on conflict (name) do nothing;
insert into public.payment_methods(name) values ('Cash'),('UPI'),('Bank Transfer'),('Card'),('Cheque'),('Other') on conflict (name) do nothing;

