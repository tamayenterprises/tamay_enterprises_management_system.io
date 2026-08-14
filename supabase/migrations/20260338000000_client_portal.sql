-- Client portal: client role, signup support, project requests

insert into public.roles (id, label, description, sort_order)
values (
  'client',
  'Client',
  'Homeowner or customer portal access — request projects, share documents and photos, and reply to project updates.',
  50
)
on conflict (id) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- Allow client self-registration (pending approval, same as workers)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_org_id uuid;
  requested_role text;
begin
  select id into default_org_id
  from public.organizations
  where slug = 'tamay-enterprises'
  limit 1;

  requested_role := coalesce(new.raw_user_meta_data->>'role', 'employee');
  if requested_role not in ('employee', 'subcontractor', 'client') then
    requested_role := 'employee';
  end if;

  insert into public.profiles (
    id,
    organization_id,
    email,
    first_name,
    last_name,
    phone,
    role,
    approval_status,
    company_name,
    trade_specialization
  ) values (
    new.id,
    default_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.raw_user_meta_data->>'phone',
    requested_role,
    'pending',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'trade_specialization'
  );

  return new;
end;
$$;

create table if not exists public.project_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  location text,
  preferred_start_date date,
  status text not null default 'pending'
    check (status in ('pending', 'under_review', 'approved', 'declined', 'converted')),
  converted_project_id uuid references public.projects (id) on delete set null,
  admin_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_requests_client_idx
  on public.project_requests (client_id, created_at desc);
create index if not exists project_requests_org_status_idx
  on public.project_requests (organization_id, status, created_at desc);

create table if not exists public.project_request_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid not null references public.project_requests (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  file_kind text not null default 'document'
    check (file_kind in ('document', 'photo')),
  storage_path text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists project_request_files_request_idx
  on public.project_request_files (request_id, created_at desc);

create or replace function public.set_project_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_requests_updated_at on public.project_requests;
create trigger project_requests_updated_at
  before update on public.project_requests
  for each row execute function public.set_project_requests_updated_at();

create or replace function public.is_project_request_owner(target_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_requests r
    where r.id = target_request
      and r.client_id = auth.uid()
  );
$$;

alter table public.project_requests enable row level security;
alter table public.project_request_files enable row level security;

drop policy if exists "Clients view own project requests" on public.project_requests;
create policy "Clients view own project requests"
  on public.project_requests for select
  using (
    client_id = auth.uid()
    or public.has_management_role()
  );

drop policy if exists "Clients create project requests" on public.project_requests;
create policy "Clients create project requests"
  on public.project_requests for insert
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'client'
        and p.approval_status = 'approved'
        and p.is_active
        and p.organization_id = organization_id
    )
  );

drop policy if exists "Clients update own pending project requests" on public.project_requests;
create policy "Clients update own pending project requests"
  on public.project_requests for update
  using (
    (client_id = auth.uid() and status in ('pending', 'under_review'))
    or public.has_management_role()
  )
  with check (
    (client_id = auth.uid() and status in ('pending', 'under_review', 'declined'))
    or public.has_management_role()
  );

drop policy if exists "Managers delete project requests" on public.project_requests;
create policy "Managers delete project requests"
  on public.project_requests for delete
  using (public.has_management_role());

drop policy if exists "View project request files" on public.project_request_files;
create policy "View project request files"
  on public.project_request_files for select
  using (
    public.is_project_request_owner(request_id)
    or public.has_management_role()
  );

drop policy if exists "Clients upload project request files" on public.project_request_files;
create policy "Clients upload project request files"
  on public.project_request_files for insert
  with check (
    uploaded_by = auth.uid()
    and public.is_project_request_owner(request_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = organization_id
    )
  );

drop policy if exists "Owners or managers delete request files" on public.project_request_files;
create policy "Owners or managers delete request files"
  on public.project_request_files for delete
  using (
    uploaded_by = auth.uid()
    or public.has_management_role()
  );

-- Convert approved request → project + assign client (management only)
create or replace function public.convert_project_request(
  p_request_id uuid,
  p_status public.project_status default 'not_started',
  p_priority public.project_priority default 'medium'
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.project_requests%rowtype;
  v_project public.projects%rowtype;
begin
  if not public.has_management_role() then
    raise exception 'Only management can convert project requests';
  end if;

  select * into v_request
  from public.project_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Project request not found';
  end if;

  if v_request.status = 'converted' and v_request.converted_project_id is not null then
    select * into v_project from public.projects where id = v_request.converted_project_id;
    return v_project;
  end if;

  if v_request.status = 'declined' then
    raise exception 'Cannot convert a declined request';
  end if;

  insert into public.projects (
    organization_id,
    name,
    description,
    location,
    status,
    priority,
    start_date,
    created_by
  ) values (
    v_request.organization_id,
    v_request.title,
    v_request.description,
    v_request.location,
    p_status,
    p_priority,
    v_request.preferred_start_date,
    auth.uid()
  )
  returning * into v_project;

  insert into public.project_assignments (
    project_id,
    profile_id,
    assigned_by,
    is_active,
    assigned_at
  ) values (
    v_project.id,
    v_request.client_id,
    auth.uid(),
    true,
    now()
  )
  on conflict (project_id, profile_id) do update
  set
    is_active = true,
    removed_at = null,
    assigned_by = auth.uid(),
    assigned_at = now();

  insert into public.assignment_history (
    project_id,
    profile_id,
    action,
    performed_by
  ) values (
    v_project.id,
    v_request.client_id,
    'assigned',
    auth.uid()
  );

  update public.project_requests
  set
    status = 'converted',
    converted_project_id = v_project.id,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = v_request.id;

  insert into public.notifications (
    organization_id,
    recipient_id,
    title,
    message,
    link
  ) values (
    v_request.organization_id,
    v_request.client_id,
    'Project request approved',
    'Your project request "' || v_request.title || '" is now an active Tamay project.',
    '/portal/projects/' || v_project.id::text
  );

  return v_project;
end;
$$;

revoke all on function public.convert_project_request(uuid, public.project_status, public.project_priority) from public;
grant execute on function public.convert_project_request(uuid, public.project_status, public.project_priority) to authenticated;
