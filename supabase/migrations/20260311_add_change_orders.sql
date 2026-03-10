-- Create change_orders table for estimates and invoices
create table if not exists public.change_orders (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('estimate', 'invoice')),
  parent_id uuid not null,
  change_order_number text not null,
  description text not null default '',
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id)
);

-- Enable RLS
alter table public.change_orders enable row level security;

-- RLS policies
create policy "Users can view their own change orders"
  on public.change_orders for select
  using (auth.uid() = user_id);

create policy "Users can insert their own change orders"
  on public.change_orders for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own change orders"
  on public.change_orders for update
  using (auth.uid() = user_id);

create policy "Users can delete their own change orders"
  on public.change_orders for delete
  using (auth.uid() = user_id);

-- Index for fast lookup by parent
create index idx_change_orders_parent on public.change_orders(parent_type, parent_id);
