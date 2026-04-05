-- ============================================================
-- Manufacturers table
-- ============================================================

create table if not exists public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manufacturers enable row level security;

create policy "Authenticated users can view manufacturers"
  on public.manufacturers for select to authenticated using (true);

create policy "Authenticated users can insert manufacturers"
  on public.manufacturers for insert to authenticated with check (true);

create policy "Authenticated users can update manufacturers"
  on public.manufacturers for update to authenticated using (true);

create policy "Authenticated users can delete manufacturers"
  on public.manufacturers for delete to authenticated using (true);

-- ============================================================
-- Manufacturer Products table
-- ============================================================

create table if not exists public.manufacturer_products (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manufacturer_id, name)
);

create index if not exists idx_manufacturer_products_manufacturer_id
  on public.manufacturer_products(manufacturer_id);

alter table public.manufacturer_products enable row level security;

create policy "Authenticated users can view manufacturer products"
  on public.manufacturer_products for select to authenticated using (true);

create policy "Authenticated users can insert manufacturer products"
  on public.manufacturer_products for insert to authenticated with check (true);

create policy "Authenticated users can update manufacturer products"
  on public.manufacturer_products for update to authenticated using (true);

create policy "Authenticated users can delete manufacturer products"
  on public.manufacturer_products for delete to authenticated using (true);
