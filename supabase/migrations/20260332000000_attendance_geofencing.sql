-- Project location geofencing + attendance workflow (additive)
-- Defaults: 300 ft (~91.44 m) radius, 150 ft (~45.72 m) max GPS accuracy

-- ---------------------------------------------------------------------------
-- Projects: verified job-site coordinates
-- ---------------------------------------------------------------------------
create type public.location_verification_status as enum (
  'unverified',
  'needs_verification',
  'verified'
);

alter table public.projects
  add column if not exists job_site_address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geofence_radius_meters numeric(10, 2) not null default 91.44,
  add column if not exists location_verification_status public.location_verification_status
    not null default 'unverified',
  add column if not exists location_verified_at timestamptz,
  add column if not exists location_verified_by uuid references public.profiles (id) on delete set null;

-- Backfill address from free-text location; mark existing projects for admin verification
update public.projects
set
  job_site_address = coalesce(job_site_address, location),
  location_verification_status = case
    when latitude is not null and longitude is not null then location_verification_status
    else 'needs_verification'::public.location_verification_status
  end
where true;

alter table public.projects
  drop constraint if exists projects_geofence_radius_positive;
alter table public.projects
  add constraint projects_geofence_radius_positive
  check (geofence_radius_meters > 0 and geofence_radius_meters <= 16093.44);

alter table public.projects
  drop constraint if exists projects_lat_lng_pair;
alter table public.projects
  add constraint projects_lat_lng_pair
  check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null
        and latitude between -90 and 90
        and longitude between -180 and 180)
  );

-- ---------------------------------------------------------------------------
-- Attendance session extensions (keep existing rows)
-- ---------------------------------------------------------------------------
create type public.attendance_workflow_status as enum (
  'working',
  'on_break',
  'completed'
);

create type public.attendance_action_type as enum (
  'WORK_STARTED',
  'BREAK_STARTED',
  'BREAK_ENDED',
  'WORK_ENDED'
);

create type public.attendance_validation_result as enum (
  'approved',
  'rejected_outside_geofence',
  'rejected_poor_accuracy',
  'rejected_location_unavailable',
  'rejected_project_unverified',
  'rejected_not_assigned',
  'rejected_invalid_transition',
  'rejected_duplicate',
  'rejected_other'
);

create type public.exception_request_status as enum (
  'pending',
  'approved',
  'rejected'
);

alter table public.attendance_records
  add column if not exists workflow_status public.attendance_workflow_status,
  add column if not exists break_seconds numeric(12, 2) not null default 0,
  add column if not exists paid_hours numeric(8, 2),
  add column if not exists active_break_started_at timestamptz,
  add column if not exists geofence_enforced boolean not null default false;

-- Legacy open rows → working; closed → completed
update public.attendance_records
set workflow_status = case
  when clock_out_time is null then 'working'::public.attendance_workflow_status
  else 'completed'::public.attendance_workflow_status
end
where workflow_status is null;

-- ---------------------------------------------------------------------------
-- Official attendance events (history preserved)
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  attendance_record_id uuid not null references public.attendance_records (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  action public.attendance_action_type not null,
  server_timestamp timestamptz not null default now(),
  employee_latitude double precision,
  employee_longitude double precision,
  device_accuracy_meters numeric(10, 2),
  project_latitude double precision,
  project_longitude double precision,
  calculated_distance_meters numeric(12, 2),
  authorized_radius_meters numeric(10, 2),
  validation_result public.attendance_validation_result not null default 'approved',
  session_id text,
  device_info jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attendance_events_record_idx
  on public.attendance_events (attendance_record_id, server_timestamp);
create index if not exists attendance_events_user_idx
  on public.attendance_events (user_id, server_timestamp desc);

-- ---------------------------------------------------------------------------
-- All attempts (approved + rejected) for admin review
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  attendance_record_id uuid references public.attendance_records (id) on delete set null,
  action public.attendance_action_type not null,
  server_timestamp timestamptz not null default now(),
  employee_latitude double precision,
  employee_longitude double precision,
  device_accuracy_meters numeric(10, 2),
  project_latitude double precision,
  project_longitude double precision,
  calculated_distance_meters numeric(12, 2),
  authorized_radius_meters numeric(10, 2),
  max_accuracy_meters numeric(10, 2),
  validation_result public.attendance_validation_result not null,
  rejection_reason text,
  session_id text,
  device_info jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  constraint attendance_attempts_idempotency unique (user_id, idempotency_key)
);

create index if not exists attendance_attempts_org_idx
  on public.attendance_attempts (organization_id, server_timestamp desc);
create index if not exists attendance_attempts_user_idx
  on public.attendance_attempts (user_id, server_timestamp desc);

-- ---------------------------------------------------------------------------
-- Admin corrections (audit trail; do not silently overwrite)
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  attendance_record_id uuid not null references public.attendance_records (id) on delete cascade,
  corrected_by uuid not null references public.profiles (id) on delete restrict,
  reason text not null,
  original_values jsonb not null,
  corrected_values jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists attendance_corrections_record_idx
  on public.attendance_corrections (attendance_record_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Exception requests (no auto-approve)
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_exception_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  requested_action public.attendance_action_type not null,
  server_timestamp timestamptz not null default now(),
  employee_latitude double precision,
  employee_longitude double precision,
  device_accuracy_meters numeric(10, 2),
  calculated_distance_meters numeric(12, 2),
  explanation text not null,
  photo_path text,
  status public.exception_request_status not null default 'pending',
  admin_decision_by uuid references public.profiles (id) on delete set null,
  admin_note text,
  decided_at timestamptz,
  resulting_attendance_record_id uuid references public.attendance_records (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_exception_requests_status_idx
  on public.attendance_exception_requests (organization_id, status, created_at desc);

create or replace function public.set_attendance_exception_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attendance_exception_requests_updated_at on public.attendance_exception_requests;
create trigger attendance_exception_requests_updated_at
  before update on public.attendance_exception_requests
  for each row execute function public.set_attendance_exception_updated_at();

-- ---------------------------------------------------------------------------
-- Relax legacy attendance update trigger for break workflow
-- (SECURITY DEFINER RPC updates still see auth.uid() as the worker)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_attendance_update()
returns trigger
language plpgsql
as $$
begin
  if public.has_management_role() then
    if new.clock_out_time is not null and new.clock_in_time is not null then
      if new.paid_hours is null then
        new.total_hours := round(
          (extract(epoch from (new.clock_out_time - new.clock_in_time)) / 3600.0)::numeric,
          2
        );
      end if;
    elsif new.clock_out_time is null then
      new.total_hours := null;
      new.paid_hours := null;
    end if;
    return new;
  end if;

  if old.clock_out_time is not null then
    raise exception 'Cannot modify a closed attendance record';
  end if;

  if new.user_id is distinct from old.user_id
     or new.organization_id is distinct from old.organization_id
     or new.clock_in_time is distinct from old.clock_in_time then
    raise exception 'Workers cannot edit clock-in details';
  end if;

  -- Geofenced break / workflow updates (clock still open)
  if new.clock_out_time is null then
    if new.workflow_status is distinct from old.workflow_status
       or new.break_seconds is distinct from old.break_seconds
       or new.active_break_started_at is distinct from old.active_break_started_at
       or new.geofence_enforced is distinct from old.geofence_enforced
       or new.notes is distinct from old.notes then
      return new;
    end if;
    raise exception 'Clock-out time is required';
  end if;

  new.total_hours := round(
    (extract(epoch from (new.clock_out_time - old.clock_in_time)) / 3600.0)::numeric,
    2
  );
  if new.break_seconds is not null then
    new.paid_hours := round(
      ((extract(epoch from (new.clock_out_time - old.clock_in_time)) - new.break_seconds) / 3600.0)::numeric,
      2
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Geo helpers
-- ---------------------------------------------------------------------------
create or replace function public.haversine_meters(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else (
      6371000.0 * acos(
        least(
          1.0,
          greatest(
            -1.0,
            cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2) - radians(lon1))
            + sin(radians(lat1)) * sin(radians(lat2))
          )
        )
      )
    )
  end;
$$;

create or replace function public.feet_to_meters(feet double precision)
returns double precision
language sql
immutable
as $$
  select feet * 0.3048;
$$;

-- Org setting for max GPS accuracy (default 150 ft ≈ 45.72 m)
create table if not exists public.organization_attendance_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  max_gps_accuracy_meters numeric(10, 2) not null default 45.72,
  default_geofence_radius_meters numeric(10, 2) not null default 91.44,
  updated_at timestamptz not null default now()
);

insert into public.organization_attendance_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- Core RPC: record attendance action with location validation
-- ---------------------------------------------------------------------------
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

  -- Assignment check (managers may act for testing only if assigned OR management — spec: employee must be assigned)
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
    -- Poor accuracy is NOT treated as outside — ask for better reading
    v_result := 'rejected_poor_accuracy';
    v_reason := format(
      'GPS accuracy is too low (%.0f m). Enable precise location, move near a window or open area, wait briefly, then retry. If the problem continues, submit an exception request.',
      coalesce(p_accuracy_meters, -1)
    );
  else
    v_distance := public.haversine_meters(
      p_latitude, p_longitude, v_project.latitude, v_project.longitude
    );
    if v_distance is null or v_distance > v_radius then
      v_result := 'rejected_outside_geofence';
      v_reason := format(
        'You appear %.0f m from the job site (allowed %.0f m). Move closer to the project location, or submit an exception request if there is a legitimate problem.',
        coalesce(v_distance, -1),
        v_radius
      );
    else
      v_result := 'approved';
      v_reason := null;
    end if;
  end if;

  -- Load open session for transition validation (even on reject we log attempt)
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

  -- Always log attempt (privacy: only self + management can read)
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

  -- Apply approved transition
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

revoke all on function public.record_attendance_action(
  public.attendance_action_type, uuid, double precision, double precision,
  double precision, jsonb, text, text
) from public;
grant execute on function public.record_attendance_action(
  public.attendance_action_type, uuid, double precision, double precision,
  double precision, jsonb, text, text
) to authenticated;

-- Admin correction with mandatory reason + audit row
create or replace function public.correct_attendance_record(
  p_record_id uuid,
  p_clock_in_time timestamptz,
  p_clock_out_time timestamptz,
  p_project_id uuid,
  p_break_seconds numeric,
  p_reason text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.attendance_records%rowtype;
  v_original jsonb;
  v_paid numeric;
  v_total numeric;
begin
  if v_uid is null or not public.has_management_role() then
    raise exception 'Management role required';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Correction reason is required';
  end if;

  select * into v_row from public.attendance_records where id = p_record_id for update;
  if not found then
    raise exception 'Attendance record not found';
  end if;

  v_original := to_jsonb(v_row);

  if p_clock_out_time is not null and p_clock_in_time is not null then
    v_total := round((extract(epoch from (p_clock_out_time - p_clock_in_time)) / 3600.0)::numeric, 2);
    v_paid := round((
      (extract(epoch from (p_clock_out_time - p_clock_in_time)) - coalesce(p_break_seconds, v_row.break_seconds, 0))
      / 3600.0
    )::numeric, 2);
  else
    v_total := null;
    v_paid := null;
  end if;

  update public.attendance_records
  set
    clock_in_time = p_clock_in_time,
    clock_out_time = p_clock_out_time,
    project_id = p_project_id,
    break_seconds = coalesce(p_break_seconds, break_seconds),
    total_hours = v_total,
    paid_hours = case when p_clock_out_time is null then null else greatest(v_paid, 0) end,
    workflow_status = case
      when p_clock_out_time is null and workflow_status = 'on_break' then 'on_break'
      when p_clock_out_time is null then 'working'
      else 'completed'
    end,
    notes = coalesce(p_notes, notes),
    updated_at = now()
  where id = p_record_id
  returning * into v_row;

  insert into public.attendance_corrections (
    organization_id, attendance_record_id, corrected_by, reason,
    original_values, corrected_values
  ) values (
    v_row.organization_id, p_record_id, v_uid, trim(p_reason),
    v_original, to_jsonb(v_row)
  );

  return jsonb_build_object('ok', true, 'record', to_jsonb(v_row));
end;
$$;

revoke all on function public.correct_attendance_record(
  uuid, timestamptz, timestamptz, uuid, numeric, text, text
) from public;
grant execute on function public.correct_attendance_record(
  uuid, timestamptz, timestamptz, uuid, numeric, text, text
) to authenticated;

-- Approve exception and optionally create attendance action without geo (admin only)
create or replace function public.resolve_attendance_exception(
  p_request_id uuid,
  p_approve boolean,
  p_admin_note text default null,
  p_create_attendance boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.attendance_exception_requests%rowtype;
  v_rpc jsonb;
begin
  if v_uid is null or not public.has_management_role() then
    raise exception 'Management role required';
  end if;

  select * into v_req from public.attendance_exception_requests where id = p_request_id for update;
  if not found then
    raise exception 'Exception request not found';
  end if;
  if v_req.status is distinct from 'pending' then
    raise exception 'Exception request already resolved';
  end if;

  if not p_approve then
    update public.attendance_exception_requests
    set status = 'rejected',
        admin_decision_by = v_uid,
        admin_note = p_admin_note,
        decided_at = now()
    where id = p_request_id
    returning * into v_req;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  -- Approval alone does not create attendance unless admin opts in with create flag.
  -- When creating, use project coordinates as employee location (admin-authorized exception).
  if p_create_attendance then
    select public.record_attendance_action_admin_override(
      v_req.user_id,
      v_req.requested_action,
      v_req.project_id,
      p_admin_note
    ) into v_rpc;
  else
    v_rpc := jsonb_build_object('ok', true, 'attendance_created', false);
  end if;

  update public.attendance_exception_requests
  set status = 'approved',
      admin_decision_by = v_uid,
      admin_note = p_admin_note,
      decided_at = now(),
      resulting_attendance_record_id = nullif(v_rpc->>'attendance_record_id', '')::uuid
  where id = p_request_id
  returning * into v_req;

  return jsonb_build_object('ok', true, 'status', 'approved', 'attendance', v_rpc);
end;
$$;

-- Admin override to create attendance after exception approval (bypasses geofence)
create or replace function public.record_attendance_action_admin_override(
  p_user_id uuid,
  p_action public.attendance_action_type,
  p_project_id uuid,
  p_note text default null
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
  v_open public.attendance_records%rowtype;
  v_now timestamptz := now();
  v_record_id uuid;
  v_break_seconds numeric;
  v_elapsed_seconds numeric;
  v_paid_hours numeric;
begin
  if v_uid is null or not public.has_management_role() then
    raise exception 'Management role required';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then raise exception 'Employee not found'; end if;
  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'Project not found'; end if;

  select * into v_open
  from public.attendance_records
  where user_id = p_user_id and clock_out_time is null
  order by clock_in_time desc
  limit 1;

  if p_action = 'WORK_STARTED' then
    if v_open.id is not null then raise exception 'Employee already clocked in'; end if;
    insert into public.attendance_records (
      organization_id, user_id, project_id, clock_in_time,
      workflow_status, break_seconds, geofence_enforced, notes
    ) values (
      v_profile.organization_id, p_user_id, p_project_id, v_now,
      'working', 0, false, p_note
    ) returning * into v_open;
  elsif p_action = 'BREAK_STARTED' then
    if v_open.id is null or v_open.workflow_status is distinct from 'working' then
      raise exception 'Invalid break start';
    end if;
    update public.attendance_records
    set workflow_status = 'on_break', active_break_started_at = v_now, updated_at = v_now
    where id = v_open.id returning * into v_open;
  elsif p_action = 'BREAK_ENDED' then
    if v_open.id is null or v_open.workflow_status is distinct from 'on_break' then
      raise exception 'Invalid break end';
    end if;
    v_break_seconds := coalesce(v_open.break_seconds, 0)
      + extract(epoch from (v_now - v_open.active_break_started_at));
    update public.attendance_records
    set workflow_status = 'working', break_seconds = v_break_seconds,
        active_break_started_at = null, updated_at = v_now
    where id = v_open.id returning * into v_open;
  elsif p_action = 'WORK_ENDED' then
    if v_open.id is null or v_open.workflow_status is distinct from 'working' then
      raise exception 'Invalid clock out';
    end if;
    v_elapsed_seconds := extract(epoch from (v_now - v_open.clock_in_time));
    v_break_seconds := coalesce(v_open.break_seconds, 0);
    v_paid_hours := round(((v_elapsed_seconds - v_break_seconds) / 3600.0)::numeric, 2);
    update public.attendance_records
    set clock_out_time = v_now, workflow_status = 'completed',
        total_hours = round((v_elapsed_seconds / 3600.0)::numeric, 2),
        paid_hours = greatest(v_paid_hours, 0),
        active_break_started_at = null, updated_at = v_now,
        notes = coalesce(p_note, notes)
    where id = v_open.id returning * into v_open;
  end if;

  v_record_id := v_open.id;

  insert into public.attendance_events (
    organization_id, attendance_record_id, user_id, project_id, action,
    server_timestamp, validation_result, device_info
  ) values (
    v_profile.organization_id, v_record_id, p_user_id, p_project_id, p_action,
    v_now, 'approved', jsonb_build_object('admin_override', true, 'by', v_uid, 'note', p_note)
  );

  insert into public.attendance_attempts (
    organization_id, user_id, project_id, attendance_record_id, action,
    server_timestamp, validation_result, rejection_reason, device_info
  ) values (
    v_profile.organization_id, p_user_id, p_project_id, v_record_id, p_action,
    v_now, 'approved', 'Admin exception override',
    jsonb_build_object('admin_override', true, 'by', v_uid)
  );

  return jsonb_build_object(
    'ok', true,
    'attendance_record_id', v_record_id,
    'workflow_status', v_open.workflow_status
  );
end;
$$;

revoke all on function public.record_attendance_action_admin_override(uuid, public.attendance_action_type, uuid, text) from public;
grant execute on function public.record_attendance_action_admin_override(uuid, public.attendance_action_type, uuid, text) to authenticated;

revoke all on function public.resolve_attendance_exception(uuid, boolean, text, boolean) from public;
grant execute on function public.resolve_attendance_exception(uuid, boolean, text, boolean) to authenticated;

-- Managers verify project location
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
begin
  if v_uid is null or not public.has_management_role() then
    raise exception 'Management role required';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'Latitude and longitude are required';
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

  if not found then raise exception 'Project not found'; end if;
  return v_row;
end;
$$;

revoke all on function public.verify_project_location(uuid, double precision, double precision, text, numeric) from public;
grant execute on function public.verify_project_location(uuid, double precision, double precision, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.attendance_events enable row level security;
alter table public.attendance_attempts enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.attendance_exception_requests enable row level security;
alter table public.organization_attendance_settings enable row level security;

-- Events: own or management (location sensitive — not other employees)
drop policy if exists "Users view own attendance events" on public.attendance_events;
create policy "Users view own attendance events"
  on public.attendance_events for select
  to authenticated
  using (
    public.is_approved_user()
    and (user_id = (select auth.uid()) or public.has_management_role())
  );

drop policy if exists "Users view own attendance attempts" on public.attendance_attempts;
create policy "Users view own attendance attempts"
  on public.attendance_attempts for select
  to authenticated
  using (
    public.is_approved_user()
    and (user_id = (select auth.uid()) or public.has_management_role())
  );

drop policy if exists "Managers view corrections" on public.attendance_corrections;
create policy "Managers view corrections"
  on public.attendance_corrections for select
  to authenticated
  using (public.has_management_role());

drop policy if exists "Users manage own exception requests" on public.attendance_exception_requests;
create policy "Users manage own exception requests"
  on public.attendance_exception_requests for select
  to authenticated
  using (
    public.is_approved_user()
    and (user_id = (select auth.uid()) or public.has_management_role())
  );

drop policy if exists "Users create own exception requests" on public.attendance_exception_requests;
create policy "Users create own exception requests"
  on public.attendance_exception_requests for insert
  to authenticated
  with check (
    public.is_approved_user()
    and user_id = (select auth.uid())
    and public.same_organization(organization_id)
  );

drop policy if exists "Managers update exception requests" on public.attendance_exception_requests;
create policy "Managers update exception requests"
  on public.attendance_exception_requests for update
  to authenticated
  using (public.has_management_role())
  with check (public.has_management_role());

drop policy if exists "Approved users view attendance settings" on public.organization_attendance_settings;
create policy "Approved users view attendance settings"
  on public.organization_attendance_settings for select
  to authenticated
  using (public.is_approved_user() and public.same_organization(organization_id));

drop policy if exists "Admins update attendance settings" on public.organization_attendance_settings;
create policy "Admins update attendance settings"
  on public.organization_attendance_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Workers should use RPC for new geofenced attendance; keep legacy insert for compatibility
-- but require project assignment. Direct inserts will not have geofence_enforced=true from RPC path.

-- Storage for exception photos
insert into storage.buckets (id, name, public)
values ('attendance-exceptions', 'attendance-exceptions', false)
on conflict (id) do nothing;

drop policy if exists "Users upload attendance exception photos" on storage.objects;
create policy "Users upload attendance exception photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attendance-exceptions'
    and public.is_approved_user()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users read own attendance exception photos" on storage.objects;
create policy "Users read own attendance exception photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attendance-exceptions'
    and public.is_approved_user()
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.has_management_role()
    )
  );
