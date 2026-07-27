-- Convert profiles.role from enum to a friendly roles lookup table
-- so Supabase Table Editor shows a clear dropdown (Admin, Project Manager, etc.).

create table if not exists public.roles (
  id text primary key,
  label text not null unique,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.roles (id, label, description, sort_order) values
  ('admin', 'Admin', 'Full access: users, approvals, settings, and all projects.', 1),
  ('project_manager', 'Project Manager', 'Create and manage projects, assignments, and project files.', 2),
  ('employee', 'Employee', 'View assigned projects and update progress.', 3),
  ('subcontractor', 'Subcontractor', 'Same as employee, with company and trade profile fields.', 4)
on conflict (id) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- Policies that reference profiles.role must be dropped before altering the column type
drop policy if exists "Managers can update non-admin profiles" on public.profiles;

-- Only convert if profiles.role is still the old enum type
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
      and udt_name = 'user_role'
  ) then
    alter table public.profiles
      alter column role drop default;

    alter table public.profiles
      alter column role type text using role::text;

    alter table public.profiles
      alter column role set default 'employee';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_role_fkey
      foreign key (role) references public.roles (id);
  end if;
end $$;

-- Recreate the policy that depended on profiles.role
create policy "Managers can update non-admin profiles"
  on public.profiles for update
  using (
    public.has_management_role()
    and public.same_organization(organization_id)
    and role <> 'admin'
  );

-- Keep helper functions working after role became text
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

-- Keep signup trigger compatible with text role values
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
    requested_role,
    'pending',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'trade_specialization'
  );

  return new;
end;
$$;

alter table public.roles enable row level security;

drop policy if exists "Authenticated users can view roles" on public.roles;
create policy "Authenticated users can view roles"
  on public.roles for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admins can manage roles" on public.roles;
create policy "Admins can manage roles"
  on public.roles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Drop unused enum if nothing depends on it anymore
do $$
begin
  if exists (select 1 from pg_type where typname = 'user_role')
     and not exists (
       select 1
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_type t on t.oid = a.atttypid
       where n.nspname = 'public'
         and t.typname = 'user_role'
         and a.attnum > 0
         and not a.attisdropped
     ) then
    drop type public.user_role;
  end if;
end $$;
