-- STEP 2 of 2 — Attendance exception repair workflow
-- Prerequisites: 20260336000000_attendance_exception_status_enums.sql succeeded.
--
-- Fixes:
-- 1) correct_attendance_record clears open break, validates timeline, reconstructs events
-- 2) Duplicate active exception prevention (partial unique indexes + submit RPC)
-- 3) Approve + correct in one transaction
-- 4) Idempotency, concurrency, notifications, activity
-- 5) Safe cleanup of existing duplicate pending requests

-- ---------------------------------------------------------------------------
-- Schema extensions
-- ---------------------------------------------------------------------------
alter table public.attendance_exception_requests
  add column if not exists attendance_record_id uuid references public.attendance_records (id) on delete set null,
  add column if not exists work_date date,
  add column if not exists idempotency_key text,
  add column if not exists correction_id uuid references public.attendance_corrections (id) on delete set null,
  add column if not exists duplicate_of_request_id uuid references public.attendance_exception_requests (id) on delete set null,
  add column if not exists follow_up_note text,
  add column if not exists review_started_at timestamptz,
  add column if not exists revision integer not null default 1;

alter table public.attendance_corrections
  add column if not exists exception_request_id uuid references public.attendance_exception_requests (id) on delete set null,
  add column if not exists correction_mode text not null default 'simple',
  add column if not exists correction_reason_code text,
  add column if not exists administrative_notes text,
  add column if not exists original_timeline jsonb,
  add column if not exists corrected_timeline jsonb,
  add column if not exists original_totals jsonb,
  add column if not exists corrected_totals jsonb,
  add column if not exists revision integer not null default 1,
  add column if not exists creation_source text not null default 'timesheet',
  add column if not exists idempotency_key text,
  add column if not exists request_status_before text,
  add column if not exists request_status_after text;

-- Backfill work_date / attendance_record_id for existing requests
update public.attendance_exception_requests r
set work_date = coalesce(
  r.work_date,
  (timezone('America/New_York', r.server_timestamp))::date
)
where r.work_date is null;

update public.attendance_exception_requests r
set attendance_record_id = s.id
from public.attendance_records s
where r.attendance_record_id is null
  and s.user_id = r.user_id
  and s.project_id = r.project_id
  and (timezone('America/New_York', s.clock_in_time))::date
      = coalesce(r.work_date, (timezone('America/New_York', r.server_timestamp))::date);

create unique index if not exists attendance_exception_idempotency_uidx
  on public.attendance_exception_requests (user_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists attendance_exception_active_session_uidx
  on public.attendance_exception_requests (
    user_id, project_id, attendance_record_id, requested_action
  )
  where status in ('pending', 'under_review')
    and attendance_record_id is not null;

create unique index if not exists attendance_exception_active_day_uidx
  on public.attendance_exception_requests (
    user_id, project_id, work_date, requested_action
  )
  where status in ('pending', 'under_review')
    and attendance_record_id is null
    and work_date is not null;

create unique index if not exists attendance_corrections_idempotency_uidx
  on public.attendance_corrections (corrected_by, idempotency_key)
  where idempotency_key is not null;

create index if not exists attendance_exception_requests_record_idx
  on public.attendance_exception_requests (attendance_record_id, status);

create index if not exists attendance_exception_requests_user_day_idx
  on public.attendance_exception_requests (user_id, work_date, status);

-- ---------------------------------------------------------------------------
-- Safe cleanup of existing duplicate pending requests (no notifications)
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    user_id,
    project_id,
    requested_action,
    coalesce(attendance_record_id::text, work_date::text, '') as issue_key,
    row_number() over (
      partition by
        user_id,
        project_id,
        requested_action,
        coalesce(attendance_record_id::text, work_date::text, '')
      order by created_at asc, id asc
    ) as rn,
    first_value(id) over (
      partition by
        user_id,
        project_id,
        requested_action,
        coalesce(attendance_record_id::text, work_date::text, '')
      order by created_at asc, id asc
    ) as canonical_id
  from public.attendance_exception_requests
  where status = 'pending'
)
update public.attendance_exception_requests r
set
  status = 'cancelled',
  admin_note = coalesce(r.admin_note, '') ||
    case when coalesce(r.admin_note, '') = '' then '' else E'\n' end ||
    'Auto-cancelled as duplicate of request ' || ranked.canonical_id::text,
  duplicate_of_request_id = ranked.canonical_id,
  decided_at = coalesce(r.decided_at, now()),
  updated_at = now()
from ranked
where r.id = ranked.id
  and ranked.rn > 1;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.attendance_exception_is_active(
  p_status public.exception_request_status
)
returns boolean
language sql
immutable
as $$
  select p_status in (
    'pending'::public.exception_request_status,
    'under_review'::public.exception_request_status
  );
$$;

create or replace function public.insert_admin_attendance_event(
  p_organization_id uuid,
  p_attendance_record_id uuid,
  p_user_id uuid,
  p_project_id uuid,
  p_action public.attendance_action_type,
  p_server_timestamp timestamptz,
  p_correction_id uuid,
  p_corrected_by uuid,
  p_reason text,
  p_exception_request_id uuid default null,
  p_replaces_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.attendance_events (
    organization_id, attendance_record_id, user_id, project_id, action,
    server_timestamp, validation_result, device_info
  ) values (
    p_organization_id,
    p_attendance_record_id,
    p_user_id,
    p_project_id,
    p_action,
    p_server_timestamp,
    'approved',
    jsonb_build_object(
      'isAdministrativeCorrection', true,
      'correctionId', p_correction_id,
      'correctedByUserId', p_corrected_by,
      'correctionReason', p_reason,
      'generatedFromExceptionRequest', p_exception_request_id,
      'replacesEventId', p_replaces_event_id,
      'correctedAt', now()
    )
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submit exception (duplicate-safe + idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.submit_attendance_exception(
  p_project_id uuid,
  p_requested_action public.attendance_action_type,
  p_explanation text,
  p_employee_latitude double precision default null,
  p_employee_longitude double precision default null,
  p_device_accuracy_meters numeric default null,
  p_calculated_distance_meters numeric default null,
  p_photo_path text default null,
  p_attendance_record_id uuid default null,
  p_idempotency_key text default null,
  p_follow_up_note text default null
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
  v_record public.attendance_records%rowtype;
  v_existing public.attendance_exception_requests%rowtype;
  v_row public.attendance_exception_requests%rowtype;
  v_work_date date;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.approval_status is distinct from 'approved' or not v_profile.is_active then
    raise exception 'Approved active profile required';
  end if;

  if p_explanation is null or length(trim(p_explanation)) < 3 then
    raise exception 'Please explain the attendance problem';
  end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'Project not found';
  end if;
  if v_project.organization_id is distinct from v_profile.organization_id then
    raise exception 'Project organization mismatch';
  end if;
  if not public.has_management_role() and not public.is_assigned_to_project(p_project_id) then
    raise exception 'You are not assigned to this project';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.attendance_exception_requests
    where user_id = v_uid and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'ok', true,
        'duplicate', false,
        'idempotent_replay', true,
        'request', to_jsonb(v_existing)
      );
    end if;
  end if;

  if p_attendance_record_id is not null then
    select * into v_record from public.attendance_records where id = p_attendance_record_id;
    if not found or v_record.user_id is distinct from v_uid then
      raise exception 'Attendance session not found';
    end if;
  else
    select * into v_record
    from public.attendance_records
    where user_id = v_uid
      and project_id = p_project_id
      and clock_out_time is null
    order by clock_in_time desc
    limit 1;
  end if;

  v_work_date := coalesce(
    case when v_record.id is not null
      then (timezone('America/New_York', v_record.clock_in_time))::date
    end,
    (timezone('America/New_York', now()))::date
  );

  select * into v_existing
  from public.attendance_exception_requests
  where user_id = v_uid
    and project_id = p_project_id
    and requested_action = p_requested_action
    and public.attendance_exception_is_active(status)
    and (
      (v_record.id is not null and attendance_record_id = v_record.id)
      or (
        v_record.id is null
        and attendance_record_id is null
        and work_date = v_work_date
      )
    )
  order by created_at asc
  limit 1;

  if found then
    if p_follow_up_note is not null and length(trim(p_follow_up_note)) > 0
       and v_existing.status = 'pending' then
      update public.attendance_exception_requests
      set follow_up_note = trim(p_follow_up_note),
          updated_at = now()
      where id = v_existing.id
      returning * into v_existing;
    end if;

    return jsonb_build_object(
      'ok', false,
      'duplicate', true,
      'code', 'ACTIVE_EXCEPTION_EXISTS',
      'message', 'You already submitted a request for this attendance issue. Management has not completed its review yet.',
      'request', to_jsonb(v_existing)
    );
  end if;

  begin
    insert into public.attendance_exception_requests (
      organization_id, user_id, project_id, requested_action, explanation,
      employee_latitude, employee_longitude, device_accuracy_meters,
      calculated_distance_meters, photo_path, status,
      attendance_record_id, work_date, idempotency_key, follow_up_note
    ) values (
      v_profile.organization_id, v_uid, p_project_id, p_requested_action, trim(p_explanation),
      p_employee_latitude, p_employee_longitude, p_device_accuracy_meters,
      p_calculated_distance_meters, p_photo_path, 'pending',
      v_record.id, v_work_date, p_idempotency_key, nullif(trim(coalesce(p_follow_up_note, '')), '')
    )
    returning * into v_row;
  exception
    when unique_violation then
      select * into v_existing
      from public.attendance_exception_requests
      where user_id = v_uid
        and project_id = p_project_id
        and requested_action = p_requested_action
        and public.attendance_exception_is_active(status)
      order by created_at asc
      limit 1;
      return jsonb_build_object(
        'ok', false,
        'duplicate', true,
        'code', 'ACTIVE_EXCEPTION_EXISTS',
        'message', 'You already submitted a request for this attendance issue. Management has not completed its review yet.',
        'request', to_jsonb(v_existing)
      );
  end;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'message', 'Your attendance correction request was submitted successfully. Management will review it.',
    'request', to_jsonb(v_row)
  );
end;
$$;

revoke all on function public.submit_attendance_exception(
  uuid, public.attendance_action_type, text, double precision, double precision,
  numeric, numeric, text, uuid, text, text
) from public;
grant execute on function public.submit_attendance_exception(
  uuid, public.attendance_action_type, text, double precision, double precision,
  numeric, numeric, text, uuid, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Unified administrative correction (simple + detailed)
-- Drop legacy 7-arg overload so PostgREST is not ambiguous.
-- ---------------------------------------------------------------------------
drop function if exists public.correct_attendance_record(
  uuid, timestamptz, timestamptz, uuid, numeric, text, text
);

create or replace function public.correct_attendance_record(
  p_record_id uuid,
  p_clock_in_time timestamptz,
  p_clock_out_time timestamptz,
  p_project_id uuid,
  p_break_seconds numeric,
  p_reason text,
  p_notes text default null,
  p_exception_request_id uuid default null,
  p_correction_mode text default 'simple',
  p_timeline jsonb default null,
  p_idempotency_key text default null,
  p_expected_updated_at timestamptz default null,
  p_reason_code text default null
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
  v_original_events jsonb;
  v_paid numeric;
  v_total numeric;
  v_elapsed numeric;
  v_break numeric;
  v_correction_id uuid;
  v_existing_correction public.attendance_corrections%rowtype;
  v_req public.attendance_exception_requests%rowtype;
  v_mode text := lower(coalesce(nullif(trim(p_correction_mode), ''), 'simple'));
  v_event jsonb;
  v_action text;
  v_ts timestamptz;
  v_exclude boolean;
  v_prev_break_start timestamptz;
  v_break_end timestamptz;
  v_has_work_ended boolean := false;
  v_has_break_ended boolean := false;
  v_timeline jsonb := '[]'::jsonb;
  v_corrected_events jsonb := '[]'::jsonb;
  v_revision integer;
  v_worker_name text;
  v_admin_name text;
  v_project_name text;
  v_source text := case
    when p_exception_request_id is not null then 'exception_request'
    else 'timesheet'
  end;
begin
  if v_uid is null or not public.has_management_role() then
    raise exception 'You do not have permission to correct this attendance record.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Correction reason is required.';
  end if;
  if p_clock_in_time is null then
    raise exception 'Clock In is required.';
  end if;
  if p_clock_out_time is not null and p_clock_out_time <= p_clock_in_time then
    raise exception 'Clock Out must be later than Clock In.';
  end if;
  if p_break_seconds is not null and p_break_seconds < 0 then
    raise exception 'Total break time is not negative.';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing_correction
    from public.attendance_corrections
    where corrected_by = v_uid and idempotency_key = p_idempotency_key;
    if found then
      select * into v_row from public.attendance_records where id = p_record_id;
      return jsonb_build_object(
        'ok', true,
        'idempotent_replay', true,
        'message', 'Attendance correction saved successfully.',
        'correction_id', v_existing_correction.id,
        'record', to_jsonb(v_row)
      );
    end if;
  end if;

  select * into v_row from public.attendance_records where id = p_record_id for update;
  if not found then
    raise exception 'Attendance record not found.';
  end if;

  if p_expected_updated_at is not null
     and v_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This attendance record changed after you opened it. Refresh the timeline before applying the correction.';
  end if;

  if p_project_id is null then
    raise exception 'The project selected for this correction is not valid.';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'The project selected for this correction is not valid.';
  end if;

  if p_exception_request_id is not null then
    select * into v_req
    from public.attendance_exception_requests
    where id = p_exception_request_id
    for update;
    if not found then
      raise exception 'Exception request not found.';
    end if;
    if not public.attendance_exception_is_active(v_req.status)
       and v_req.status is distinct from 'approved' then
      select coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), 'another administrator')
        into v_admin_name
      from public.profiles p where p.id = v_req.admin_decision_by;
      raise exception 'This request has already been resolved by % on %.',
        coalesce(v_admin_name, 'another administrator'),
        coalesce(to_char(v_req.decided_at at time zone 'America/New_York', 'Mon DD, YYYY HH12:MI AM'), 'an earlier time');
    end if;
    if v_req.correction_id is not null then
      select * into v_existing_correction from public.attendance_corrections where id = v_req.correction_id;
      return jsonb_build_object(
        'ok', true,
        'idempotent_replay', true,
        'message', 'This request has already been resolved.',
        'correction_id', v_req.correction_id,
        'record', to_jsonb(v_row)
      );
    end if;
  end if;

  v_original := to_jsonb(v_row);
  select coalesce(jsonb_agg(to_jsonb(e) order by e.server_timestamp, e.created_at), '[]'::jsonb)
    into v_original_events
  from public.attendance_events e
  where e.attendance_record_id = p_record_id;

  -- Build effective timeline
  if v_mode = 'detailed' and p_timeline is not null and jsonb_typeof(p_timeline) = 'array' then
    v_timeline := p_timeline;
  else
    -- Simple mode reconstruction
    v_timeline := jsonb_build_array(
      jsonb_build_object('action', 'WORK_STARTED', 'timestamp', p_clock_in_time)
    );

    if coalesce(p_break_seconds, 0) > 0 then
      if v_row.active_break_started_at is not null then
        v_prev_break_start := v_row.active_break_started_at;
      else
        select e.server_timestamp into v_prev_break_start
        from public.attendance_events e
        where e.attendance_record_id = p_record_id
          and e.action = 'BREAK_STARTED'
          and coalesce((e.device_info->>'excludedFromActiveCalculation')::boolean, false) is not true
        order by e.server_timestamp desc
        limit 1;
      end if;

      if v_prev_break_start is null then
        -- No original break start: place break in the middle of the shift when clock out exists
        if p_clock_out_time is null then
          raise exception 'This correction cannot be saved because the break is missing a start time. Use Detailed Timeline to enter Break Start and Break End.';
        end if;
        v_prev_break_start := p_clock_in_time
          + ((p_clock_out_time - p_clock_in_time) / 2)
          - make_interval(secs => (p_break_seconds / 2.0));
      end if;

      v_break_end := v_prev_break_start + make_interval(secs => p_break_seconds::double precision);

      if p_clock_out_time is not null and v_break_end > p_clock_out_time then
        raise exception 'A break ends after the selected Clock Out time.';
      end if;
      if v_prev_break_start <= p_clock_in_time then
        raise exception 'Break Start must be later than Clock In.';
      end if;
      if v_break_end <= v_prev_break_start then
        raise exception 'Break End must be later than Break Start.';
      end if;

      v_timeline := v_timeline
        || jsonb_build_array(jsonb_build_object('action', 'BREAK_STARTED', 'timestamp', v_prev_break_start))
        || jsonb_build_array(jsonb_build_object('action', 'BREAK_ENDED', 'timestamp', v_break_end));
    elsif coalesce(p_break_seconds, 0) = 0 and v_row.active_break_started_at is not null then
      -- Zero break with accidental open break: exclude from active calculation (history preserved)
      update public.attendance_events
      set device_info = coalesce(device_info, '{}'::jsonb) || jsonb_build_object(
        'excludedFromActiveCalculation', true,
        'supersededByCorrection', true,
        'exclusionReason', 'Accidental break excluded by administrative correction'
      )
      where attendance_record_id = p_record_id
        and action = 'BREAK_STARTED'
        and server_timestamp = v_row.active_break_started_at;
    end if;

    if p_clock_out_time is not null then
      v_timeline := v_timeline
        || jsonb_build_array(jsonb_build_object('action', 'WORK_ENDED', 'timestamp', p_clock_out_time));
    end if;
  end if;

  -- Validate detailed / constructed timeline
  v_prev_break_start := null;
  v_break := 0;
  for v_event in
    select value from jsonb_array_elements(v_timeline) as t(value)
    order by (t.value->>'timestamp')::timestamptz
  loop
    v_exclude := coalesce((v_event->>'exclude')::boolean, false)
      or coalesce((v_event->>'excluded')::boolean, false);
    if v_exclude then
      continue;
    end if;
    v_action := upper(v_event->>'action');
    begin
      v_ts := (v_event->>'timestamp')::timestamptz;
    exception when others then
      raise exception 'The entered date or time could not be processed.';
    end;
    if v_ts is null then
      raise exception 'The entered date or time could not be processed.';
    end if;

    if v_action = 'WORK_STARTED' then
      null;
    elsif v_action = 'BREAK_STARTED' then
      if v_ts <= p_clock_in_time then
        raise exception 'Break Start must be later than Clock In.';
      end if;
      if v_prev_break_start is not null then
        raise exception 'Breaks do not overlap. End the previous break before starting another.';
      end if;
      v_prev_break_start := v_ts;
    elsif v_action = 'BREAK_ENDED' then
      if v_prev_break_start is null then
        raise exception 'Every Break Start must have one Break End.';
      end if;
      if v_ts <= v_prev_break_start then
        raise exception 'Break End must be later than Break Start.';
      end if;
      if p_clock_out_time is not null and v_ts > p_clock_out_time then
        raise exception 'A break ends after the selected Clock Out time.';
      end if;
      v_break := v_break + extract(epoch from (v_ts - v_prev_break_start));
      v_prev_break_start := null;
      v_has_break_ended := true;
    elsif v_action = 'WORK_ENDED' then
      if v_prev_break_start is not null then
        raise exception 'This correction cannot be saved because the break is missing an ending time. Enter a Break End or use Simple Correction to generate it.';
      end if;
      if v_ts <= p_clock_in_time then
        raise exception 'Clock Out must be later than Clock In.';
      end if;
      v_has_work_ended := true;
    else
      raise exception 'Unsupported attendance action in correction timeline: %.', v_action;
    end if;
  end loop;

  if v_prev_break_start is not null and p_clock_out_time is not null then
    raise exception 'This correction cannot be saved because the break is missing an ending time. Enter a Break End or use Simple Correction to generate it.';
  end if;

  if v_mode = 'detailed' then
    v_break := coalesce(v_break, 0);
  else
    v_break := coalesce(p_break_seconds, v_break, 0);
  end if;

  if p_clock_out_time is not null then
    v_elapsed := extract(epoch from (p_clock_out_time - p_clock_in_time));
    if v_break > v_elapsed then
      raise exception 'Break time cannot exceed the total work-session duration.';
    end if;
    v_total := round((v_elapsed / 3600.0)::numeric, 2);
    v_paid := round(((v_elapsed - v_break) / 3600.0)::numeric, 2);
  else
    v_total := null;
    v_paid := null;
  end if;

  select coalesce(max(revision), 0) + 1 into v_revision
  from public.attendance_corrections
  where attendance_record_id = p_record_id;

  -- Create correction audit first (id used on generated events)
  insert into public.attendance_corrections (
    organization_id, attendance_record_id, corrected_by, reason,
    original_values, corrected_values,
    exception_request_id, correction_mode, correction_reason_code,
    administrative_notes, original_timeline, corrected_timeline,
    original_totals, corrected_totals, revision, creation_source,
    idempotency_key, request_status_before, request_status_after
  ) values (
    v_row.organization_id, p_record_id, v_uid, trim(p_reason),
    v_original,
    '{}'::jsonb,
    p_exception_request_id,
    v_mode,
    p_reason_code,
    p_notes,
    v_original_events,
    v_timeline,
    jsonb_build_object(
      'total_hours', v_row.total_hours,
      'paid_hours', v_row.paid_hours,
      'break_seconds', v_row.break_seconds,
      'workflow_status', v_row.workflow_status
    ),
    jsonb_build_object(
      'total_hours', v_total,
      'paid_hours', case when p_clock_out_time is null then null else greatest(v_paid, 0) end,
      'break_seconds', v_break,
      'workflow_status', case when p_clock_out_time is null then 'working' else 'completed' end
    ),
    v_revision,
    v_source,
    p_idempotency_key,
    case when v_req.id is not null then v_req.status::text end,
    case when p_exception_request_id is not null then 'resolved' end
  )
  returning id into v_correction_id;

  -- Mark prior non-admin events as superseded for audit clarity (do not delete)
  update public.attendance_events
  set device_info = coalesce(device_info, '{}'::jsonb) || jsonb_build_object(
    'supersededByCorrection', true,
    'correctionId', v_correction_id,
    'excludedFromActiveCalculation', true
  )
  where attendance_record_id = p_record_id
    and coalesce((device_info->>'isAdministrativeCorrection')::boolean, false) is not true;

  -- Insert reconstructed active events
  for v_event in
    select value from jsonb_array_elements(v_timeline) as t(value)
    order by (t.value->>'timestamp')::timestamptz
  loop
    if coalesce((v_event->>'exclude')::boolean, false)
       or coalesce((v_event->>'excluded')::boolean, false) then
      continue;
    end if;
    perform public.insert_admin_attendance_event(
      v_row.organization_id,
      p_record_id,
      v_row.user_id,
      p_project_id,
      (upper(v_event->>'action'))::public.attendance_action_type,
      (v_event->>'timestamp')::timestamptz,
      v_correction_id,
      v_uid,
      trim(p_reason),
      p_exception_request_id,
      null
    );
  end loop;

  update public.attendance_records
  set
    clock_in_time = p_clock_in_time,
    clock_out_time = p_clock_out_time,
    project_id = p_project_id,
    break_seconds = coalesce(v_break, 0),
    total_hours = v_total,
    paid_hours = case when p_clock_out_time is null then null else greatest(v_paid, 0) end,
    workflow_status = case
      when p_clock_out_time is null and v_prev_break_start is not null then 'on_break'::public.attendance_workflow_status
      when p_clock_out_time is null then 'working'::public.attendance_workflow_status
      else 'completed'::public.attendance_workflow_status
    end,
    active_break_started_at = case
      when p_clock_out_time is not null then null
      when v_mode = 'detailed' and v_prev_break_start is not null then v_prev_break_start
      else null
    end,
    notes = coalesce(p_notes, notes),
    geofence_enforced = false,
    updated_at = now()
  where id = p_record_id
  returning * into v_row;

  update public.attendance_corrections
  set corrected_values = to_jsonb(v_row)
  where id = v_correction_id;

  if p_exception_request_id is not null then
    update public.attendance_exception_requests
    set
      status = 'resolved',
      admin_decision_by = v_uid,
      admin_note = coalesce(p_notes, admin_note),
      decided_at = now(),
      correction_id = v_correction_id,
      resulting_attendance_record_id = p_record_id,
      updated_at = now()
    where id = p_exception_request_id;
  end if;

  select coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'Worker')
    into v_worker_name from public.profiles where id = v_row.user_id;
  select coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'Management')
    into v_admin_name from public.profiles where id = v_uid;
  select name into v_project_name from public.projects where id = p_project_id;

  perform public.emit_project_activity(
    v_row.organization_id,
    p_project_id,
    v_uid,
    'ATTENDANCE_CORRECTED',
    'attendance_correction',
    v_correction_id,
    p_record_id,
    v_admin_name || ' corrected ' || v_worker_name || '''s attendance',
    left(
      coalesce(v_project_name, 'Project') || ' · paid '
      || coalesce(v_row.paid_hours::text, 'n/a') || 'h · ' || trim(p_reason),
      180
    ),
    '/timesheets?record=' || p_record_id::text,
    null,
    false,
    array[v_row.user_id],
    jsonb_build_object(
      'correction_id', v_correction_id,
      'exception_request_id', p_exception_request_id,
      'attendance_record_id', p_record_id,
      'paid_hours', v_row.paid_hours,
      'break_seconds', v_row.break_seconds
    )
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Attendance correction saved successfully.',
    'correction_id', v_correction_id,
    'record', to_jsonb(v_row),
    'totals', jsonb_build_object(
      'total_hours', v_total,
      'paid_hours', case when p_clock_out_time is null then null else greatest(v_paid, 0) end,
      'break_seconds', v_break
    ),
    'request_status', case when p_exception_request_id is not null then 'resolved' else null end
  );
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select * into v_existing_correction
      from public.attendance_corrections
      where corrected_by = v_uid and idempotency_key = p_idempotency_key;
      if found then
        select * into v_row from public.attendance_records where id = p_record_id;
        return jsonb_build_object(
          'ok', true,
          'idempotent_replay', true,
          'message', 'Attendance correction saved successfully.',
          'correction_id', v_existing_correction.id,
          'record', to_jsonb(v_row)
        );
      end if;
    end if;
    raise;
end;
$$;

revoke all on function public.correct_attendance_record(
  uuid, timestamptz, timestamptz, uuid, numeric, text, text,
  uuid, text, jsonb, text, timestamptz, text
) from public;
grant execute on function public.correct_attendance_record(
  uuid, timestamptz, timestamptz, uuid, numeric, text, text,
  uuid, text, jsonb, text, timestamptz, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Resolve exception (reject / approve-only / start review) — improved messages
-- ---------------------------------------------------------------------------
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
  v_admin_name text;
begin
  if v_uid is null or not public.has_management_role() then
    raise exception 'You do not have permission to review attendance exceptions.';
  end if;

  select * into v_req from public.attendance_exception_requests where id = p_request_id for update;
  if not found then
    raise exception 'Exception request not found.';
  end if;

  if not public.attendance_exception_is_active(v_req.status) then
    select coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), 'another administrator')
      into v_admin_name
    from public.profiles p where p.id = v_req.admin_decision_by;
    raise exception 'This request has already been resolved by % on %.',
      coalesce(v_admin_name, 'another administrator'),
      coalesce(to_char(v_req.decided_at at time zone 'America/New_York', 'Mon DD, YYYY HH12:MI AM'), 'an earlier time');
  end if;

  if not p_approve then
    if p_admin_note is null or length(trim(p_admin_note)) < 3 then
      raise exception 'Rejection reason is required.';
    end if;
    update public.attendance_exception_requests
    set status = 'rejected',
        admin_decision_by = v_uid,
        admin_note = trim(p_admin_note),
        decided_at = now(),
        updated_at = now()
    where id = p_request_id
    returning * into v_req;

    perform public.emit_project_activity(
      v_req.organization_id,
      v_req.project_id,
      v_uid,
      'ATTENTION_REVIEWED',
      'attendance_exception',
      v_req.id,
      null,
      'Attendance exception request was not approved',
      left(trim(p_admin_note), 180),
      '/timesheets?exception=' || v_req.id::text,
      null,
      false,
      array[v_req.user_id],
      jsonb_build_object('status', 'rejected')
    );

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  if p_create_attendance then
    -- Prefer full correction path for incomplete sessions; keep legacy override for simple clock-in
    begin
      select public.record_attendance_action_admin_override(
        v_req.user_id,
        v_req.requested_action,
        v_req.project_id,
        p_admin_note
      ) into v_rpc;
    exception when others then
      raise exception
        'Could not create attendance from this exception automatically (%). Open the related timesheet and use Approve and Correct Attendance instead.',
        SQLERRM;
    end;
  else
    v_rpc := jsonb_build_object('ok', true, 'attendance_created', false);
  end if;

  update public.attendance_exception_requests
  set status = case when p_create_attendance then 'approved' else 'under_review' end,
      admin_decision_by = v_uid,
      admin_note = p_admin_note,
      decided_at = case when p_create_attendance then now() else decided_at end,
      review_started_at = coalesce(review_started_at, now()),
      resulting_attendance_record_id = nullif(v_rpc->>'attendance_record_id', '')::uuid,
      updated_at = now()
  where id = p_request_id
  returning * into v_req;

  return jsonb_build_object(
    'ok', true,
    'status', v_req.status,
    'attendance', v_rpc,
    'attendance_record_id', v_req.resulting_attendance_record_id,
    'message', case
      when p_create_attendance then 'Exception approved and attendance created'
      else 'Exception placed under review. Use Approve and Correct Attendance to repair the timesheet.'
    end
  );
end;
$$;

revoke all on function public.resolve_attendance_exception(uuid, boolean, text, boolean) from public;
grant execute on function public.resolve_attendance_exception(uuid, boolean, text, boolean) to authenticated;

select 'Attendance repair workflow installed' as status;
