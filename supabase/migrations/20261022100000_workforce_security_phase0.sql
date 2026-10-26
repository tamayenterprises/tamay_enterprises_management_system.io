-- Workforce Documents & Compliance — Phase 0 security foundation.
-- DEVELOPMENT FIRST. Do not apply to Production until Carlos approves the release.
--
-- 1. Profiles: every role can read only directory columns (names, role, avatar, position,
--    company, trade, status). Contact and private workforce columns (email, phone, hire date,
--    emergency contacts, internal notes, insurance / license text) are read only through
--    list_profiles(), which shows each field to the person themself, Admin, and Project
--    Managers for the fields listed in project_manager_can_read_profile_field() (email,
--    phone, insurance, license). Project Managers cannot change the private fields they
--    cannot read. Clients see their own profile, staff names, and clients they share a
--    project with.
-- 2. Certifications: organization-scoped, approved staff only, no client access.
-- 3. Certification proofs belong to the worker (stored in their folder, owned by them,
--    uploader recorded); replacing or removing a proof cleans up its document row server-side.
-- 4. Certification maintenance functions are no longer callable directly by app users.
-- 5. get_worker_eligibility() answers only for yourself or for management in your organization.
-- 6. Admins manage profiles in their own organization only; the unused current_profile()
--    helper is no longer callable by app users.
--
-- No rows are modified. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.project_manager_can_read_profile_field(p_field text)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- Operational contact / compliance fields only (approved by Carlos). Hire date, emergency
  -- contacts, management notes and future HR / tax / banking data never go in this list.
  -- Keep in sync with PROJECT_MANAGER_PROFILE_FIELDS in src/lib/profile-fields.ts.
  select p_field = any (array['email', 'phone', 'insurance_info', 'license_info']);
$$;

create or replace function public.profile_in_my_organization(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles target
    join public.profiles viewer on viewer.id = auth.uid()
    where target.id = p_profile_id
      and target.organization_id is not null
      and target.organization_id = viewer.organization_id
  );
$$;

create or replace function public.shares_active_project_with_current_user(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_assignments mine
    join public.project_assignments theirs on theirs.project_id = mine.project_id
    where mine.profile_id = auth.uid()
      and mine.is_active
      and theirs.profile_id = p_profile_id
      and theirs.is_active
  );
$$;

-- Private profile fields, masked per viewer. Returns nothing for profiles outside the
-- viewer's organization (except the viewer's own row).
create or replace function public.profile_private_fields(p_ids uuid[])
returns table (
  profile_id uuid,
  email text,
  phone text,
  hire_date date,
  emergency_contact_name text,
  emergency_contact_phone text,
  internal_notes text,
  insurance_info text,
  license_info text
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select v.id, v.role, v.organization_id
    from public.profiles v
    where v.id = auth.uid()
      and v.approval_status = 'approved'
      and v.is_active
      and v.archived_at is null
  ),
  rows as (
    select
      t.*,
      (t.id = auth.uid()) as is_self,
      exists (select 1 from viewer where viewer.role = 'admin' and viewer.organization_id = t.organization_id) as is_admin_viewer,
      exists (select 1 from viewer where viewer.role = 'project_manager' and viewer.organization_id = t.organization_id) as is_pm_viewer
    from public.profiles t
    where t.id = any (coalesce(p_ids, '{}'::uuid[]))
  )
  select
    r.id,
    case when r.is_self or r.is_admin_viewer or (r.is_pm_viewer and public.project_manager_can_read_profile_field('email')) then r.email end,
    case when r.is_self or r.is_admin_viewer or (r.is_pm_viewer and public.project_manager_can_read_profile_field('phone')) then r.phone end,
    case when r.is_self or r.is_admin_viewer or (r.is_pm_viewer and public.project_manager_can_read_profile_field('hire_date')) then r.hire_date end,
    case when r.is_self or r.is_admin_viewer or (r.is_pm_viewer and public.project_manager_can_read_profile_field('emergency_contact_name')) then r.emergency_contact_name end,
    case when r.is_self or r.is_admin_viewer or (r.is_pm_viewer and public.project_manager_can_read_profile_field('emergency_contact_phone')) then r.emergency_contact_phone end,
    -- Management notes are never shown to the person they are about.
    case when r.is_admin_viewer or (r.is_pm_viewer and public.project_manager_can_read_profile_field('internal_notes')) then r.internal_notes end,
    case when r.is_self or r.is_admin_viewer or (r.is_pm_viewer and public.project_manager_can_read_profile_field('insurance_info')) then r.insurance_info end,
    case when r.is_self or r.is_admin_viewer or (r.is_pm_viewer and public.project_manager_can_read_profile_field('license_info')) then r.license_info end
  from rows r
  where r.is_self or r.is_admin_viewer or r.is_pm_viewer;
$$;

create or replace function public.visible_profile_email(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select f.email from public.profile_private_fields(array[p_profile_id]) f;
$$;

revoke all on function public.project_manager_can_read_profile_field(text) from public, anon;
revoke all on function public.profile_in_my_organization(uuid) from public, anon;
revoke all on function public.shares_active_project_with_current_user(uuid) from public, anon;
revoke all on function public.profile_private_fields(uuid[]) from public, anon;
revoke all on function public.visible_profile_email(uuid) from public, anon;
grant execute on function public.project_manager_can_read_profile_field(text) to authenticated;
grant execute on function public.profile_in_my_organization(uuid) to authenticated;
grant execute on function public.shares_active_project_with_current_user(uuid) to authenticated;
grant execute on function public.profile_private_fields(uuid[]) to authenticated;
grant execute on function public.visible_profile_email(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Profiles: column-level read access + client row scope
-- ---------------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant select (
  id, organization_id, first_name, last_name, role, approval_status, is_active,
  avatar_url, position, company_name, trade_specialization, archived_at, created_at, updated_at
) on public.profiles to authenticated;

drop policy if exists "Approved users can view org profiles" on public.profiles;
create policy "Approved users can view org profiles"
  on public.profiles for select
  using (
    public.is_approved_user()
    and public.same_organization(organization_id)
    and (
      not public.current_user_is_client()
      or id = auth.uid()
      or role <> 'client'
      or public.shares_active_project_with_current_user(id)
    )
  );

-- Project Managers cannot change private fields they cannot read, so a stale or blank form
-- value can never overwrite them.
create or replace function public.enforce_pm_private_profile_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or not public.has_management_role() then
    return new;
  end if;
  if (new.hire_date is distinct from old.hire_date
      and not public.project_manager_can_read_profile_field('hire_date'))
    or (new.emergency_contact_name is distinct from old.emergency_contact_name
      and not public.project_manager_can_read_profile_field('emergency_contact_name'))
    or (new.emergency_contact_phone is distinct from old.emergency_contact_phone
      and not public.project_manager_can_read_profile_field('emergency_contact_phone'))
    or (new.internal_notes is distinct from old.internal_notes
      and not public.project_manager_can_read_profile_field('internal_notes'))
  then
    raise exception 'Project Managers cannot change hire date, emergency contacts or internal notes'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_pm_private_profile_writes() from public, anon, authenticated;

drop trigger if exists profiles_enforce_pm_private_writes on public.profiles;
create trigger profiles_enforce_pm_private_writes
  before update on public.profiles
  for each row execute function public.enforce_pm_private_profile_writes();

drop policy if exists "Admins can manage profiles" on public.profiles;
create policy "Admins can manage profiles"
  on public.profiles for all
  using (public.is_admin() and (organization_id is null or public.same_organization(organization_id)))
  with check (public.is_admin() and (organization_id is null or public.same_organization(organization_id)));

-- Directory columns from RLS-visible rows, plus private fields masked per viewer.
create or replace function public.list_profiles(
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
      p.avatar_url, p.position, p.company_name, p.trade_specialization, p.archived_at, p.created_at, p.updated_at
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
    v.archived_at, v.created_at, v.updated_at
  from visible v
  left join private x on x.profile_id = v.id
  where p_search is null
    or btrim(p_search) = ''
    or concat_ws(' ', v.first_name, v.last_name, v.company_name, x.email) ilike '%' || btrim(p_search) || '%'
  order by v.last_name, v.first_name;
$$;

revoke all on function public.list_profiles(uuid[], text[], text, boolean, text) from public, anon;
grant execute on function public.list_profiles(uuid[], text[], text, boolean, text) to authenticated;

-- Workforce board: email only for people allowed to see it.
-- Drop + create (as earlier migrations do) so an older view shape cannot block the replace.
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
  public.visible_profile_email(p.id) as email,
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

revoke all on public.current_worker_statuses from anon;
grant select on public.current_worker_statuses to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Certifications: organization-scoped, approved staff, no clients
-- ---------------------------------------------------------------------------
drop policy if exists "Users view own certifications" on public.certifications;
drop policy if exists "Users manage own certifications" on public.certifications;
drop policy if exists "Users update own certifications" on public.certifications;
drop policy if exists "Managers delete certifications" on public.certifications;
drop policy if exists "Owners or managers delete certifications" on public.certifications;
drop policy if exists "Staff view permitted certifications" on public.certifications;
drop policy if exists "Staff add permitted certifications" on public.certifications;
drop policy if exists "Staff edit permitted certifications" on public.certifications;
drop policy if exists "Staff remove permitted certifications" on public.certifications;

create or replace function public.can_access_certification(p_profile_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_user()
    and not public.current_user_is_client()
    and public.same_organization(p_organization_id)
    and public.profile_in_my_organization(p_profile_id)
    and (p_profile_id = auth.uid() or public.has_management_role());
$$;

revoke all on function public.can_access_certification(uuid, uuid) from public, anon;
grant execute on function public.can_access_certification(uuid, uuid) to authenticated;

create policy "Staff view permitted certifications"
  on public.certifications for select
  to authenticated
  using (public.can_access_certification(profile_id, organization_id));

create policy "Staff add permitted certifications"
  on public.certifications for insert
  to authenticated
  with check (public.can_access_certification(profile_id, organization_id));

create policy "Staff edit permitted certifications"
  on public.certifications for update
  to authenticated
  using (public.can_access_certification(profile_id, organization_id))
  with check (public.can_access_certification(profile_id, organization_id));

create policy "Staff remove permitted certifications"
  on public.certifications for delete
  to authenticated
  using (public.can_access_certification(profile_id, organization_id));

-- ---------------------------------------------------------------------------
-- 3. Certification proofs belong to the worker
-- ---------------------------------------------------------------------------
create or replace function public.profile_in_my_organization_text(p_profile_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_profile_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.profile_in_my_organization(p_profile_id::uuid);
$$;

revoke all on function public.profile_in_my_organization_text(text) from public, anon;
grant execute on function public.profile_in_my_organization_text(text) to authenticated;

-- Management may upload a proof into a worker's certifications folder (same organization).
drop policy if exists "Management upload certification proof for workers" on storage.objects;
create policy "Management upload certification proof for workers"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and public.is_approved_user()
    and public.has_management_role()
    and (storage.foldername(name))[2] = 'certifications'
    and public.profile_in_my_organization_text((storage.foldername(name))[1])
  );

-- Attach an uploaded proof to a certification. The file must already be in the worker's
-- certifications folder. The document row is owned by the worker; the uploader is recorded.
-- Returns the previous proof path so the app can remove the old file through Storage.
create or replace function public.set_certification_proof(
  p_certification_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text default null,
  p_file_size bigint default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert public.certifications%rowtype;
  v_uid uuid := auth.uid();
  v_old text;
begin
  select * into v_cert from public.certifications where id = p_certification_id for update;
  if not found or not public.can_access_certification(v_cert.profile_id, v_cert.organization_id) then
    raise exception 'Certification not found' using errcode = '42501';
  end if;
  if p_storage_path is null
    or p_storage_path not like v_cert.profile_id::text || '/certifications/%'
    or position('..' in p_storage_path) > 0 then
    raise exception 'The proof file must be stored in the worker''s certification folder' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p_storage_path) then
    raise exception 'Upload the proof file first' using errcode = '22023';
  end if;

  v_old := v_cert.document_url;

  insert into public.documents (organization_id, owner_id, uploaded_by, name, category, storage_path, mime_type, file_size)
  values (
    v_cert.organization_id,
    v_cert.profile_id,
    v_uid,
    left(v_cert.name || ' proof - ' || coalesce(nullif(btrim(p_file_name), ''), 'file'), 250),
    'certification',
    p_storage_path,
    p_mime_type,
    p_file_size
  );

  update public.certifications set document_url = p_storage_path where id = v_cert.id;

  if v_old is not null and v_old <> p_storage_path then
    delete from public.documents
    where storage_path = v_old and category = 'certification' and organization_id = v_cert.organization_id;
  end if;

  return case when v_old is distinct from p_storage_path then v_old end;
end;
$$;

-- Remove a certification and its proof document row. Returns the proof path so the app can
-- remove the file through Storage (direct SQL deletes from storage are not supported).
create or replace function public.remove_certification(p_certification_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert public.certifications%rowtype;
begin
  select * into v_cert from public.certifications where id = p_certification_id for update;
  if not found or not public.can_access_certification(v_cert.profile_id, v_cert.organization_id) then
    raise exception 'Certification not found' using errcode = '42501';
  end if;

  if v_cert.document_url is not null then
    delete from public.documents
    where storage_path = v_cert.document_url and category = 'certification' and organization_id = v_cert.organization_id;
  end if;
  delete from public.certifications where id = v_cert.id;

  return v_cert.document_url;
end;
$$;

revoke all on function public.set_certification_proof(uuid, text, text, text, bigint) from public, anon;
revoke all on function public.remove_certification(uuid) from public, anon;
grant execute on function public.set_certification_proof(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.remove_certification(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Certification maintenance: not callable directly by app users
-- ---------------------------------------------------------------------------
revoke all on function public.refresh_all_certification_statuses() from public, anon, authenticated;
revoke all on function public.notify_certification_alerts() from public, anon, authenticated;

create or replace function public.run_certification_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  refreshed integer := 0;
  notified integer := 0;
begin
  if not public.is_approved_user() or public.current_user_is_client() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if public.has_management_role() then
    refreshed := public.refresh_all_certification_statuses();
    notified := public.notify_certification_alerts();
  else
    update public.certifications c
    set status = case
      when c.expiration_date is null then 'missing'::public.certification_status
      when c.expiration_date < current_date then 'expired'::public.certification_status
      when c.expiration_date <= current_date + 30 then 'expiring_soon'::public.certification_status
      else 'valid'::public.certification_status
    end
    where c.profile_id = auth.uid()
      and c.status is distinct from case
        when c.expiration_date is null then 'missing'::public.certification_status
        when c.expiration_date < current_date then 'expired'::public.certification_status
        when c.expiration_date <= current_date + 30 then 'expiring_soon'::public.certification_status
        else 'valid'::public.certification_status
      end;
    get diagnostics refreshed = row_count;
  end if;

  return jsonb_build_object('refreshed', refreshed, 'notified', notified);
end;
$$;

revoke all on function public.run_certification_maintenance() from public, anon;
grant execute on function public.run_certification_maintenance() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Worker eligibility: yourself, or management in your organization
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.get_worker_eligibility_unchecked(uuid)') is null then
    alter function public.get_worker_eligibility(uuid) rename to get_worker_eligibility_unchecked;
  end if;
end;
$$;

revoke all on function public.get_worker_eligibility_unchecked(uuid) from public, anon, authenticated;

create or replace function public.get_worker_eligibility(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not (
      p_user_id = auth.uid()
      or (public.has_management_role() and public.profile_in_my_organization(p_user_id))
    ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return public.get_worker_eligibility_unchecked(p_user_id);
end;
$$;

revoke all on function public.get_worker_eligibility(uuid) from public, anon;
grant execute on function public.get_worker_eligibility(uuid) to authenticated;

-- Unused helper that returns the caller's full profile row (including management notes).
revoke all on function public.current_profile() from public, anon, authenticated;

notify pgrst, 'reload schema';

select 'workforce security phase 0 installed' as status;

-- Manual rollback (Development):
--   grant select on public.profiles to authenticated;
--   restore "Approved users can view org profiles" as: using (public.is_approved_user() and public.same_organization(organization_id));
--   restore "Admins can manage profiles" as: for all using (public.is_admin()) with check (public.is_admin());
--   drop the four "Staff ... certifications" policies and recreate the 20260327000000 / 20260327000005 ones;
--   grant execute on refresh_all_certification_statuses / notify_certification_alerts to authenticated;
--   drop function public.get_worker_eligibility(uuid); alter function public.get_worker_eligibility_unchecked(uuid) rename to get_worker_eligibility;
--   grant execute on function public.get_worker_eligibility(uuid) to authenticated;
--   drop policy "Management upload certification proof for workers" on storage.objects;
--   recreate current_worker_statuses with p.email (20261008010000).
--   grant execute on function public.current_profile() to authenticated;
--   drop trigger profiles_enforce_pm_private_writes on public.profiles;
