-- ============================================================
-- Material Order Line Items table
-- ============================================================

create table if not exists public.material_order_line_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.material_orders(id) on delete cascade,
  manufacturer text,
  product text not null,
  quantity numeric not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_material_order_line_items_order_id
  on public.material_order_line_items(order_id);

alter table public.material_order_line_items enable row level security;

create policy "Authenticated users can view line items"
  on public.material_order_line_items for select to authenticated using (true);

create policy "Authenticated users can insert line items"
  on public.material_order_line_items for insert to authenticated with check (true);

create policy "Authenticated users can update line items"
  on public.material_order_line_items for update to authenticated using (true);

create policy "Authenticated users can delete line items"
  on public.material_order_line_items for delete to authenticated using (true);

-- ============================================================
-- Migrate existing single-item orders into line_items rows
-- (uses the existing `name` column as the `product` field)
-- ============================================================

insert into public.material_order_line_items (order_id, product, quantity)
select id, name, 1
from public.material_orders
where id not in (select distinct order_id from public.material_order_line_items);
