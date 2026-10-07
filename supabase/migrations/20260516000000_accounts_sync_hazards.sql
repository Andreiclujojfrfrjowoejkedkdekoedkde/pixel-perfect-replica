-- Meridian: per-user data for accounts, settings sync and road hazards.
--
-- Rules that matter here:
--  * Row-level security on every table: a user only ever sees their own rows.
--  * No roles, permissions or flags live on any profile table. Authorisation is
--    derived from auth.uid() inside the policies, never from a mutable column,
--    so a user cannot escalate by editing their own row.
--  * Tables the whole app reads (road hazards) carry no RLS and rely on grants.

create table if not exists public.saved_places (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  subtitle text not null default '',
  kind text not null default 'Place',
  lon double precision not null,
  lat double precision not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists saved_places_user_idx on public.saved_places (user_id, updated_at desc);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.road_hazards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lat double precision not null,
  lon double precision not null,
  category text not null check (
    category in ('accident','debris','pothole','flooding','ice_snow','stalled_vehicle','road_work','animal','police','other')
  ),
  severity text not null check (severity in ('low','medium','high')),
  summary text not null default '',
  location_summary text not null default '',
  confidence real,
  raw_text text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists road_hazards_active_idx on public.road_hazards (created_at desc);
create index if not exists road_hazards_user_idx on public.road_hazards (user_id, created_at desc);

-- ---------------------------------------------------------------- enabled RLS
alter table public.saved_places enable row level security;
alter table public.user_settings enable row level security;
alter table public.road_hazards enable row level security;

drop policy if exists "own saved places" on public.saved_places;
create policy "own saved places" on public.saved_places
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Hazards are a shared feed: anyone signed in may read live hazards, but only
-- the author may change or remove their own. Expiry is applied on read so a
-- stale row can never surface, even before a sweeper deletes it.
drop policy if exists "read hazards" on public.road_hazards;
create policy "read hazards" on public.road_hazards
  for select to authenticated
  using (expires_at > now());

-- SECURITY DEFINER so the policy can count this user's recent reports without
-- recursing back into the very RLS policy it belongs to.
create or replace function public.recent_hazard_count(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.road_hazards
  where user_id = uid and created_at > now() - interval '1 hour';
$$;

revoke all on function public.recent_hazard_count(uuid) from public;
grant execute on function public.recent_hazard_count(uuid) to authenticated;

-- Insert policy is where abuse is actually stopped: it caps reports per hour and
-- refuses an expiry the client could use to pin a marker on the map for a year.
drop policy if exists "report hazards" on public.road_hazards;
create policy "report hazards" on public.road_hazards
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.recent_hazard_count(auth.uid()) < 10
    and expires_at > now()
    and expires_at <= now() + interval '24 hours'
    and length(raw_text) <= 500
  );

drop policy if exists "manage own hazards" on public.road_hazards;
create policy "manage own hazards" on public.road_hazards
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "withdraw own hazards" on public.road_hazards;
create policy "withdraw own hazards" on public.road_hazards
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.saved_places to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.road_hazards to authenticated;

-- ------------------------------------------------------------------ realtime
-- Realtime needs the tables added to the publication; the statements are
-- idempotent because a migration may be re-run against an existing database.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'saved_places') then
    alter publication supabase_realtime add table public.saved_places;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_settings') then
    alter publication supabase_realtime add table public.user_settings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'road_hazards') then
    alter publication supabase_realtime add table public.road_hazards;
  end if;
end
$$;
