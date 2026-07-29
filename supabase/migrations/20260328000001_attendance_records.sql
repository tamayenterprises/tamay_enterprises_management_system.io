-- Clock in / clock out attendance records

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  clock_in_time timestamptz not null default now(),
  clock_out_time timestamptz,
  total_hours numeric(8, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_clock_out_after_in check (
    clock_out_time is null or clock_out_time >= clock_in_time
  )
);

create index attendance_records_user_idx on public.attendance_records (user_id, clock_in_time desc);
create index attendance_records_org_idx on public.attendance_records (organization_id, clock_in_time desc);
create index attendance_records_project_idx on public.attendance_records (project_id, clock_in_time desc);

-- Only one open clock-in per user
create unique index attendance_one_open_per_user
  on public.attendance_records (user_id)
  where clock_out_time is null;

create or replace function public.set_attendance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger attendance_records_updated_at
  before update on public.attendance_records
  for each row execute function public.set_attendance_updated_at();

-- Workers may only clock out their open record; managers may correct times.
create or replace function public.enforce_attendance_update()
returns trigger
language plpgsql
as $$
begin
  if public.has_management_role() then
    if new.clock_out_time is not null and new.clock_in_time is not null then
      new.total_hours := round(
        (extract(epoch from (new.clock_out_time - new.clock_in_time)) / 3600.0)::numeric,
        2
      );
    elsif new.clock_out_time is null then
      new.total_hours := null;
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

  if new.clock_out_time is null then
    raise exception 'Clock-out time is required';
  end if;

  new.total_hours := round(
    (extract(epoch from (new.clock_out_time - old.clock_in_time)) / 3600.0)::numeric,
    2
  );
  return new;
end;
$$;

create trigger attendance_records_enforce_update
  before update on public.attendance_records
  for each row execute function public.enforce_attendance_update();

-- Keep workforce status in sync with attendance
create or replace function public.sync_workforce_status_from_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.clock_out_time is null then
    insert into public.worker_status_updates (organization_id, user_id, project_id, status, note)
    values (new.organization_id, new.user_id, new.project_id, 'active', 'Auto-updated on clock in');
  elsif tg_op = 'UPDATE'
    and old.clock_out_time is null
    and new.clock_out_time is not null then
    insert into public.worker_status_updates (organization_id, user_id, project_id, status, note)
    values (
      new.organization_id,
      new.user_id,
      new.project_id,
      'completed_for_day',
      'Auto-updated on clock out'
    );
  end if;
  return new;
end;
$$;

create trigger attendance_sync_workforce_status
  after insert or update on public.attendance_records
  for each row execute function public.sync_workforce_status_from_attendance();

alter table public.attendance_records enable row level security;

create policy "Users view own attendance"
  on public.attendance_records for select
  using (
    user_id = auth.uid()
    or public.has_management_role()
  );

create policy "Users clock themselves in"
  on public.attendance_records for insert
  with check (
    public.is_approved_user()
    and user_id = auth.uid()
    and public.same_organization(organization_id)
    and clock_out_time is null
    and (
      project_id is null
      or public.has_management_role()
      or public.is_assigned_to_project(project_id)
    )
  );

create policy "Users clock themselves out"
  on public.attendance_records for update
  using (
    user_id = auth.uid()
    and clock_out_time is null
  )
  with check (
    user_id = auth.uid()
  );

create policy "Managers correct attendance"
  on public.attendance_records for update
  using (public.has_management_role() and public.same_organization(organization_id))
  with check (public.has_management_role() and public.same_organization(organization_id));

create policy "Managers delete attendance"
  on public.attendance_records for delete
  using (public.has_management_role() and public.same_organization(organization_id));
