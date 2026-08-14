-- Allow intentional hard-delete of projects by management via RPC,
-- while keeping warranty retention against accidental deletes.

create or replace function public.enforce_project_warranty_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.allow_project_hard_delete', true) = 'on' then
    return old;
  end if;

  if public.project_has_active_warranty(old) then
    raise exception
      'Hard delete blocked: project "%" is under warranty retention until %. Soft-archive it instead, or use Delete permanently from Admin/Projects.',
      old.name,
      coalesce(old.warranty_ends_on::text, 'warranty date is set');
  end if;
  return old;
end;
$$;

create or replace function public.enforce_project_child_warranty_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_project_id uuid;
begin
  if current_setting('app.allow_project_hard_delete', true) = 'on' then
    return old;
  end if;

  v_project_id := coalesce(old.project_id, null);
  if v_project_id is null then
    return old;
  end if;

  select * into v_project from public.projects where id = v_project_id;
  if not found then
    return old;
  end if;

  if public.project_has_active_warranty(v_project) then
    raise exception
      'Hard delete blocked: this record belongs to project "%" which is under warranty retention. Soft-archive the project instead, or use Delete permanently.',
      v_project.name;
  end if;

  return old;
end;
$$;

create or replace function public.admin_hard_delete_project(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.has_management_role() then
    raise exception 'Not allowed to permanently delete projects';
  end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'Project not found';
  end if;

  -- Bypass warranty retention for this intentional delete only (transaction-local).
  perform set_config('app.allow_project_hard_delete', 'on', true);

  delete from public.projects where id = p_project_id;

  if v_project.organization_id is not null then
    insert into public.activity_log (
      organization_id,
      actor_id,
      entity_type,
      entity_id,
      action,
      metadata
    ) values (
      v_project.organization_id,
      v_actor,
      'project',
      p_project_id,
      'hard_deleted_project',
      jsonb_build_object(
        'name', v_project.name,
        'status', v_project.status,
        'archived_at', v_project.archived_at,
        'warranty_ends_on', v_project.warranty_ends_on
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', p_project_id,
    'name', v_project.name
  );
end;
$$;

revoke all on function public.admin_hard_delete_project(uuid) from public;
grant execute on function public.admin_hard_delete_project(uuid) to authenticated;

comment on function public.admin_hard_delete_project(uuid) is
  'Permanently deletes a project (and cascaded rows). Bypasses warranty hard-delete guards for intentional management deletes.';
