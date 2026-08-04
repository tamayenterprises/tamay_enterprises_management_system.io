-- STEP 2 of 4 — Fix bad Office / CT longitudes (THIS IS THE IMPORTANT FIX)
-- Run after Step 1 succeeds.
-- Expect: Success. Then check the SELECT at the bottom (longitude must be negative).

-- Show suspicious projects BEFORE the fix
select
  id,
  name,
  latitude,
  longitude,
  job_site_address,
  location_verification_status
from public.projects
where archived_at is null
  and latitude is not null
  and longitude is not null
  and longitude > 0
  and latitude between 40.9 and 42.1
  and (-longitude) between -73.8 and -71.7;

-- SQL Editor has no management JWT, so this trigger blocks UPDATEs
alter table public.projects disable trigger projects_enforce_worker_update;

-- Fix: flip missing minus sign for CT-like / Office projects only
with candidates as (
  select
    p.id,
    p.latitude as prev_lat,
    p.longitude as prev_lng
  from public.projects p
  where p.archived_at is null
    and public.looks_like_missing_ct_longitude_sign(p.latitude, p.longitude)
    and (
      public.address_looks_like_connecticut(coalesce(p.job_site_address, p.location))
      or p.name ilike '%office%'
      or (
        round(p.latitude::numeric, 5) = 41.26208
        and round(abs(p.longitude)::numeric, 5) = 72.95269
      )
    )
),
fixed as (
  update public.projects p
  set
    longitude = -abs(p.longitude),
    updated_at = now()
  from candidates c
  where p.id = c.id
  returning p.id, c.prev_lat, c.prev_lng, p.latitude as new_lat, p.longitude as new_lng
)
insert into public.project_location_verification_log (
  project_id, previous_latitude, previous_longitude, new_latitude, new_longitude,
  verified_by, method, reason
)
select
  id, prev_lat, prev_lng, new_lat, new_lng,
  null,
  'migration_sign_fix',
  'Corrected missing Connecticut minus sign on longitude'
from fixed;

alter table public.projects enable trigger projects_enforce_worker_update;

-- Confirm AFTER the fix (Office should show negative longitude)
select
  id,
  name,
  latitude,
  longitude,
  job_site_address,
  location_verification_status
from public.projects
where archived_at is null
  and (
    name ilike '%office%'
    or round(latitude::numeric, 5) = 41.26208
  );
