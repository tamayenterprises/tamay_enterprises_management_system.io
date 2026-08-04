-- Recovery / safe re-run starter for attendance geofencing migration
-- Paste this FIRST if the previous run failed on "Not allowed to update this project"
-- Then re-run the full file: 20260332000000_attendance_geofencing.sql

do $$ begin
  create type public.location_verification_status as enum (
    'unverified',
    'needs_verification',
    'verified'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.projects
  add column if not exists job_site_address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geofence_radius_meters numeric(10, 2) not null default 91.44,
  add column if not exists location_verification_status public.location_verification_status
    not null default 'unverified',
  add column if not exists location_verified_at timestamptz,
  add column if not exists location_verified_by uuid references public.profiles (id) on delete set null;

-- SQL Editor has no logged-in management role, so this trigger blocks UPDATEs
alter table public.projects disable trigger projects_enforce_worker_update;

update public.projects
set
  job_site_address = coalesce(job_site_address, location),
  location_verification_status = case
    when latitude is not null and longitude is not null then location_verification_status
    else 'needs_verification'::public.location_verification_status
  end
where true;

alter table public.projects enable trigger projects_enforce_worker_update;

select 'Project location columns ready — now run the full geofencing migration file.' as next_step;
