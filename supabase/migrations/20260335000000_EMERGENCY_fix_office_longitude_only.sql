-- OPTIONAL emergency one-liner if Steps 1-2 are hard
-- This ONLY flips the Office longitude. Safe to run by itself.

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

-- Confirm
select name, latitude, longitude, location_verification_status
from public.projects
where name ilike '%office%'
   or round(latitude::numeric, 5) = 41.26208;
