-- OPTIONAL emergency one-liner if Steps 1-2 are hard
-- This ONLY flips the Office longitude. Safe to run by itself.

-- SQL Editor has no management JWT, so this trigger blocks UPDATEs
alter table public.projects disable trigger projects_enforce_worker_update;

update public.projects
set
  longitude = -abs(longitude),
  updated_at = now()
where archived_at is null
  and latitude is not null
  and longitude is not null
  and longitude > 0
  and (
    name ilike '%office%'
    or (
      round(latitude::numeric, 5) = 41.26208
      and round(longitude::numeric, 5) = 72.95269
    )
  );

alter table public.projects enable trigger projects_enforce_worker_update;

-- Confirm
select name, latitude, longitude, location_verification_status
from public.projects
where name ilike '%office%'
   or round(latitude::numeric, 5) = 41.26208;
