-- Admin assigns which app pages each project manager can open.
-- NULL granted_pages = today's default PM pages. Other roles ignore the column.

alter table public.profiles
  add column if not exists granted_pages text[];

comment on column public.profiles.granted_pages is
  'Project manager page allowlist. NULL means default PM pages. Ignored for other roles.';

grant select (granted_pages) on public.profiles to authenticated;
grant update (granted_pages) on public.profiles to authenticated;

create or replace function public.valid_pm_page_keys()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'dashboard',
    'projects',
    'schedule',
    'nearby',
    'client-requests',
    'updates',
    'employees',
    'subcontractors',
    'clients',
    'timesheets',
    'work-schedule',
    'activity',
    'certifications',
    'documents',
    'drafts',
    'payments',
    'notifications'
  ]::text[];
$$;

create or replace function public.enforce_pm_page_access_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_valid text[] := public.valid_pm_page_keys();
begin
  if new.granted_pages is not distinct from old.granted_pages then
    return new;
  end if;
  if not public.is_admin() then
    raise exception 'Only admin can assign page access'
      using errcode = '42501';
  end if;
  if new.granted_pages is not null then
    foreach v_key in array new.granted_pages loop
      if v_key is null or not (v_key = any (v_valid)) then
        raise exception 'Invalid page access key'
          using errcode = '22023';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.valid_pm_page_keys() from public, anon;
revoke all on function public.enforce_pm_page_access_writes() from public, anon, authenticated;
grant execute on function public.valid_pm_page_keys() to authenticated;

drop trigger if exists profiles_enforce_pm_page_access on public.profiles;
create trigger profiles_enforce_pm_page_access
  before update on public.profiles
  for each row execute function public.enforce_pm_page_access_writes();

drop function if exists public.list_profiles(uuid[], text[], text, boolean, text);

create function public.list_profiles(
  p_ids uuid[] default null,
  p_roles text[] default null,
  p_search text default null,
  p_include_archived boolean default false,
  p_approval_status text default null
)
returns table (
  id uuid,
  organization_id uuid,
  email text,
  first_name text,
  last_name text,
  phone text,
  role text,
  approval_status public.approval_status,
  is_active boolean,
  avatar_url text,
  "position" text,
  hire_date date,
  emergency_contact_name text,
  emergency_contact_phone text,
  internal_notes text,
  company_name text,
  trade_specialization text,
  insurance_info text,
  license_info text,
  archived_at timestamptz,
  granted_pages text[],
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with visible as (
    select p.id, p.organization_id, p.first_name, p.last_name, p.role, p.approval_status, p.is_active,
      p.avatar_url, p.position, p.company_name, p.trade_specialization, p.archived_at, p.granted_pages,
      p.created_at, p.updated_at
    from public.profiles p
    where (p_ids is null or p.id = any (p_ids))
      and (p_roles is null or p.role = any (p_roles))
      and (p_include_archived or p.archived_at is null)
      and (p_approval_status is null or p.approval_status::text = p_approval_status)
  ),
  private as (
    select * from public.profile_private_fields(array(select v.id from visible v))
  )
  select
    v.id, v.organization_id, x.email, v.first_name, v.last_name, x.phone, v.role, v.approval_status,
    v.is_active, v.avatar_url, v.position, x.hire_date, x.emergency_contact_name, x.emergency_contact_phone,
    x.internal_notes, v.company_name, v.trade_specialization, x.insurance_info, x.license_info,
    v.archived_at, v.granted_pages, v.created_at, v.updated_at
  from visible v
  left join private x on x.profile_id = v.id
  where p_search is null
    or btrim(p_search) = ''
    or concat_ws(' ', v.first_name, v.last_name, v.company_name, x.email) ilike '%' || btrim(p_search) || '%'
  order by v.last_name, v.first_name;
$$;

revoke all on function public.list_profiles(uuid[], text[], text, boolean, text) from public, anon;
grant execute on function public.list_profiles(uuid[], text[], text, boolean, text) to authenticated;
