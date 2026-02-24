-- Company settings table (logo, company name, etc.)
create table if not exists company_settings (
  id uuid default uuid_generate_v4() primary key,
  logo_url text,
  company_name text,
  updated_at timestamptz default now() not null
);

alter table company_settings enable row level security;

-- All authenticated users can read company settings
create policy "Authenticated users can view company settings"
  on company_settings for select
  to authenticated
  using (true);

-- Authenticated users can insert company settings
create policy "Authenticated users can insert company settings"
  on company_settings for insert
  to authenticated
  with check (true);

-- Authenticated users can update company settings
create policy "Authenticated users can update company settings"
  on company_settings for update
  to authenticated
  using (true);

-- Storage bucket for company assets (logos, etc.)
insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload company assets"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-assets');

create policy "Anyone can view company assets"
  on storage.objects for select
  to public
  using (bucket_id = 'company-assets');

create policy "Authenticated users can update company assets"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'company-assets');

create policy "Authenticated users can delete company assets"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'company-assets');
