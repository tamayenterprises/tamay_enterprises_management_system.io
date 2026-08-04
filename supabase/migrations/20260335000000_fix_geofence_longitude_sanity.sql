-- Geofence longitude sanity: CT region checks, suspicious project review, targeted sign fixes

alter table public.organization_attendance_settings
  add column if not exists operating_region_id text not null default 'connecticut',
  add column if not exists region_min_latitude double precision not null default 40.9,
  add column if not exists region_max_latitude double precision not null default 42.1,
  add column if not exists region_min_longitude double precision not null default -73.8,
  add column if not exists region_max_longitude double precision not null default -71.7,
  add column if not exists suspicious_distance_meters double precision not null default 160934.4; -- ~100 miles

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
  select coalesce(p_address, '') ~* '\y(CT|Connecticut|West Haven|New Haven|Bridgeport|Hartford|Stamford|Waterbury|Norwalk|Danbury|Milford|Meriden|Bristol|New Britain)\y';
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

-- Admin review list (do not auto-fix everything)
create or replace view public.suspicious_project_locations
with (security_invoker = true)
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

-- Targeted correction: CT-like lat + positive CT-magnitude lng + CT/Office address context
-- Does NOT invert every positive longitude worldwide.
-- SQL Editor has no management JWT, so this trigger blocks UPDATEs
alter table public.projects disable trigger projects_enforce_worker_update;

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
      or p.name ~* 'office'
      or (
        round(p.latitude::numeric, 5) = 41.26208
        and round(p.longitude::numeric, 5) = 72.95269
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
  'Corrected missing Connecticut minus sign on longitude (targeted)'
from fixed;

alter table public.projects enable trigger projects_enforce_worker_update;

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

  if public.looks_like_missing_ct_longitude_sign(
       p_latitude,
       p_longitude,
       coalesce(v_settings.region_min_latitude, 40.9),
       coalesce(v_settings.region_max_latitude, 42.1),
       coalesce(v_settings.region_min_longitude, -73.8),
       coalesce(v_settings.region_max_longitude, -71.7)
     ) then
    raise exception 'The project coordinates do not match the Connecticut job-site address. Verify that the longitude includes the negative sign.';
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

-- Attendance RPC: preserve existing workflow columns; improve suspicious-coordinate messaging
create or replace function public.record_attendance_action(
  p_action public.attendance_action_type,
  p_project_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_device_info jsonb default null,
  p_idempotency_key text default null,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_project public.projects%rowtype;
  v_settings public.organization_attendance_settings%rowtype;
  v_open public.attendance_records%rowtype;
  v_distance double precision;
  v_max_accuracy double precision;
  v_radius double precision;
  v_result public.attendance_validation_result;
  v_reason text;
  v_attempt_id uuid;
  v_event_id uuid;
  v_record_id uuid;
  v_now timestamptz := now();
  v_break_seconds numeric;
  v_elapsed_seconds numeric;
  v_paid_hours numeric;
  v_existing_attempt uuid;
  v_is_management boolean := public.has_management_role();
  v_suspicious boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.approval_status <> 'approved' or not v_profile.is_active then
    raise exception 'Approved active profile required';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_attempt
    from public.attendance_attempts
    where user_id = v_uid and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'ok', false,
        'validation_result', 'rejected_duplicate',
        'rejection_reason', 'Duplicate submission ignored',
        'attempt_id', v_existing_attempt
      );
    end if;
  end if;

  if p_project_id is null then
    raise exception 'Project is required for geofenced attendance';
  end if;

  select * into v_project from public.projects where id = p_project_id and archived_at is null;
  if not found then
    raise exception 'Project not found';
  end if;

  if v_project.organization_id is distinct from v_profile.organization_id
     and not v_is_management then
    raise exception 'Project organization mismatch';
  end if;

  select * into v_settings
  from public.organization_attendance_settings
  where organization_id = v_profile.organization_id;

  v_max_accuracy := coalesce(v_settings.max_gps_accuracy_meters, 45.72);
  v_radius := coalesce(v_project.geofence_radius_meters, coalesce(v_settings.default_geofence_radius_meters, 91.44));

  v_suspicious := public.looks_like_missing_ct_longitude_sign(
    v_project.latitude,
    v_project.longitude,
    coalesce(v_settings.region_min_latitude, 40.9),
    coalesce(v_settings.region_max_latitude, 42.1),
    coalesce(v_settings.region_min_longitude, -73.8),
    coalesce(v_settings.region_max_longitude, -71.7)
  );

  if not v_is_management and not public.is_assigned_to_project(p_project_id) then
    v_result := 'rejected_not_assigned';
    v_reason := 'You are not assigned to this project';
  elsif v_suspicious then
    v_result := 'rejected_project_unverified';
    if v_is_management then
      v_reason :=
        'The saved project coordinates appear inconsistent with the project address. Warning: the project longitude is positive, but Connecticut addresses require a western (negative) longitude. Phone Latitude: ' ||
        coalesce(round(p_latitude::numeric, 5)::text, 'n/a') ||
        ', Phone Longitude: ' || coalesce(round(p_longitude::numeric, 5)::text, 'n/a') ||
        '. Project Latitude: ' || coalesce(round(v_project.latitude::numeric, 5)::text, 'n/a') ||
        ', Project Longitude: ' || coalesce(round(v_project.longitude::numeric, 5)::text, 'n/a') ||
        '. Re-verify the job-site location before enabling attendance.';
    else
      v_reason := 'We could not verify the project location correctly. Please contact an administrator.';
    end if;
  elsif v_project.location_verification_status is distinct from 'verified'
        or v_project.latitude is null
        or v_project.longitude is null then
    v_result := 'rejected_project_unverified';
    v_reason := 'Project location is not verified. Ask an administrator to verify the job-site coordinates, or submit an exception request.';
  elsif p_latitude is null or p_longitude is null then
    v_result := 'rejected_location_unavailable';
    v_reason := 'Location was not available. Enable location services and try again.';
  elsif p_accuracy_meters is null or p_accuracy_meters > v_max_accuracy then
    v_result := 'rejected_poor_accuracy';
    v_reason :=
      'GPS accuracy is too low (' ||
      round(coalesce(p_accuracy_meters, -1))::text ||
      ' m). Enable precise location, move near a window or open area, wait briefly, then retry. If the problem continues, submit an exception request.';
  else
    v_distance := public.haversine_meters(
      p_latitude, p_longitude, v_project.latitude, v_project.longitude
    );

    if v_distance is not null
       and v_distance > coalesce(v_settings.suspicious_distance_meters, 160934.4)
       and public.address_looks_like_connecticut(coalesce(v_project.job_site_address, v_project.location)) then
      v_result := 'rejected_outside_geofence';
      if v_is_management then
        v_reason :=
          'The saved project coordinates appear inconsistent with the project address. Calculated distance is ' ||
          round(v_distance)::text || ' m (' || round((v_distance / 1609.344)::numeric, 2)::text ||
          ' mi). Phone Latitude: ' || round(p_latitude::numeric, 5)::text ||
          ', Phone Longitude: ' || round(p_longitude::numeric, 5)::text ||
          '. Project Latitude: ' || round(v_project.latitude::numeric, 5)::text ||
          ', Project Longitude: ' || round(v_project.longitude::numeric, 5)::text ||
          '. Please verify the job-site location.';
      else
        v_reason := 'We could not verify the project location correctly. Please contact an administrator.';
      end if;
    elsif v_distance is null or v_distance > v_radius then
      v_result := 'rejected_outside_geofence';
      if v_is_management then
        v_reason :=
          'You appear ' || round(coalesce(v_distance, -1))::text ||
          ' m from the saved job-site GPS (allowed ' || round(v_radius)::text ||
          ' m). Phone Latitude: ' || round(p_latitude::numeric, 5)::text ||
          ', Phone Longitude: ' || round(p_longitude::numeric, 5)::text ||
          '. Project Latitude: ' || round(v_project.latitude::numeric, 5)::text ||
          ', Project Longitude: ' || round(v_project.longitude::numeric, 5)::text ||
          '. Device accuracy: ' || coalesce(round(p_accuracy_meters::numeric, 1)::text, 'n/a') ||
          ' m. Re-verify the project location, then try again.';
      else
        v_reason :=
          'You are approximately ' ||
          round(coalesce(v_distance, -1))::text ||
          ' m from the verified project location. The allowed radius is ' ||
          round(v_radius)::text ||
          ' m. Move closer to the job site and retry, or submit an exception request.';
      end if;
    else
      v_result := 'approved';
      v_reason := null;
    end if;
  end if;

  select * into v_open
  from public.attendance_records
  where user_id = v_uid and clock_out_time is null
  order by clock_in_time desc
  limit 1;

  if v_result = 'approved' then
    if p_action = 'WORK_STARTED' then
      if v_open.id is not null then
        v_result := 'rejected_invalid_transition';
        v_reason := 'Already clocked in. End the current session before starting a new one.';
      end if;
    elsif p_action = 'BREAK_STARTED' then
      if v_open.id is null or v_open.workflow_status is distinct from 'working' then
        v_result := 'rejected_invalid_transition';
        v_reason := 'Start break is only allowed while working.';
      elsif v_open.project_id is distinct from p_project_id then
        v_result := 'rejected_invalid_transition';
        v_reason := 'Break must be recorded for the same project as your clock-in.';
      end if;
    elsif p_action = 'BREAK_ENDED' then
      if v_open.id is null or v_open.workflow_status is distinct from 'on_break' then
        v_result := 'rejected_invalid_transition';
        v_reason := 'End break is only allowed while on break.';
      elsif v_open.project_id is distinct from p_project_id then
        v_result := 'rejected_invalid_transition';
        v_reason := 'Break must be recorded for the same project as your clock-in.';
      end if;
    elsif p_action = 'WORK_ENDED' then
      if v_open.id is null or v_open.workflow_status is distinct from 'working' then
        v_result := 'rejected_invalid_transition';
        v_reason := case
          when v_open.workflow_status = 'on_break' then 'End your break before clocking out.'
          else 'Clock out is only allowed while working.'
        end;
      elsif v_open.project_id is distinct from p_project_id then
        v_result := 'rejected_invalid_transition';
        v_reason := 'Clock out must use the same project as your clock-in.';
      end if;
    end if;
  end if;

  insert into public.attendance_attempts (
    organization_id, user_id, project_id, attendance_record_id, action,
    server_timestamp, employee_latitude, employee_longitude, device_accuracy_meters,
    project_latitude, project_longitude, calculated_distance_meters,
    authorized_radius_meters, max_accuracy_meters, validation_result, rejection_reason,
    session_id, device_info, idempotency_key
  ) values (
    v_profile.organization_id, v_uid, p_project_id, v_open.id, p_action,
    v_now, p_latitude, p_longitude, p_accuracy_meters,
    v_project.latitude, v_project.longitude, v_distance,
    v_radius, v_max_accuracy, v_result, v_reason,
    p_session_id, p_device_info, p_idempotency_key
  )
  returning id into v_attempt_id;

  if v_result is distinct from 'approved' then
    return jsonb_build_object(
      'ok', false,
      'validation_result', v_result,
      'rejection_reason', v_reason,
      'attempt_id', v_attempt_id,
      'distance_meters', v_distance,
      'authorized_radius_meters', v_radius,
      'max_accuracy_meters', v_max_accuracy,
      'employee_latitude', p_latitude,
      'employee_longitude', p_longitude,
      'project_latitude', v_project.latitude,
      'project_longitude', v_project.longitude,
      'allow_exception_request', v_result in (
        'rejected_outside_geofence',
        'rejected_poor_accuracy',
        'rejected_location_unavailable',
        'rejected_project_unverified'
      )
    );
  end if;

  if p_action = 'WORK_STARTED' then
    insert into public.attendance_records (
      organization_id, user_id, project_id, clock_in_time,
      workflow_status, break_seconds, geofence_enforced
    ) values (
      v_profile.organization_id, v_uid, p_project_id, v_now,
      'working', 0, true
    )
    returning * into v_open;
    v_record_id := v_open.id;

  elsif p_action = 'BREAK_STARTED' then
    update public.attendance_records
    set workflow_status = 'on_break',
        active_break_started_at = v_now,
        updated_at = v_now
    where id = v_open.id
    returning * into v_open;
    v_record_id := v_open.id;

  elsif p_action = 'BREAK_ENDED' then
    v_break_seconds := coalesce(v_open.break_seconds, 0)
      + extract(epoch from (v_now - v_open.active_break_started_at));
    update public.attendance_records
    set workflow_status = 'working',
        break_seconds = v_break_seconds,
        active_break_started_at = null,
        updated_at = v_now
    where id = v_open.id
    returning * into v_open;
    v_record_id := v_open.id;

  elsif p_action = 'WORK_ENDED' then
    v_elapsed_seconds := extract(epoch from (v_now - v_open.clock_in_time));
    v_break_seconds := coalesce(v_open.break_seconds, 0);
    v_paid_hours := round(((v_elapsed_seconds - v_break_seconds) / 3600.0)::numeric, 2);
    update public.attendance_records
    set clock_out_time = v_now,
        workflow_status = 'completed',
        total_hours = round((v_elapsed_seconds / 3600.0)::numeric, 2),
        paid_hours = greatest(v_paid_hours, 0),
        active_break_started_at = null,
        updated_at = v_now
    where id = v_open.id
    returning * into v_open;
    v_record_id := v_open.id;
  end if;

  insert into public.attendance_events (
    organization_id, attendance_record_id, user_id, project_id, action,
    server_timestamp, employee_latitude, employee_longitude, device_accuracy_meters,
    project_latitude, project_longitude, calculated_distance_meters,
    authorized_radius_meters, validation_result, session_id, device_info
  ) values (
    v_profile.organization_id, v_record_id, v_uid, p_project_id, p_action,
    v_now, p_latitude, p_longitude, p_accuracy_meters,
    v_project.latitude, v_project.longitude, v_distance,
    v_radius, 'approved', p_session_id, p_device_info
  )
  returning id into v_event_id;

  update public.attendance_attempts
  set attendance_record_id = v_record_id
  where id = v_attempt_id;

  return jsonb_build_object(
    'ok', true,
    'validation_result', 'approved',
    'attempt_id', v_attempt_id,
    'event_id', v_event_id,
    'attendance_record_id', v_record_id,
    'workflow_status', v_open.workflow_status,
    'server_timestamp', v_now,
    'distance_meters', v_distance,
    'paid_hours', v_open.paid_hours,
    'break_seconds', v_open.break_seconds,
    'total_hours', v_open.total_hours
  );
end;
$$;

