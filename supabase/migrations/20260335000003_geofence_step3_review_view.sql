-- STEP 3 of 4 — Admin review view
-- Run after Step 2.

drop view if exists public.suspicious_project_locations;

create view public.suspicious_project_locations
as
select
  p.id,
  p.name,
  p.job_site_address,
  p.location,
  p.latitude,
  p.longitude,
  p.location_verification_status,
  case
    when public.looks_like_missing_ct_longitude_sign(p.latitude, p.longitude)
      then 'Positive longitude looks like a missing Connecticut minus sign'
    when p.latitude is not null and p.longitude is not null
         and public.address_looks_like_connecticut(coalesce(p.job_site_address, p.location))
         and (
           p.latitude < 40.9 or p.latitude > 42.1
           or p.longitude < -73.8 or p.longitude > -71.7
         )
      then 'Coordinates fall outside expected Connecticut bounds for this address'
    when p.latitude = 0 and p.longitude = 0
      then 'Null Island (0,0)'
    else 'Review recommended'
  end as suspicion_reason
from public.projects p
where p.archived_at is null
  and p.latitude is not null
  and p.longitude is not null
  and (
    public.looks_like_missing_ct_longitude_sign(p.latitude, p.longitude)
    or (p.latitude = 0 and p.longitude = 0)
    or (
      public.address_looks_like_connecticut(coalesce(p.job_site_address, p.location))
      and (
        p.latitude < 40.9 or p.latitude > 42.1
        or p.longitude < -73.8 or p.longitude > -71.7
      )
    )
  );

grant select on public.suspicious_project_locations to authenticated;

-- Should return 0 rows after a successful Office fix (or only truly bad projects)
select * from public.suspicious_project_locations;
