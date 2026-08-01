-- Fix: PostgreSQL format() does not support %.0f (C-style).
-- That crashed record_attendance_action on poor GPS / outside-geofence paths
-- with: unrecognized format() type specifier "f"

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
     and not public.has_management_role() then
    raise exception 'Project organization mismatch';
  end if;

  select * into v_settings
  from public.organization_attendance_settings
  where organization_id = v_profile.organization_id;

  v_max_accuracy := coalesce(v_settings.max_gps_accuracy_meters, 45.72);
  v_radius := coalesce(v_project.geofence_radius_meters, coalesce(v_settings.default_geofence_radius_meters, 91.44));

  if not public.has_management_role() and not public.is_assigned_to_project(p_project_id) then
    v_result := 'rejected_not_assigned';
    v_reason := 'You are not assigned to this project';
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
    if v_distance is null or v_distance > v_radius then
      v_result := 'rejected_outside_geofence';
      v_reason :=
        'You appear ' || round(coalesce(v_distance, -1))::text ||
        ' m from the job site (allowed ' || round(v_radius)::text ||
        ' m). Move closer to the project location, or submit an exception request if there is a legitimate problem.';
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
