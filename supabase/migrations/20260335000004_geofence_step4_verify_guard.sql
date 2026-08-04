-- STEP 4 of 4 — Block saving positive CT longitudes again
-- Run after Step 3. This only updates verify_project_location (not the huge attendance RPC).

create or replace function public.verify_project_location(
  p_project_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_job_site_address text default null,
  p_geofence_radius_meters numeric default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.projects%rowtype;
  v_prev public.projects%rowtype;
  v_address text;
  v_settings public.organization_attendance_settings%rowtype;
begin
  if v_uid is null or not public.has_management_role() then
    raise exception 'Management role required';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'Latitude and longitude are required';
  end if;
  if p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Latitude/longitude out of range';
  end if;
  if p_latitude = 0 and p_longitude = 0 then
    raise exception 'Coordinates 0,0 are not allowed. Use real GPS numbers for the job site.';
  end if;

  select * into v_prev from public.projects where id = p_project_id;
  if not found then raise exception 'Project not found'; end if;

  v_address := coalesce(p_job_site_address, v_prev.job_site_address, v_prev.location);

  select * into v_settings
  from public.organization_attendance_settings
  where organization_id = v_prev.organization_id;

  if public.looks_like_missing_ct_longitude_sign(
       p_latitude,
       p_longitude,
       coalesce(v_settings.region_min_latitude, 40.9),
       coalesce(v_settings.region_max_latitude, 42.1),
       coalesce(v_settings.region_min_longitude, -73.8),
       coalesce(v_settings.region_max_longitude, -71.7)
     ) then
    raise exception 'The project coordinates do not match the Connecticut job-site address. Verify that the longitude includes the negative sign. Example: -72.95269';
  end if;

  if public.address_looks_like_connecticut(v_address)
     and public.looks_like_missing_ct_longitude_sign(
       p_latitude,
       p_longitude,
       coalesce(v_settings.region_min_latitude, 40.9),
       coalesce(v_settings.region_max_latitude, 42.1),
       coalesce(v_settings.region_min_longitude, -73.8),
       coalesce(v_settings.region_max_longitude, -71.7)
     ) then
    raise exception 'The saved coordinates do not match the project address. Connecticut locations require a western, negative longitude. Please regenerate the coordinates from the address or use the current job-site GPS.';
  end if;

  update public.projects
  set
    latitude = p_latitude,
    longitude = p_longitude,
    job_site_address = coalesce(p_job_site_address, job_site_address, location),
    location = coalesce(p_job_site_address, location),
    geofence_radius_meters = coalesce(p_geofence_radius_meters, geofence_radius_meters),
    location_verification_status = 'verified',
    location_verified_at = now(),
    location_verified_by = v_uid,
    updated_at = now()
  where id = p_project_id
  returning * into v_row;

  insert into public.project_location_verification_log (
    project_id, previous_latitude, previous_longitude, new_latitude, new_longitude,
    verified_by, method, reason
  ) values (
    p_project_id,
    v_prev.latitude,
    v_prev.longitude,
    p_latitude,
    p_longitude,
    v_uid,
    'admin_verify',
    'Verified via project location panel'
  );

  return v_row;
end;
$$;
