-- Management can clock a worker out from the dashboard without geofence.
-- Adds is_active on the workforce board so admins can deactivate vs activate.

drop view if exists public.current_worker_statuses;

create view public.current_worker_statuses
with (security_invoker = true)
as
select distinct on (w.user_id)
  w.id,
  w.organization_id,
  w.user_id,
  w.project_id,
  w.status,
  w.note,
  w.created_at as updated_at,
  p.first_name,
  p.last_name,
  p.email,
  p.role,
  p.company_name,
  p.avatar_url,
  p.is_active,
  proj.name as project_name
from public.worker_status_updates w
join public.profiles p on p.id = w.user_id
left join public.projects proj on proj.id = w.project_id
where p.archived_at is null
  and p.approval_status = 'approved'
order by w.user_id, w.created_at desc;

create or replace function public.admin_clock_out_worker(p_user_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor public.profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_open public.attendance_records%rowtype;
  v_now timestamptz := now();
  v_break_seconds numeric;
  v_elapsed_seconds numeric;
  v_paid_hours numeric;
  v_clocked boolean := false;
  v_project_id uuid;
begin
  if v_uid is null or not public.has_management_role() then
    raise exception 'Only management can clock a worker out.';
  end if;

  select * into v_actor from public.profiles where id = v_uid;
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Worker was not found.';
  end if;
  if v_actor.organization_id is distinct from v_profile.organization_id then
    raise exception 'Worker is not in your organization.';
  end if;

  select * into v_open
  from public.attendance_records
  where user_id = p_user_id and clock_out_time is null
  order by clock_in_time desc
  limit 1;

  if v_open.id is not null then
    v_project_id := v_open.project_id;
    if v_open.workflow_status = 'on_break' and v_open.active_break_started_at is not null then
      v_break_seconds := coalesce(v_open.break_seconds, 0)
        + extract(epoch from (v_now - v_open.active_break_started_at));
      update public.attendance_records
      set
        workflow_status = 'working',
        break_seconds = v_break_seconds,
        active_break_started_at = null,
        updated_at = v_now
      where id = v_open.id
      returning * into v_open;
    end if;

    v_elapsed_seconds := extract(epoch from (v_now - v_open.clock_in_time));
    v_break_seconds := coalesce(v_open.break_seconds, 0);
    v_paid_hours := round(((v_elapsed_seconds - v_break_seconds) / 3600.0)::numeric, 2);
    update public.attendance_records
    set
      clock_out_time = v_now,
      workflow_status = 'completed',
      total_hours = round((v_elapsed_seconds / 3600.0)::numeric, 2),
      paid_hours = greatest(v_paid_hours, 0),
      active_break_started_at = null,
      updated_at = v_now,
      notes = coalesce(p_note, notes)
    where id = v_open.id
    returning * into v_open;

    insert into public.attendance_events (
      organization_id, attendance_record_id, user_id, project_id, action,
      server_timestamp, validation_result, device_info
    ) values (
      v_profile.organization_id, v_open.id, p_user_id, v_project_id, 'WORK_ENDED',
      v_now, 'approved',
      jsonb_build_object('admin_clock_out', true, 'by', v_uid, 'note', p_note)
    );
    v_clocked := true;
  end if;

  insert into public.worker_status_updates (organization_id, user_id, project_id, status, note)
  values (
    v_profile.organization_id,
    p_user_id,
    v_project_id,
    'completed_for_day',
    coalesce(nullif(trim(p_note), ''), 'Clocked out by management')
  );

  return jsonb_build_object(
    'ok', true,
    'clocked_out', v_clocked,
    'message', case
      when v_clocked then 'Worker clocked out.'
      else 'No open clock-in. Status set to Completed for Day.'
    end
  );
end;
$$;

revoke all on function public.admin_clock_out_worker(uuid, text) from public;
grant execute on function public.admin_clock_out_worker(uuid, text) to authenticated;
