-- PayGuard capture ownership schema
-- Run in Supabase SQL Editor after 202611080001_multi_user_ownership.sql.
-- Auth users are managed by Supabase Auth.
--
-- Maps a PayPal capture id to the invoice it was found on and the PayGuard
-- user who owns that invoice. Capture-ID lookup consults this table first,
-- and only ever returns a capture to the user recorded here (re-verified
-- against PayPal). It is populated opportunistically when a paid invoice
-- owned by the caller is verified, and by the lookup fallback scan itself.

create table if not exists public.payguard_capture_owners (
  capture_id text primary key,
  paypal_invoice_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_value text,
  currency_code text,
  status text,
  created_at timestamptz not null default now()
);

create index if not exists payguard_capture_owners_user_idx
  on public.payguard_capture_owners(user_id);

alter table public.payguard_capture_owners enable row level security;

-- Users can read only their own capture ownership records.
create policy "Users read own capture ownership"
  on public.payguard_capture_owners for select
  to authenticated using (auth.uid() = user_id);

-- Writes are performed only by the trusted Worker using the service-role key.
-- No client insert/update/delete policies are intentionally provided.
