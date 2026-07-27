-- Production security hardening
-- 1) Prevent privilege escalation on profiles
-- 2) Tighten storage policies
-- 3) Bind document inserts to uploader/org
-- 4) Restrict worker project updates to status
-- 5) Certification status refresh + expiration notifications helpers

-- ---------------------------------------------------------------------------
-- Profiles: block self-escalation of privileged columns
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_update_guards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_admin boolean;
  actor_is_manager boolean;
begin
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.approval_status = 'approved'
      and p.is_active
  ) into actor_is_admin;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'project_manager')
      and p.approval_status = 'approved'
      and p.is_active
  ) into actor_is_manager;

  -- Non-admins cannot change privileged fields on themselves or others
  if not actor_is_admin then
    if new.role is distinct from old.role then
      -- Managers may change non-admin roles only
      if not (
        actor_is_manager
        and old.role <> 'admin'
        and new.role <> 'admin'
      ) then
        raise exception 'Not allowed to change role';
      end if;
    end if;

    if new.approval_status is distinct from old.approval_status
      or new.is_active is distinct from old.is_active
      or new.archived_at is distinct from old.archived_at
      or new.organization_id is distinct from old.organization_id
      or new.internal_notes is distinct from old.internal_notes
      or new.email is distinct from old.email
    then
      if not (
        actor_is_manager
        and old.role <> 'admin'
        and new.role <> 'admin'
      ) then
        raise exception 'Not allowed to change privileged profile fields';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_update_guards on public.profiles;
create trigger profiles_enforce_update_guards
  before update on public.profiles
  for each row execute function public.enforce_profile_update_guards();

-- Self-update: keep policy but rely on trigger for privileged columns.
-- Managers: only non-admin profiles; require WITH CHECK.
drop policy if exists "Managers can update non-admin profiles" on public.profiles;
create policy "Managers can update non-admin profiles"
  on public.profiles for update
  using (
    public.has_management_role()
    and public.same_organization(organization_id)
    and role <> 'admin'
  )
  with check (
    public.has_management_role()
    and public.same_organization(organization_id)
    and role <> 'admin'
  );

-- ---------------------------------------------------------------------------
-- Projects: workers may only change status
-- ---------------------------------------------------------------------------
create or replace function public.enforce_project_worker_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_management_role() then
    return new;
  end if;

  if public.is_assigned_to_project(old.id) then
    if new.name is distinct from old.name
      or new.description is distinct from old.description
      or new.location is distinct from old.location
      or new.priority is distinct from old.priority
      or new.start_date is distinct from old.start_date
      or new.deadline is distinct from old.deadline
      or new.created_by is distinct from old.created_by
      or new.organization_id is distinct from old.organization_id
      or new.archived_at is distinct from old.archived_at
    then
      raise exception 'Assigned workers may only update project status';
    end if;
    return new;
  end if;

  raise exception 'Not allowed to update this project';
end;
$$;

drop trigger if exists projects_enforce_worker_update on public.projects;
create trigger projects_enforce_worker_update
  before update on public.projects
  for each row execute function public.enforce_project_worker_update();

-- ---------------------------------------------------------------------------
-- Documents: bind inserts to uploader + org
-- ---------------------------------------------------------------------------
drop policy if exists "Approved users upload documents" on public.documents;
create policy "Approved users upload documents"
  on public.documents for insert
  with check (
    public.is_approved_user()
    and uploaded_by = auth.uid()
    and owner_id = auth.uid()
    and public.same_organization(organization_id)
    and (
      project_id is null
      or public.has_management_role()
      or public.is_assigned_to_project(project_id)
    )
  );

drop policy if exists "Owners or managers update documents" on public.documents;
create policy "Owners or managers update documents"
  on public.documents for update
  using (
    owner_id = auth.uid()
    or uploaded_by = auth.uid()
    or public.has_management_role()
  )
  with check (
    public.same_organization(organization_id)
    and (
      owner_id = auth.uid()
      or uploaded_by = auth.uid()
      or public.has_management_role()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: ownership + approved users only
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated users read own documents storage" on storage.objects;
drop policy if exists "Authenticated users upload documents storage" on storage.objects;
drop policy if exists "Users update own storage objects" on storage.objects;
drop policy if exists "Users delete own storage objects" on storage.objects;

create policy "Approved users read permitted storage"
  on storage.objects for select
  using (
    bucket_id in ('documents', 'project-files', 'avatars')
    and public.is_approved_user()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.has_management_role()
    )
  );

create policy "Approved users upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id in ('documents', 'project-files', 'avatars')
    and public.is_approved_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update own storage objects"
  on storage.objects for update
  using (
    bucket_id in ('documents', 'project-files', 'avatars')
    and public.is_approved_user()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.has_management_role()
    )
  );

create policy "Users delete own or managed storage objects"
  on storage.objects for delete
  using (
    bucket_id in ('documents', 'project-files', 'avatars')
    and public.is_approved_user()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.has_management_role()
    )
  );

-- ---------------------------------------------------------------------------
-- Certifications: refresh stale statuses + notify expiring/expired
-- ---------------------------------------------------------------------------
create or replace function public.refresh_all_certification_statuses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  update public.certifications
  set
    status = case
      when expiration_date is null then 'missing'::public.certification_status
      when expiration_date < current_date then 'expired'::public.certification_status
      when expiration_date <= current_date + 30 then 'expiring_soon'::public.certification_status
      else 'valid'::public.certification_status
    end,
    updated_at = now()
  where status is distinct from case
    when expiration_date is null then 'missing'::public.certification_status
    when expiration_date < current_date then 'expired'::public.certification_status
    when expiration_date <= current_date + 30 then 'expiring_soon'::public.certification_status
    else 'valid'::public.certification_status
  end;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.notify_certification_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  cert record;
begin
  perform public.refresh_all_certification_statuses();

  for cert in
    select c.*, p.organization_id as profile_org
    from public.certifications c
    join public.profiles p on p.id = c.profile_id
    where c.status in ('expiring_soon', 'expired')
  loop
    -- Notify the certificate owner once per day per status
    if not exists (
      select 1
      from public.notifications n
      where n.recipient_id = cert.profile_id
        and n.link = '/certifications'
        and n.title = case
          when cert.status = 'expired' then 'Certification expired'
          else 'Certification expiring soon'
        end
        and n.created_at::date = current_date
        and n.message like '%' || cert.name || '%'
    ) then
      insert into public.notifications (organization_id, recipient_id, title, message, link)
      values (
        coalesce(cert.organization_id, cert.profile_org),
        cert.profile_id,
        case
          when cert.status = 'expired' then 'Certification expired'
          else 'Certification expiring soon'
        end,
        case
          when cert.status = 'expired' then format('%s has expired. Please renew and upload an updated document.', cert.name)
          else format('%s expires on %s. Please renew before it lapses.', cert.name, cert.expiration_date)
        end,
        '/certifications'
      );
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.refresh_all_certification_statuses() from public;
revoke all on function public.notify_certification_alerts() from public;
grant execute on function public.refresh_all_certification_statuses() to authenticated;
grant execute on function public.notify_certification_alerts() to authenticated;

-- Managers/admins may run alert fan-out; workers can refresh their own view via status recompute
create or replace function public.run_certification_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  refreshed integer;
  notified integer := 0;
begin
  if not public.is_approved_user() then
    raise exception 'Not authorized';
  end if;

  refreshed := public.refresh_all_certification_statuses();

  if public.has_management_role() then
    notified := public.notify_certification_alerts();
  end if;

  return jsonb_build_object('refreshed', refreshed, 'notified', notified);
end;
$$;

revoke all on function public.run_certification_maintenance() from public;
grant execute on function public.run_certification_maintenance() to authenticated;
