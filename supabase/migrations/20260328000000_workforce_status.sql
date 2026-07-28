-- Workforce status tracking

create type public.workforce_status as enum (
  'active',
  'on_site',
  'traveling_to_site',
  'on_break',
  'completed_for_day',
  'off_site',
  'inactive'
);

create table public.worker_status_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  status public.workforce_status not null,
  note text,
  created_at timestamptz not null default now()
);

create index worker_status_updates_user_idx on public.worker_status_updates (user_id, created_at desc);
create index worker_status_updates_org_idx on public.worker_status_updates (organization_id, created_at desc);
create index worker_status_updates_status_idx on public.worker_status_updates (status);

-- Latest status view for management dashboards
create or replace view public.current_worker_statuses
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
  proj.name as project_name
from public.worker_status_updates w
join public.profiles p on p.id = w.user_id
left join public.projects proj on proj.id = w.project_id
where p.archived_at is null
  and p.approval_status = 'approved'
order by w.user_id, w.created_at desc;

alter table public.worker_status_updates enable row level security;

create policy "Users view own status updates"
  on public.worker_status_updates for select
  using (
    user_id = auth.uid()
    or public.has_management_role()
  );

create policy "Users insert own status updates"
  on public.worker_status_updates for insert
  with check (
    public.is_approved_user()
    and user_id = auth.uid()
    and public.same_organization(organization_id)
    and (
      project_id is null
      or public.has_management_role()
      or public.is_assigned_to_project(project_id)
    )
  );

-- Seed inactive status for existing active workers (optional convenience)
insert into public.worker_status_updates (organization_id, user_id, status)
select p.organization_id, p.id, 'inactive'::public.workforce_status
from public.profiles p
where p.organization_id is not null
  and p.approval_status = 'approved'
  and p.is_active
  and p.archived_at is null
  and p.role in ('employee', 'subcontractor', 'project_manager')
  and not exists (
    select 1 from public.worker_status_updates w where w.user_id = p.id
  );
