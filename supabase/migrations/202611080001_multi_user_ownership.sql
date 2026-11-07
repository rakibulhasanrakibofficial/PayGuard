-- PayGuard multi-user ownership and private activity tables.
-- Run once in Supabase SQL Editor. The Worker uses the service-role key for writes.

create table if not exists public.payguard_invoice_owners (
  paypal_invoice_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null,
  created_at timestamptz not null default now()
);

create index if not exists payguard_invoice_owners_user_id_idx
  on public.payguard_invoice_owners(user_id);

create table if not exists public.payguard_user_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 40),
  message text not null check (char_length(message) between 1 and 240),
  created_at timestamptz not null default now()
);

create index if not exists payguard_user_activity_user_created_idx
  on public.payguard_user_activity(user_id, created_at desc);

alter table public.payguard_invoice_owners enable row level security;
alter table public.payguard_user_activity enable row level security;

drop policy if exists "Users can read their own invoice ownership" on public.payguard_invoice_owners;
create policy "Users can read their own invoice ownership"
  on public.payguard_invoice_owners
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own activity" on public.payguard_user_activity;
create policy "Users can read their own activity"
  on public.payguard_user_activity
  for select to authenticated
  using (auth.uid() = user_id);

-- No client-side INSERT, UPDATE, or DELETE policies are granted.
-- The server-side Worker performs writes using SUPABASE_SERVICE_ROLE_KEY.
