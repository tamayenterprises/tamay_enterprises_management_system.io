-- Primary Client
-- A project may have several active client assignments. At most one of them is the
-- Primary Client: the canonical project contact used by Employee Schedule, Employee
-- Projects and Call Client actions.
-- Primary status is contact identity only. Project and Client Portal access still come
-- from any active assignment (is_assigned_to_project) and are not changed here.
-- Safe to re-run (idempotent).

-- ---------------------------------------------------------------------------
-- Column + guarantees
-- ---------------------------------------------------------------------------
alter table public.project_assignments
  add column if not exists is_primary_client boolean not null default false;

comment on column public.project_assignments.is_primary_client is
  'Canonical client contact for the project. Only one active client assignment per project.';

-- A primary assignment must be active, so the partial unique index below means
-- at most one active Primary Client per project.
alter table public.project_assignments
  drop constraint if exists project_assignments_primary_client_active;
alter table public.project_assignments
  add constraint project_assignments_primary_client_active
  check (not is_primary_client or is_active);

create unique index if not exists project_assignments_one_primary_client_idx
  on public.project_assignments (project_id)
  where is_primary_client;

-- ---------------------------------------------------------------------------
-- Canonical resolver (shared by every operational client-contact read)
-- Primary Client first; otherwise the earliest active client assignment.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_project_client(p_project_id uuid)
returns table (
  profile_id uuid,
  client_name text,
  client_phone text,
  is_primary_client boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    cp.id,
    coalesce(
      nullif(btrim(coalesce(cp.first_name, '') || ' ' || coalesce(cp.last_name, '')), ''),
      nullif(btrim(cp.company_name), '')
    ),
    nullif(btrim(cp.phone), ''),
    pa.is_primary_client
  from public.project_assignments pa
  join public.profiles cp on cp.id = pa.profile_id
  where pa.project_id = p_project_id
    and pa.is_active = true
    and cp.role = 'client'
    and cp.archived_at is null
  order by pa.is_primary_client desc, pa.assigned_at asc, pa.id asc
  limit 1;
$$;

revoke all on function public.resolve_project_client(uuid) from public;
revoke all on function public.resolve_project_client(uuid) from anon;
revoke all on function public.resolve_project_client(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Auto-promotion: a project left with exactly one eligible client and no
-- Primary Client promotes that client. Several remaining clients stay unset.
-- ---------------------------------------------------------------------------
create or replace function public.promote_sole_project_client(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if p_project_id is null then
    return;
  end if;

  if exists (
    select 1 from public.project_assignments
    where project_id = p_project_id and is_primary_client
  ) then
    return;
  end if;

  select array_agg(pa.id)
  into v_ids
  from public.project_assignments pa
  join public.profiles cp on cp.id = pa.profile_id
  where pa.project_id = p_project_id
    and pa.is_active = true
    and cp.role = 'client'
    and cp.archived_at is null;

  if coalesce(array_length(v_ids, 1), 0) = 1 then
    update public.project_assignments
    set is_primary_client = true
    where id = v_ids[1];
  end if;
end;
$$;

revoke all on function public.promote_sole_project_client(uuid) from public;
revoke all on function public.promote_sole_project_client(uuid) from anon;
revoke all on function public.promote_sole_project_client(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Row guard: inactive rows are never primary; only active, non-archived client
-- assignments may be primary; the first and only client becomes primary.
-- ---------------------------------------------------------------------------
create or replace function public.trg_project_assignment_primary_client_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_archived_at timestamptz;
begin
  if new.is_active is not true then
    new.is_primary_client := false;
    return new;
  end if;

  select pr.role, pr.archived_at
  into v_role, v_archived_at
  from public.profiles pr
  where pr.id = new.profile_id;

  if new.is_primary_client then
    if v_role is distinct from 'client' or v_archived_at is not null then
      raise exception 'Only an active client assignment can be the Primary Client.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if v_role is distinct from 'client' or v_archived_at is not null then
    return new;
  end if;

  -- Auto-primary only when a client assignment becomes active, never on other edits.
  if tg_op = 'UPDATE' then
    if old.is_active is true then
      return new;
    end if;
  end if;

  -- Serializes concurrent client assignments on the same project.
  perform 1 from public.projects where id = new.project_id for no key update;

  if not exists (
    select 1
    from public.project_assignments pa
    join public.profiles cp on cp.id = pa.profile_id
    where pa.project_id = new.project_id
      and pa.id <> new.id
      and pa.is_active = true
      and cp.role = 'client'
      and cp.archived_at is null
  )
  and not exists (
    select 1 from public.project_assignments pa
    where pa.project_id = new.project_id
      and pa.id <> new.id
      and pa.is_primary_client
  ) then
    new.is_primary_client := true;
  end if;

  return new;
end;
$$;

revoke all on function public.trg_project_assignment_primary_client_guard() from public;
revoke all on function public.trg_project_assignment_primary_client_guard() from anon;
revoke all on function public.trg_project_assignment_primary_client_guard() from authenticated;

drop trigger if exists project_assignments_primary_client_guard on public.project_assignments;
create trigger project_assignments_primary_client_guard
  before insert or update on public.project_assignments
  for each row execute function public.trg_project_assignment_primary_client_guard();

create or replace function public.trg_project_assignment_primary_client_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_active then
      perform public.promote_sole_project_client(old.project_id);
    end if;
    return old;
  end if;

  if (old.is_primary_client and not new.is_primary_client)
     or (old.is_active and not new.is_active) then
    perform public.promote_sole_project_client(new.project_id);
  end if;
  return new;
end;
$$;

revoke all on function public.trg_project_assignment_primary_client_after() from public;
revoke all on function public.trg_project_assignment_primary_client_after() from anon;
revoke all on function public.trg_project_assignment_primary_client_after() from authenticated;

drop trigger if exists project_assignments_primary_client_after on public.project_assignments;
create trigger project_assignments_primary_client_after
  after update of is_active, is_primary_client or delete on public.project_assignments
  for each row execute function public.trg_project_assignment_primary_client_after();

-- Archived (or no longer client) profiles lose primary status on every project.
create or replace function public.trg_profile_primary_client_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  for v_project_id in
    select distinct pa.project_id
    from public.project_assignments pa
    where pa.profile_id = new.id
      and pa.is_active = true
  loop
    if new.role is distinct from 'client' or new.archived_at is not null then
      update public.project_assignments
      set is_primary_client = false
      where project_id = v_project_id
        and profile_id = new.id
        and is_primary_client;
    end if;
    perform public.promote_sole_project_client(v_project_id);
  end loop;
  return new;
end;
$$;

revoke all on function public.trg_profile_primary_client_cleanup() from public;
revoke all on function public.trg_profile_primary_client_cleanup() from anon;
revoke all on function public.trg_profile_primary_client_cleanup() from authenticated;

drop trigger if exists profiles_primary_client_cleanup on public.profiles;
create trigger profiles_primary_client_cleanup
  after update of archived_at, role on public.profiles
  for each row
  when (
    old.archived_at is distinct from new.archived_at
    or old.role is distinct from new.role
  )
  execute function public.trg_profile_primary_client_cleanup();

-- ---------------------------------------------------------------------------
-- Management RPC: make an assigned client the Primary Client.
-- Does not add, remove or deactivate any assignment.
-- ---------------------------------------------------------------------------
create or replace function public.set_project_primary_client(p_project_id uuid, p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_assignment_id uuid;
begin
  if not (public.has_management_role() and public.is_approved_user()) then
    raise exception 'Only management can set the Primary Client.' using errcode = '42501';
  end if;

  select pr.organization_id
  into v_org
  from public.projects pr
  where pr.id = p_project_id
  for no key update;

  if v_org is null or not public.same_organization(v_org) then
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;

  select pa.id
  into v_assignment_id
  from public.project_assignments pa
  join public.profiles cp on cp.id = pa.profile_id
  where pa.project_id = p_project_id
    and pa.profile_id = p_profile_id
    and pa.is_active = true
    and cp.role = 'client'
    and cp.archived_at is null;

  if v_assignment_id is null then
    raise exception 'Assign this client to the project before making them the Primary Client.'
      using errcode = 'P0002';
  end if;

  update public.project_assignments
  set is_primary_client = false
  where project_id = p_project_id
    and is_primary_client
    and id <> v_assignment_id;

  update public.project_assignments
  set is_primary_client = true
  where id = v_assignment_id
    and not is_primary_client;

  return v_assignment_id;
end;
$$;

revoke all on function public.set_project_primary_client(uuid, uuid) from public;
revoke all on function public.set_project_primary_client(uuid, uuid) from anon;
grant execute on function public.set_project_primary_client(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Employee schedule: client name / phone now come from the canonical resolver.
-- Everything else is unchanged from 20260343000000_work_schedule.sql.
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
  left join lateral public.resolve_project_client(p.id) cl on true
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
-- Backfill: only projects with exactly one eligible active client.
-- Projects with several clients are left for Management to choose explicitly.
-- ---------------------------------------------------------------------------
update public.project_assignments pa
set is_primary_client = true
where pa.id in (
  select (array_agg(x.id))[1]
  from public.project_assignments x
  join public.profiles cp on cp.id = x.profile_id
  where x.is_active = true
    and cp.role = 'client'
    and cp.archived_at is null
  group by x.project_id
  having count(*) = 1
)
and not exists (
  select 1 from public.project_assignments other
  where other.project_id = pa.project_id
    and other.is_primary_client
);

select 'Primary Client installed' as status;
