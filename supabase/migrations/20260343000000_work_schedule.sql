-- Employee Work Schedule (Phase 1)
-- Management schedules employees / project managers to projects by date and time.
-- Employees read only their own entries through get_my_work_schedule().
-- Project address, client name and client phone are resolved at read time from
-- projects / project_assignments / profiles and are never copied into schedule rows.
-- Safe to re-run (idempotent).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.work_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  work_date date not null,
  start_time time not null,
  end_time time,
  task text not null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_schedule_entries_time_order check (end_time is null or end_time > start_time),
  constraint work_schedule_entries_task_length check (char_length(btrim(task)) between 1 and 500),
  constraint work_schedule_entries_notes_length check (notes is null or char_length(notes) <= 2000)
);

create index if not exists work_schedule_entries_org_date_idx
  on public.work_schedule_entries (organization_id, work_date, start_time);
create index if not exists work_schedule_entries_project_date_idx
  on public.work_schedule_entries (project_id, work_date);

create table if not exists public.work_schedule_assignees (
  entry_id uuid not null references public.work_schedule_entries (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, profile_id)
);

create index if not exists work_schedule_assignees_profile_idx
  on public.work_schedule_assignees (profile_id, entry_id);

drop trigger if exists work_schedule_entries_updated_at on public.work_schedule_entries;
create trigger work_schedule_entries_updated_at
  before update on public.work_schedule_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_work_schedule_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_management_role() and public.is_approved_user();
$$;

-- Phase 1 schedule viewers: approved, active, non-archived employees and project managers.
create or replace function public.is_work_schedule_viewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and pr.approval_status = 'approved'
      and pr.is_active = true
      and pr.archived_at is null
      and pr.role in ('employee', 'project_manager')
  );
$$;

create or replace function public.is_on_work_schedule_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.work_schedule_assignees wa
    where wa.entry_id = p_entry_id
      and wa.profile_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: reads only. All writes go through the security-definer functions below.
-- ---------------------------------------------------------------------------
alter table public.work_schedule_entries enable row level security;
alter table public.work_schedule_assignees enable row level security;

revoke all on public.work_schedule_entries from anon;
revoke all on public.work_schedule_assignees from anon;
revoke insert, update, delete on public.work_schedule_entries from authenticated;
revoke insert, update, delete on public.work_schedule_assignees from authenticated;
grant select on public.work_schedule_entries to authenticated;
grant select on public.work_schedule_assignees to authenticated;

drop policy if exists "View work schedule entries" on public.work_schedule_entries;
create policy "View work schedule entries"
  on public.work_schedule_entries for select
  to authenticated
  using (
    (public.is_work_schedule_manager() and public.same_organization(organization_id))
    or (
      public.is_work_schedule_viewer()
      and public.is_on_work_schedule_entry(id)
      and public.is_assigned_to_project(project_id)
    )
  );

drop policy if exists "View work schedule assignees" on public.work_schedule_assignees;
create policy "View work schedule assignees"
  on public.work_schedule_assignees for select
  to authenticated
  using (
    (public.is_work_schedule_manager() and public.same_organization(organization_id))
    or (public.is_work_schedule_viewer() and profile_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Internal: in-app schedule notifications (never callable by clients directly)
-- ---------------------------------------------------------------------------
create or replace function public.notify_work_schedule(
  p_org uuid,
  p_recipients uuid[],
  p_actor uuid,
  p_project_id uuid,
  p_entry_id uuid,
  p_title text,
  p_message text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (
    organization_id,
    recipient_id,
    title,
    message,
    link,
    destination_route,
    project_id,
    actor_id,
    entity_type,
    entity_id,
    relevance,
    priority
  )
  select
    p_org,
    r,
    p_title,
    p_message,
    '/schedule',
    '/schedule',
    p_project_id,
    p_actor,
    'work_schedule_entry',
    p_entry_id,
    'you_are_assigned'::public.notification_relevance,
    public.relevance_priority('you_are_assigned'::public.notification_relevance)
  from unnest(coalesce(p_recipients, '{}'::uuid[])) as r
  where r is distinct from p_actor;
$$;

revoke all on function public.notify_work_schedule(uuid, uuid[], uuid, uuid, uuid, text, text) from public;
revoke all on function public.notify_work_schedule(uuid, uuid[], uuid, uuid, uuid, text, text) from anon;
revoke all on function public.notify_work_schedule(uuid, uuid[], uuid, uuid, uuid, text, text) from authenticated;

-- ---------------------------------------------------------------------------
-- A. Employee read: own entries only, operational fields only
-- ---------------------------------------------------------------------------
create or replace function public.get_my_work_schedule(p_from date, p_to date)
returns table (
  entry_id uuid,
  work_date date,
  start_time time,
  end_time time,
  task text,
  notes text,
  project_id uuid,
  project_name text,
  project_address text,
  project_latitude double precision,
  project_longitude double precision,
  client_name text,
  client_phone text,
  crew text[],
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.work_date,
    e.start_time,
    e.end_time,
    e.task,
    e.notes,
    p.id,
    p.name,
    coalesce(nullif(btrim(p.job_site_address), ''), nullif(btrim(p.location), '')),
    case when p.location_verification_status = 'verified' then p.latitude end,
    case when p.location_verification_status = 'verified' then p.longitude end,
    cl.client_name,
    cl.client_phone,
    coalesce(cr.names, '{}'::text[]),
    e.updated_at
  from public.work_schedule_entries e
  join public.work_schedule_assignees me
    on me.entry_id = e.id
   and me.profile_id = auth.uid()
  join public.projects p on p.id = e.project_id
  join public.profiles viewer on viewer.id = auth.uid()
  left join lateral (
    select
      coalesce(
        nullif(btrim(coalesce(cp.first_name, '') || ' ' || coalesce(cp.last_name, '')), ''),
        nullif(btrim(cp.company_name), '')
      ) as client_name,
      nullif(btrim(cp.phone), '') as client_phone
    from public.project_assignments cpa
    join public.profiles cp on cp.id = cpa.profile_id
    where cpa.project_id = p.id
      and cpa.is_active = true
      and cp.role = 'client'
      and cp.archived_at is null
    order by cpa.assigned_at asc, cpa.id asc
    limit 1
  ) cl on true
  left join lateral (
    select array_agg(
      btrim(cm.first_name)
        || case
          when nullif(btrim(coalesce(cm.last_name, '')), '') is null then ''
          else ' ' || upper(left(btrim(cm.last_name), 1)) || '.'
        end
      order by cm.first_name, cm.last_name
    ) as names
    from public.work_schedule_assignees ca
    join public.profiles cm on cm.id = ca.profile_id
    where ca.entry_id = e.id
      and ca.profile_id <> auth.uid()
      and cm.archived_at is null
      and nullif(btrim(coalesce(cm.first_name, '')), '') is not null
  ) cr on true
  where public.is_work_schedule_viewer()
    and p_from is not null
    and p_to is not null
    and p_to >= p_from
    and p_to - p_from <= 62
    and e.organization_id = viewer.organization_id
    and e.work_date between p_from and p_to
    and p.archived_at is null
    and exists (
      select 1 from public.project_assignments pa
      where pa.project_id = e.project_id
        and pa.profile_id = auth.uid()
        and pa.is_active = true
    )
  order by e.work_date, e.start_time, p.name;
$$;

revoke all on function public.get_my_work_schedule(date, date) from public;
revoke all on function public.get_my_work_schedule(date, date) from anon;
grant execute on function public.get_my_work_schedule(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- B. Management create / update (atomic entry + assignees + auto-assignment)
-- ---------------------------------------------------------------------------
create or replace function public.save_work_schedule_entry(
  p_project_id uuid,
  p_work_date date,
  p_start_time time,
  p_task text,
  p_assignee_ids uuid[],
  p_end_time time default null,
  p_notes text default null,
  p_entry_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_project public.projects%rowtype;
  v_old public.work_schedule_entries%rowtype;
  v_old_project_name text;
  v_entry_id uuid;
  v_is_new boolean := p_entry_id is null;
  v_task text := nullif(btrim(coalesce(p_task, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_ids uuid[];
  v_old_ids uuid[] := '{}'::uuid[];
  v_added uuid[];
  v_removed uuid[];
  v_kept uuid[];
  v_auto uuid[] := '{}'::uuid[];
  v_pid uuid;
  v_bad text;
  v_when_changed boolean := false;
  v_when_text text;
  v_old_when_text text;
  v_conflicts jsonb;
begin
  if v_uid is null or not public.is_work_schedule_manager() then
    raise exception 'Only management can manage the work schedule' using errcode = '42501';
  end if;

  select pr.organization_id into v_org from public.profiles pr where pr.id = v_uid;

  select * into v_project from public.projects pj where pj.id = p_project_id;
  if not found or v_project.organization_id is distinct from v_org then
    raise exception 'Project not found';
  end if;
  if v_project.archived_at is not null or v_project.status = 'completed' then
    raise exception 'Only active projects can be scheduled';
  end if;

  if p_work_date is null then
    raise exception 'Choose a work date';
  end if;
  if p_work_date < current_date - 366 or p_work_date > current_date + 366 then
    raise exception 'Work date must be within one year of today';
  end if;
  if p_start_time is null then
    raise exception 'Choose a start time';
  end if;
  if p_end_time is not null and p_end_time <= p_start_time then
    raise exception 'End time must be after start time';
  end if;
  if v_task is null then
    raise exception 'Enter the task / work plan';
  end if;
  if char_length(v_task) > 500 then
    raise exception 'Task must be 500 characters or fewer';
  end if;
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'Notes must be 2000 characters or fewer';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_assignee_ids, '{}'::uuid[])) as x
  where x is not null;

  if cardinality(v_ids) = 0 then
    raise exception 'Assign at least one employee';
  end if;
  if cardinality(v_ids) > 50 then
    raise exception 'Too many employees on one entry (max 50)';
  end if;

  select string_agg(
    coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), pr.email, x::text),
    ', '
  )
  into v_bad
  from unnest(v_ids) as x
  left join public.profiles pr on pr.id = x
  where pr.id is null
     or pr.organization_id is distinct from v_org
     or pr.role not in ('employee', 'project_manager')
     or pr.approval_status <> 'approved'
     or pr.is_active is not true
     or pr.archived_at is not null;

  if v_bad is not null then
    raise exception 'Not eligible for scheduling (must be an active, approved employee or project manager): %', v_bad;
  end if;

  if v_is_new then
    insert into public.work_schedule_entries (
      organization_id, project_id, work_date, start_time, end_time, task, notes, created_by, updated_by
    ) values (
      v_org, p_project_id, p_work_date, p_start_time, p_end_time, v_task, v_notes, v_uid, v_uid
    )
    returning id into v_entry_id;
  else
    select * into v_old from public.work_schedule_entries we where we.id = p_entry_id for update;
    if not found or v_old.organization_id is distinct from v_org then
      raise exception 'Schedule entry not found';
    end if;

    select coalesce(array_agg(wa.profile_id), '{}'::uuid[])
    into v_old_ids
    from public.work_schedule_assignees wa
    where wa.entry_id = p_entry_id;

    select pj.name into v_old_project_name from public.projects pj where pj.id = v_old.project_id;

    v_when_changed := v_old.project_id is distinct from p_project_id
      or v_old.work_date is distinct from p_work_date
      or v_old.start_time is distinct from p_start_time
      or v_old.end_time is distinct from p_end_time;

    update public.work_schedule_entries we
    set
      project_id = p_project_id,
      work_date = p_work_date,
      start_time = p_start_time,
      end_time = p_end_time,
      task = v_task,
      notes = v_notes,
      updated_by = v_uid
    where we.id = p_entry_id;

    v_entry_id := p_entry_id;
  end if;

  select coalesce(array_agg(x), '{}'::uuid[]) into v_added
  from unnest(v_ids) as x where not (x = any (v_old_ids));
  select coalesce(array_agg(x), '{}'::uuid[]) into v_removed
  from unnest(v_old_ids) as x where not (x = any (v_ids));
  select coalesce(array_agg(x), '{}'::uuid[]) into v_kept
  from unnest(v_ids) as x where x = any (v_old_ids);

  delete from public.work_schedule_assignees wa
  where wa.entry_id = v_entry_id and wa.profile_id = any (v_removed);

  insert into public.work_schedule_assignees (entry_id, profile_id, organization_id)
  select v_entry_id, x, v_org from unnest(v_added) as x
  on conflict (entry_id, profile_id) do nothing;

  -- Scheduling implies project access: mirror the canonical assignment workflow
  -- (assignment row + assignment_history + "Assigned to project" notification).
  foreach v_pid in array v_ids loop
    if not exists (
      select 1 from public.project_assignments pa
      where pa.project_id = p_project_id
        and pa.profile_id = v_pid
        and pa.is_active = true
    ) then
      insert into public.project_assignments (project_id, profile_id, assigned_by, is_active, removed_at, assigned_at)
      values (p_project_id, v_pid, v_uid, true, null, now())
      on conflict (project_id, profile_id) do update
      set
        is_active = true,
        removed_at = null,
        assigned_by = excluded.assigned_by,
        assigned_at = excluded.assigned_at;

      insert into public.assignment_history (project_id, profile_id, action, performed_by, notes)
      values (p_project_id, v_pid, 'assigned', v_uid, 'Auto-assigned from Work Schedule');

      insert into public.notifications (
        organization_id, recipient_id, title, message, link, destination_route,
        project_id, actor_id, entity_type, entity_id, relevance, priority
      ) values (
        v_org,
        v_pid,
        'Assigned to project',
        'You have been assigned to ' || v_project.name || '.',
        '/projects/' || p_project_id::text,
        '/projects/' || p_project_id::text,
        p_project_id,
        v_uid,
        'project_assignment',
        p_project_id,
        'you_are_assigned'::public.notification_relevance,
        public.relevance_priority('you_are_assigned'::public.notification_relevance)
      );

      v_auto := v_auto || v_pid;
    end if;
  end loop;

  v_when_text := to_char(p_work_date + p_start_time, 'FMDay, FMMon FMDD "at" FMHH12:MI AM');

  perform public.notify_work_schedule(
    v_org, v_added, v_uid, p_project_id, v_entry_id,
    'Work Schedule',
    'You are scheduled for ' || v_project.name || ' on ' || v_when_text || '.'
  );

  if v_when_changed then
    perform public.notify_work_schedule(
      v_org, v_kept, v_uid, p_project_id, v_entry_id,
      'Work Schedule Updated',
      'You are now scheduled for ' || v_project.name || ' on ' || v_when_text || '.'
    );
  end if;

  if cardinality(v_removed) > 0 then
    v_old_when_text := to_char(v_old.work_date + v_old.start_time, 'FMDay, FMMon FMDD "at" FMHH12:MI AM');
    perform public.notify_work_schedule(
      v_org, v_removed, v_uid, v_old.project_id, v_entry_id,
      'Work Schedule Cancelled',
      'You are no longer scheduled for ' || coalesce(v_old_project_name, 'a project') || ' on ' || v_old_when_text || '.'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile_id', wa.profile_id,
        'name', btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')),
        'entry_id', o.id,
        'project_name', op.name,
        'start_time', o.start_time,
        'end_time', o.end_time
      )
      order by pr.first_name, o.start_time
    ),
    '[]'::jsonb
  )
  into v_conflicts
  from public.work_schedule_assignees wa
  join public.work_schedule_entries o on o.id = wa.entry_id
  join public.projects op on op.id = o.project_id
  join public.profiles pr on pr.id = wa.profile_id
  where wa.profile_id = any (v_ids)
    and o.id <> v_entry_id
    and o.work_date = p_work_date
    and o.start_time < coalesce(p_end_time, time '23:59:59')
    and p_start_time < coalesce(o.end_time, time '23:59:59');

  return jsonb_build_object(
    'entry_id', v_entry_id,
    'auto_assigned', to_jsonb(v_auto),
    'double_booked', v_conflicts
  );
end;
$$;

revoke all on function public.save_work_schedule_entry(uuid, date, time, text, uuid[], time, text, uuid) from public;
revoke all on function public.save_work_schedule_entry(uuid, date, time, text, uuid[], time, text, uuid) from anon;
grant execute on function public.save_work_schedule_entry(uuid, date, time, text, uuid[], time, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- C. Management delete (notifies scheduled employees)
-- ---------------------------------------------------------------------------
create or replace function public.delete_work_schedule_entry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_entry public.work_schedule_entries%rowtype;
  v_project_name text;
  v_ids uuid[];
begin
  if v_uid is null or not public.is_work_schedule_manager() then
    raise exception 'Only management can manage the work schedule' using errcode = '42501';
  end if;

  select pr.organization_id into v_org from public.profiles pr where pr.id = v_uid;

  select * into v_entry from public.work_schedule_entries we where we.id = p_id for update;
  if not found or v_entry.organization_id is distinct from v_org then
    raise exception 'Schedule entry not found';
  end if;

  select pj.name into v_project_name from public.projects pj where pj.id = v_entry.project_id;

  select coalesce(array_agg(wa.profile_id), '{}'::uuid[])
  into v_ids
  from public.work_schedule_assignees wa
  where wa.entry_id = p_id;

  delete from public.work_schedule_entries we where we.id = p_id;

  perform public.notify_work_schedule(
    v_org, v_ids, v_uid, v_entry.project_id, p_id,
    'Work Schedule Cancelled',
    'Your work for ' || coalesce(v_project_name, 'a project') || ' on '
      || to_char(v_entry.work_date + v_entry.start_time, 'FMDay, FMMon FMDD "at" FMHH12:MI AM')
      || ' was cancelled.'
  );
end;
$$;

revoke all on function public.delete_work_schedule_entry(uuid) from public;
revoke all on function public.delete_work_schedule_entry(uuid) from anon;
grant execute on function public.delete_work_schedule_entry(uuid) to authenticated;

notify pgrst, 'reload schema';
