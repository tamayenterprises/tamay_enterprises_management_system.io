-- Tamay Enterprises Management System
-- Initial schema designed for single-tenant use with future multi-tenant SaaS in mind.

-- Extensions
create extension if not exists "pgcrypto";

-- Enums
create type public.user_role as enum ('admin', 'project_manager', 'employee', 'subcontractor');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.project_status as enum ('not_started', 'in_progress', 'waiting', 'completed');
create type public.project_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.certification_status as enum ('valid', 'expiring_soon', 'expired', 'missing');
create type public.document_category as enum (
  'certification',
  'license',
  'insurance',
  'contract',
  'identification',
  'work_photo',
  'project_file',
  'company',
  'miscellaneous'
);
create type public.assignment_action as enum ('assigned', 'removed', 'reassigned');

-- Organizations (future multi-tenant readiness)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  email text not null,
  first_name text not null,
  last_name text not null,
  phone text,
  role public.user_role not null default 'employee',
  approval_status public.approval_status not null default 'pending',
  is_active boolean not null default true,
  avatar_url text,
  position text,
  hire_date date,
  emergency_contact_name text,
  emergency_contact_phone text,
  internal_notes text,
  -- Subcontractor-specific fields
  company_name text,
  trade_specialization text,
  insurance_info text,
  license_info text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_org_idx on public.profiles (organization_id);
create index profiles_role_idx on public.profiles (role);
create index profiles_approval_idx on public.profiles (approval_status);
create index profiles_name_idx on public.profiles (last_name, first_name);
create index profiles_active_idx on public.profiles (is_active) where archived_at is null;

-- Projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  location text,
  status public.project_status not null default 'not_started',
  priority public.project_priority not null default 'medium',
  start_date date,
  deadline date,
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_org_idx on public.projects (organization_id);
create index projects_status_idx on public.projects (status);
create index projects_deadline_idx on public.projects (deadline);
create index projects_name_idx on public.projects using gin (to_tsvector('english', name));

-- Project assignments
create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  is_active boolean not null default true,
  unique (project_id, profile_id)
);

create index project_assignments_profile_idx on public.project_assignments (profile_id);
create index project_assignments_project_idx on public.project_assignments (project_id);
create index project_assignments_active_idx on public.project_assignments (is_active) where is_active = true;

-- Assignment history (audit trail)
create table public.assignment_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  action public.assignment_action not null,
  performed_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index assignment_history_project_idx on public.assignment_history (project_id);
create index assignment_history_profile_idx on public.assignment_history (profile_id);

-- Project notes
create table public.project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_notes_project_idx on public.project_notes (project_id);

-- Certifications
create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  certification_type text not null,
  issue_date date,
  expiration_date date,
  status public.certification_status not null default 'missing',
  document_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index certifications_profile_idx on public.certifications (profile_id);
create index certifications_status_idx on public.certifications (status);
create index certifications_expiration_idx on public.certifications (expiration_date);

-- Documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  project_id uuid references public.projects (id) on delete cascade,
  uploaded_by uuid references public.profiles (id) on delete set null,
  name text not null,
  category public.document_category not null default 'miscellaneous',
  storage_path text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_owner_idx on public.documents (owner_id);
create index documents_project_idx on public.documents (project_id);
create index documents_category_idx on public.documents (category);
create index documents_name_idx on public.documents using gin (to_tsvector('english', name));

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id);
create index notifications_unread_idx on public.notifications (recipient_id, is_read) where is_read = false;

-- Activity log
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_org_idx on public.activity_log (organization_id);
create index activity_log_created_idx on public.activity_log (created_at desc);

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger project_notes_updated_at before update on public.project_notes
  for each row execute function public.set_updated_at();
create trigger certifications_updated_at before update on public.certifications
  for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
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
  if requested_role not in ('employee', 'subcontractor') then
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
    requested_role::public.user_role,
    'pending',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'trade_specialization'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Certification status helper
create or replace function public.refresh_certification_status()
returns trigger
language plpgsql
as $$
begin
  if new.expiration_date is null then
    new.status := 'missing';
  elsif new.expiration_date < current_date then
    new.status := 'expired';
  elsif new.expiration_date <= current_date + interval '30 days' then
    new.status := 'expiring_soon';
  else
    new.status := 'valid';
  end if;
  return new;
end;
$$;

create trigger certifications_status_refresh
  before insert or update of expiration_date on public.certifications
  for each row execute function public.refresh_certification_status();

-- Auth helpers for RLS
create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and approval_status = 'approved'
      and is_active = true
      and archived_at is null
  );
$$;

create or replace function public.has_management_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and approval_status = 'approved'
      and is_active = true
      and role in ('admin', 'project_manager')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and approval_status = 'approved'
      and is_active = true
      and role = 'admin'
  );
$$;

create or replace function public.same_organization(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and organization_id = target_org
  );
$$;

create or replace function public.is_assigned_to_project(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_assignments
    where project_id = target_project
      and profile_id = auth.uid()
      and is_active = true
  );
$$;

-- Enable RLS
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.assignment_history enable row level security;
alter table public.project_notes enable row level security;
alter table public.certifications enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_log enable row level security;

-- Organizations policies
create policy "Members can view their organization"
  on public.organizations for select
  using (public.same_organization(id) and public.is_approved_user());

create policy "Admins can update organization"
  on public.organizations for update
  using (public.is_admin() and public.same_organization(id));

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Approved users can view org profiles"
  on public.profiles for select
  using (public.is_approved_user() and public.same_organization(organization_id));

create policy "Users can update own limited profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Admins can manage profiles"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Managers can update non-admin profiles"
  on public.profiles for update
  using (
    public.has_management_role()
    and public.same_organization(organization_id)
    and role <> 'admin'
  );

-- Projects policies
create policy "Managers can manage projects"
  on public.projects for all
  using (public.has_management_role() and public.same_organization(organization_id))
  with check (public.has_management_role() and public.same_organization(organization_id));

create policy "Assigned workers can view projects"
  on public.projects for select
  using (
    public.is_approved_user()
    and public.same_organization(organization_id)
    and (
      public.has_management_role()
      or public.is_assigned_to_project(id)
    )
  );

create policy "Assigned workers can update project status"
  on public.projects for update
  using (
    public.is_approved_user()
    and (
      public.has_management_role()
      or public.is_assigned_to_project(id)
    )
  );

-- Assignments policies
create policy "Managers manage assignments"
  on public.project_assignments for all
  using (public.has_management_role())
  with check (public.has_management_role());

create policy "Users view own or managed assignments"
  on public.project_assignments for select
  using (
    public.is_approved_user()
    and (
      public.has_management_role()
      or profile_id = auth.uid()
    )
  );

-- Assignment history
create policy "Managers manage assignment history"
  on public.assignment_history for all
  using (public.has_management_role())
  with check (public.has_management_role());

create policy "Users view relevant assignment history"
  on public.assignment_history for select
  using (
    public.is_approved_user()
    and (
      public.has_management_role()
      or profile_id = auth.uid()
      or public.is_assigned_to_project(project_id)
    )
  );

-- Project notes
create policy "Assigned or managers can view notes"
  on public.project_notes for select
  using (
    public.is_approved_user()
    and (
      public.has_management_role()
      or public.is_assigned_to_project(project_id)
    )
  );

create policy "Assigned or managers can create notes"
  on public.project_notes for insert
  with check (
    public.is_approved_user()
    and (
      public.has_management_role()
      or public.is_assigned_to_project(project_id)
    )
  );

create policy "Authors or managers can update notes"
  on public.project_notes for update
  using (
    public.has_management_role()
    or author_id = auth.uid()
  );

-- Certifications
create policy "Users view own certifications"
  on public.certifications for select
  using (
    public.is_approved_user()
    and (
      profile_id = auth.uid()
      or public.has_management_role()
    )
  );

create policy "Users manage own certifications"
  on public.certifications for insert
  with check (
    public.is_approved_user()
    and (
      profile_id = auth.uid()
      or public.has_management_role()
    )
  );

create policy "Users update own certifications"
  on public.certifications for update
  using (
    profile_id = auth.uid()
    or public.has_management_role()
  );

create policy "Managers delete certifications"
  on public.certifications for delete
  using (public.has_management_role());

-- Documents
create policy "Users view permitted documents"
  on public.documents for select
  using (
    public.is_approved_user()
    and (
      owner_id = auth.uid()
      or uploaded_by = auth.uid()
      or public.has_management_role()
      or (project_id is not null and public.is_assigned_to_project(project_id))
    )
  );

create policy "Approved users upload documents"
  on public.documents for insert
  with check (public.is_approved_user());

create policy "Owners or managers update documents"
  on public.documents for update
  using (
    owner_id = auth.uid()
    or uploaded_by = auth.uid()
    or public.has_management_role()
  );

create policy "Managers delete documents"
  on public.documents for delete
  using (public.has_management_role() or uploaded_by = auth.uid());

-- Notifications
create policy "Users view own notifications"
  on public.notifications for select
  using (recipient_id = auth.uid());

create policy "Users update own notifications"
  on public.notifications for update
  using (recipient_id = auth.uid());

create policy "Managers create notifications"
  on public.notifications for insert
  with check (public.has_management_role() or recipient_id = auth.uid());

-- Activity log
create policy "Approved users view activity"
  on public.activity_log for select
  using (
    public.is_approved_user()
    and public.same_organization(organization_id)
  );

create policy "Approved users write activity"
  on public.activity_log for insert
  with check (public.is_approved_user());

-- Storage buckets (run in dashboard or via storage API)
-- documents, avatars, project-files

insert into storage.buckets (id, name, public)
values
  ('documents', 'documents', false),
  ('avatars', 'avatars', true),
  ('project-files', 'project-files', false)
on conflict (id) do nothing;

create policy "Authenticated users read own documents storage"
  on storage.objects for select
  using (
    bucket_id in ('documents', 'project-files', 'avatars')
    and auth.role() = 'authenticated'
  );

create policy "Authenticated users upload documents storage"
  on storage.objects for insert
  with check (
    bucket_id in ('documents', 'project-files', 'avatars')
    and auth.role() = 'authenticated'
  );

create policy "Users update own storage objects"
  on storage.objects for update
  using (
    bucket_id in ('documents', 'project-files', 'avatars')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own storage objects"
  on storage.objects for delete
  using (
    bucket_id in ('documents', 'project-files', 'avatars')
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_admin()
    )
  );

-- Seed Tamay Enterprises organization
insert into public.organizations (name, slug, settings)
values (
  'Tamay Enterprises',
  'tamay-enterprises',
  '{"timezone":"America/New_York","certification_alert_days":30}'::jsonb
)
on conflict (slug) do nothing;
