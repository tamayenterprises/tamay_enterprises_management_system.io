-- STEP 1 of 4 — Settings + helper functions + audit table
-- Run this alone in Supabase SQL Editor. Expect: Success.

alter table public.organization_attendance_settings
  add column if not exists operating_region_id text not null default 'connecticut';

alter table public.organization_attendance_settings
  add column if not exists region_min_latitude double precision not null default 40.9;

alter table public.organization_attendance_settings
  add column if not exists region_max_latitude double precision not null default 42.1;

alter table public.organization_attendance_settings
  add column if not exists region_min_longitude double precision not null default -73.8;

alter table public.organization_attendance_settings
  add column if not exists region_max_longitude double precision not null default -71.7;

alter table public.organization_attendance_settings
  add column if not exists suspicious_distance_meters double precision not null default 160934.4;

create table if not exists public.project_location_verification_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  previous_latitude double precision,
  previous_longitude double precision,
  new_latitude double precision,
  new_longitude double precision,
  verified_by uuid references public.profiles (id) on delete set null,
  method text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists project_location_verification_log_project_idx
  on public.project_location_verification_log (project_id, created_at desc);

alter table public.project_location_verification_log enable row level security;

drop policy if exists "Management view location verification log" on public.project_location_verification_log;
create policy "Management view location verification log"
  on public.project_location_verification_log for select
  to authenticated
  using (public.has_management_role());

grant select on public.project_location_verification_log to authenticated;

create or replace function public.address_looks_like_connecticut(p_address text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_address, '') ~* '(CT|Connecticut|West Haven|New Haven|Bridgeport|Hartford|Stamford|Waterbury|Norwalk|Danbury|Milford|Meriden|Bristol|New Britain)';
$$;

create or replace function public.looks_like_missing_ct_longitude_sign(
  p_latitude double precision,
  p_longitude double precision,
  p_min_lat double precision default 40.9,
  p_max_lat double precision default 42.1,
  p_min_lng double precision default -73.8,
  p_max_lng double precision default -71.7
)
returns boolean
language sql
immutable
as $$
  select
    p_longitude is not null
    and p_latitude is not null
    and p_longitude > 0
    and p_latitude between p_min_lat and p_max_lat
    and (-p_longitude) between p_min_lng and p_max_lng;
$$;
