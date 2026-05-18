-- BabyFoodTrack tables for backups and latest state
-- Run this in Supabase SQL Editor

create table if not exists public.bft_backups (
  id bigint generated always as identity primary key,
  profile_id text not null,
  reason text not null default 'manual',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bft_backups_profile_created
  on public.bft_backups(profile_id, created_at desc);

create table if not exists public.bft_latest_state (
  profile_id text primary key,
  payload jsonb not null,
  last_reason text not null default 'manual',
  updated_at timestamptz not null default now()
);

-- Basic policies. Adjust for production auth model.
alter table public.bft_backups enable row level security;
alter table public.bft_latest_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bft_backups' and policyname = 'Allow anon insert backups'
  ) then
    create policy "Allow anon insert backups"
      on public.bft_backups
      for insert
      to anon
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bft_latest_state' and policyname = 'Allow anon upsert latest state'
  ) then
    create policy "Allow anon upsert latest state"
      on public.bft_latest_state
      for all
      to anon
      using (true)
      with check (true);
  end if;
end $$;
