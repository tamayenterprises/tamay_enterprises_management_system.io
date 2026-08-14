-- System reliability: worker eligibility + status history + form drafts
-- Safe to run after attendance repair migrations.

-- ---------------------------------------------------------------------------
-- Worker status history (audit for activate/deactivate/suspend/restore)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.worker_status_action as enum (
    'activated',
    'deactivated',
    'suspended',
    'restored',
    'archived',
    'unarchived',
    'approved',
    'rejected',
    'onboarding_completed'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.worker_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  changed_by uuid references public.profiles (id) on delete set null,
  action public.worker_status_action not null,
  reason text not null,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists worker_status_history_worker_idx
  on public.worker_status_history (worker_id, created_at desc);

alter table public.worker_status_history enable row level security;

drop policy if exists "Managers view worker status history" on public.worker_status_history;
create policy "Managers view worker status history"
  on public.worker_status_history for select
  to authenticated
  using (public.has_management_role() and public.same_organization(organization_id));

drop policy if exists "Workers view own status history" on public.worker_status_history;
create policy "Workers view own status history"
  on public.worker_status_history for select
  to authenticated
  using (worker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Central eligibility calculator
-- ---------------------------------------------------------------------------
create or replace function public.get_worker_eligibility(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_profile public.profiles%rowtype;
  v_auth_exists boolean := false;
  v_can_authenticate boolean := false;
  v_can_access_app boolean := false;
  v_can_attendance boolean := false;
  v_can_exception boolean := false;
  v_can_admin_correct boolean := true;
  v_blocking text := null;
  v_required_action text := null;
  v_derived text := 'INACTIVE';
  v_assignment_count integer := 0;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    return jsonb_build_object(
      'worker_id', p_user_id,
      'found', false,
      'derived_status', 'INACTIVE',
      'can_authenticate', false,
      'can_access_company_application', false,
      'can_access_assigned_projects', false,
      'can_submit_attendance', false,
      'can_submit_exception_request', false,
      'can_be_administratively_corrected', false,
      'blocking_reason', 'Worker profile was not found.',
      'required_administrative_action', 'Create or restore the worker profile.',
      'profile', null
    );
  end if;

  select exists(select 1 from auth.users where id = p_user_id) into v_auth_exists;
  v_can_authenticate := v_auth_exists;

  select count(*)::integer into v_assignment_count
  from public.project_assignments
  where profile_id = p_user_id and is_active = true;

  if v_profile.archived_at is not null then
    v_derived := 'ARCHIVED';
    v_blocking := 'Worker profile is archived and cannot perform current workforce actions.';
    v_required_action := 'Restore (unarchive) the worker, then activate if appropriate.';
    v_can_access_app := false;
    v_can_attendance := false;
    v_can_exception := false;
  elsif v_profile.approval_status = 'pending' then
    v_derived := 'PENDING';
    v_blocking := 'Registration is pending management approval.';
    v_required_action := 'Approve the registration in Admin, then confirm Active status.';
    v_can_access_app := false;
    v_can_attendance := false;
    v_can_exception := false;
  elsif v_profile.approval_status = 'rejected' then
    v_derived := 'INACTIVE';
    v_blocking := 'Registration was rejected.';
    v_required_action := 'Re-approve the worker in Admin if access should be granted.';
    v_can_access_app := false;
    v_can_attendance := false;
    v_can_exception := false;
  elsif not v_profile.is_active then
    v_derived := 'INACTIVE';
    v_blocking := 'Employee profile is inactive. Authentication may still work, but attendance is blocked.';
    v_required_action := 'Activate Worker with a reason, then continue exception review if needed.';
    v_can_access_app := v_profile.approval_status = 'approved';
    v_can_attendance := false;
    -- Exception requests already submitted remain reviewable; new self-service exceptions stay blocked.
    v_can_exception := false;
  else
    v_derived := 'ACTIVE';
    v_can_access_app := true;
    v_can_attendance := true;
    v_can_exception := true;
  end if;

  -- Management may always administratively correct historical attendance for found workers
  -- except when profile is missing (handled above).
  v_can_admin_correct := true;

  return jsonb_build_object(
    'worker_id', p_user_id,
    'found', true,
    'derived_status', v_derived,
    'authentication_account_exists', v_auth_exists,
    'can_authenticate', v_can_authenticate,
    'can_access_company_application', v_can_access_app,
    'can_access_assigned_projects', v_can_access_app and v_assignment_count > 0,
    'active_project_assignments', v_assignment_count,
    'can_submit_attendance', v_can_attendance,
    'can_submit_exception_request', v_can_exception,
    'can_be_administratively_corrected', v_can_admin_correct,
    'blocking_reason', v_blocking,
    'required_administrative_action', v_required_action,
    'profile', jsonb_build_object(
      'approval_status', v_profile.approval_status,
      'is_active', v_profile.is_active,
      'archived_at', v_profile.archived_at,
      'role', v_profile.role,
      'email', v_profile.email,
      'first_name', v_profile.first_name,
      'last_name', v_profile.last_name,
      'organization_id', v_profile.organization_id,
      'updated_at', v_profile.updated_at
    )
  );
end;
$$;

revoke all on function public.get_worker_eligibility(uuid) from public;
grant execute on function public.get_worker_eligibility(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Set worker status with required reason + history
-- ---------------------------------------------------------------------------
create or replace function public.set_worker_status(
  p_worker_id uuid,
  p_action text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_prev jsonb;
  v_action public.worker_status_action;
  v_payload jsonb := '{}'::jsonb;
begin
  if v_uid is null or not public.has_management_role() then
    raise exception 'You do not have permission to change worker status.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason is required for worker status changes.';
  end if;

  select * into v_profile from public.profiles where id = p_worker_id for update;
  if not found then
    raise exception 'Worker profile was not found.';
  end if;

  v_prev := jsonb_build_object(
    'approval_status', v_profile.approval_status,
    'is_active', v_profile.is_active,
    'archived_at', v_profile.archived_at
  );

  case lower(trim(p_action))
    when 'activate' then
      if v_profile.archived_at is not null then
        raise exception 'Restore (unarchive) this worker before activating.';
      end if;
      if v_profile.approval_status is distinct from 'approved' then
        raise exception 'Approve the worker registration before activating attendance eligibility.';
      end if;
      v_action := 'activated';
      update public.profiles
      set is_active = true, updated_at = now()
      where id = p_worker_id
      returning * into v_profile;
    when 'deactivate' then
      v_action := 'deactivated';
      update public.profiles
      set is_active = false, updated_at = now()
      where id = p_worker_id
      returning * into v_profile;
    when 'suspend' then
      v_action := 'suspended';
      update public.profiles
      set is_active = false, updated_at = now()
      where id = p_worker_id
      returning * into v_profile;
    when 'archive' then
      v_action := 'archived';
      update public.profiles
      set archived_at = coalesce(archived_at, now()), is_active = false, updated_at = now()
      where id = p_worker_id
      returning * into v_profile;
    when 'restore' then
      v_action := 'restored';
      update public.profiles
      set archived_at = null, updated_at = now()
      where id = p_worker_id
      returning * into v_profile;
    when 'approve' then
      v_action := 'approved';
      update public.profiles
      set approval_status = 'approved', is_active = true, updated_at = now()
      where id = p_worker_id
      returning * into v_profile;
    else
      raise exception 'Unsupported worker status action: %.', p_action;
  end case;

  insert into public.worker_status_history (
    organization_id, worker_id, changed_by, action, reason, previous_values, new_values
  ) values (
    v_profile.organization_id,
    p_worker_id,
    v_uid,
    v_action,
    trim(p_reason),
    v_prev,
    jsonb_build_object(
      'approval_status', v_profile.approval_status,
      'is_active', v_profile.is_active,
      'archived_at', v_profile.archived_at
    )
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Worker status updated.',
    'eligibility', public.get_worker_eligibility(p_worker_id),
    'profile', to_jsonb(v_profile)
  );
end;
$$;

revoke all on function public.set_worker_status(uuid, text, text) from public;
grant execute on function public.set_worker_status(uuid, text, text) to authenticated;

-- Diagnostic helper for Leo / named workers (management only)
create or replace function public.diagnose_worker_by_name(p_first_name text default 'Leo')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null or not public.has_management_role() then
    raise exception 'Management role required';
  end if;

  select coalesce(jsonb_agg(public.get_worker_eligibility(p.id) || jsonb_build_object(
    'email', p.email,
    'full_name', trim(p.first_name || ' ' || p.last_name),
    'created_at', p.created_at
  ) order by p.created_at desc), '[]'::jsonb)
  into v_rows
  from public.profiles p
  where p.first_name ilike p_first_name || '%'
     or trim(p.first_name || ' ' || p.last_name) ilike '%' || p_first_name || '%';

  return jsonb_build_object('matches', v_rows);
end;
$$;

revoke all on function public.diagnose_worker_by_name(text) from public;
grant execute on function public.diagnose_worker_by_name(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Clearer inactive messaging for exception submit
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
  v_elig jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'Your workforce profile was not found. Contact management.';
  end if;

  v_elig := public.get_worker_eligibility(v_uid);
  if not coalesce((v_elig->>'can_submit_exception_request')::boolean, false) then
    raise exception '%',
      coalesce(
        v_elig->>'blocking_reason',
        'Your employee profile is not currently active for attendance. Contact management.'
      );
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

-- Allow management to create attendance via override only when eligible OR after explicit note;
-- still never block correct_attendance_record. Soft-check on resolve create path:
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
  v_elig jsonb;
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

  v_elig := public.get_worker_eligibility(v_req.user_id);

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

    return jsonb_build_object('ok', true, 'status', 'rejected', 'eligibility', v_elig);
  end if;

  if p_create_attendance then
    if not coalesce((v_elig->>'can_submit_attendance')::boolean, false) then
      raise exception
        'This request cannot create attendance yet because the worker profile is inactive. % Activate the worker, then use Approve and Correct Attendance (activation alone does not create attendance).',
        coalesce(v_elig->>'blocking_reason', '');
    end if;
    begin
      select public.record_attendance_action_admin_override(
        v_req.user_id,
        v_req.requested_action,
        v_req.project_id,
        p_admin_note
      ) into v_rpc;
    exception when others then
      raise exception
        'Could not create attendance from this exception automatically (%). Open Approve and Correct Attendance instead.',
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
    'eligibility', v_elig,
    'message', case
      when p_create_attendance then 'Exception approved and attendance created'
      when not coalesce((v_elig->>'can_submit_attendance')::boolean, false) then
        'Exception remains reviewable. Worker is inactive — activate the worker, then use Approve and Correct Attendance. Activation alone does not create attendance.'
      else 'Exception placed under review. Use Approve and Correct Attendance to repair the timesheet.'
    end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Form drafts (server-side autosave)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.form_draft_status as enum (
    'active',
    'published',
    'discarded',
    'expired',
    'superseded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.form_draft_type as enum (
    'NEW_PROJECT',
    'EDIT_PROJECT',
    'PROJECT_UPDATE',
    'COMPANY_UPDATE',
    'COMMENT',
    'REPLY',
    'ATTENDANCE_CORRECTION',
    'ATTENDANCE_EXCEPTION',
    'OTHER_SUPPORTED_FORM'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.form_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  draft_type public.form_draft_type not null,
  entity_type text,
  entity_id uuid,
  project_id uuid references public.projects (id) on delete cascade,
  context_key text not null default 'default',
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  status public.form_draft_status not null default 'active',
  published_entity_id uuid,
  revision integer not null default 1,
  device_ref text,
  expires_at timestamptz not null default (now() + interval '30 days'),
  last_opened_at timestamptz,
  last_saved_at timestamptz not null default now(),
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_drafts_payload_object check (jsonb_typeof(payload) = 'object')
);

create unique index if not exists form_drafts_active_owner_context_uidx
  on public.form_drafts (owner_user_id, draft_type, context_key)
  where status = 'active';

create index if not exists form_drafts_owner_saved_idx
  on public.form_drafts (owner_user_id, last_saved_at desc)
  where status = 'active';

create index if not exists form_drafts_project_idx
  on public.form_drafts (project_id, draft_type)
  where status = 'active';

create index if not exists form_drafts_expires_idx
  on public.form_drafts (expires_at)
  where status = 'active';

alter table public.form_drafts enable row level security;

drop policy if exists "Owners manage own drafts" on public.form_drafts;
create policy "Owners manage own drafts"
  on public.form_drafts for all
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

grant select, insert, update, delete on public.form_drafts to authenticated;

create or replace function public.upsert_form_draft(
  p_draft_type public.form_draft_type,
  p_context_key text,
  p_payload jsonb,
  p_project_id uuid default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_expected_revision integer default null,
  p_device_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_row public.form_drafts%rowtype;
  v_ctx text := coalesce(nullif(trim(p_context_key), ''), 'default');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.organization_id is null then
    raise exception 'Approved profile required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Draft payload must be an object';
  end if;
  -- Never store secrets
  if p_payload ? 'password' or p_payload ? 'token' or p_payload ? 'secret' then
    raise exception 'Drafts cannot store passwords or secrets';
  end if;

  select * into v_row
  from public.form_drafts
  where owner_user_id = v_uid
    and draft_type = p_draft_type
    and context_key = v_ctx
    and status = 'active'
  for update;

  if found then
    if p_expected_revision is not null and v_row.revision is distinct from p_expected_revision then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'message', 'This draft was updated in another tab or device.',
        'draft', to_jsonb(v_row)
      );
    end if;

    update public.form_drafts
    set payload = p_payload,
        project_id = coalesce(p_project_id, project_id),
        entity_type = coalesce(p_entity_type, entity_type),
        entity_id = coalesce(p_entity_id, entity_id),
        revision = revision + 1,
        device_ref = coalesce(p_device_ref, device_ref),
        last_saved_at = now(),
        updated_at = now(),
        expires_at = now() + interval '30 days'
    where id = v_row.id
    returning * into v_row;
  else
    insert into public.form_drafts (
      organization_id, owner_user_id, draft_type, context_key, payload,
      project_id, entity_type, entity_id, device_ref
    ) values (
      v_profile.organization_id, v_uid, p_draft_type, v_ctx, p_payload,
      p_project_id, p_entity_type, p_entity_id, p_device_ref
    )
    returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'draft', to_jsonb(v_row), 'message', 'Draft saved');
end;
$$;

create or replace function public.get_form_draft(
  p_draft_type public.form_draft_type,
  p_context_key text default 'default'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.form_drafts%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_row
  from public.form_drafts
  where owner_user_id = v_uid
    and draft_type = p_draft_type
    and context_key = coalesce(nullif(trim(p_context_key), ''), 'default')
    and status = 'active'
    and expires_at > now();
  if not found then
    return jsonb_build_object('ok', true, 'draft', null);
  end if;
  update public.form_drafts set last_opened_at = now() where id = v_row.id;
  return jsonb_build_object('ok', true, 'draft', to_jsonb(v_row));
end;
$$;

create or replace function public.discard_form_draft(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.form_drafts%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  update public.form_drafts
  set status = 'discarded', discarded_at = now(), updated_at = now()
  where id = p_draft_id and owner_user_id = v_uid and status = 'active'
  returning * into v_row;
  if not found then
    raise exception 'Draft not found';
  end if;
  return jsonb_build_object('ok', true, 'message', 'Draft deleted.');
end;
$$;

create or replace function public.publish_form_draft(
  p_draft_id uuid,
  p_published_entity_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.form_drafts%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  update public.form_drafts
  set status = 'published',
      published_entity_id = p_published_entity_id,
      updated_at = now()
  where id = p_draft_id and owner_user_id = v_uid and status = 'active'
  returning * into v_row;
  if not found then
    raise exception 'Draft not found';
  end if;
  return jsonb_build_object('ok', true, 'draft', to_jsonb(v_row));
end;
$$;

create or replace function public.list_my_form_drafts()
returns setof public.form_drafts
language sql
security definer
set search_path = public
as $$
  select *
  from public.form_drafts
  where owner_user_id = auth.uid()
    and status = 'active'
    and expires_at > now()
  order by last_saved_at desc;
$$;

revoke all on function public.upsert_form_draft(public.form_draft_type, text, jsonb, uuid, text, uuid, integer, text) from public;
revoke all on function public.get_form_draft(public.form_draft_type, text) from public;
revoke all on function public.discard_form_draft(uuid) from public;
revoke all on function public.publish_form_draft(uuid, uuid) from public;
revoke all on function public.list_my_form_drafts() from public;

grant execute on function public.upsert_form_draft(public.form_draft_type, text, jsonb, uuid, text, uuid, integer, text) to authenticated;
grant execute on function public.get_form_draft(public.form_draft_type, text) to authenticated;
grant execute on function public.discard_form_draft(uuid) to authenticated;
grant execute on function public.publish_form_draft(uuid, uuid) to authenticated;
grant execute on function public.list_my_form_drafts() to authenticated;

-- Expire stale drafts (callable manually / later via cron)
create or replace function public.expire_stale_form_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.form_drafts
  set status = 'expired', updated_at = now()
  where status = 'active' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

select 'Worker eligibility + form drafts installed' as status;
