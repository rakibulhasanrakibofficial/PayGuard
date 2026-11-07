-- PayGuard multi-user ownership schema
-- Run in Supabase SQL Editor. Auth users are managed by Supabase Auth.

create table if not exists public.payguard_invoice_owners (
  paypal_invoice_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null,
  created_at timestamptz not null default now()
);

create index if not exists payguard_invoice_owners_user_created_idx
  on public.payguard_invoice_owners(user_id, created_at desc);

create table if not exists public.payguard_user_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (char_length(event_type) <= 40),
  message text not null check (char_length(message) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists payguard_user_activity_user_created_idx
  on public.payguard_user_activity(user_id, created_at desc);

alter table public.payguard_invoice_owners enable row level security;
alter table public.payguard_user_activity enable row level security;

-- Users can read only their own ownership records and activity.
create policy "Users read own invoice ownership"
  on public.payguard_invoice_owners for select
  to authenticated using (auth.uid() = user_id);

create policy "Users read own activity"
  on public.payguard_user_activity for select
  to authenticated using (auth.uid() = user_id);

-- Writes are performed only by the trusted Worker using the service-role key.
-- No client insert/update/delete policies are intentionally provided.

