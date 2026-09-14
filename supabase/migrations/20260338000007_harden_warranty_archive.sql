-- Harden warranty retention: block hard-deletes under active warranty,
-- audit archive/restore/warranty changes, protect related project files/notes.

-- True when a project must be kept for warranty records (soft-archive only).
create or replace function public.project_has_active_warranty(p public.projects)
returns boolean
language sql
stable
as $$
  select
    -- Explicit future/unknown warranty end protects the record.
    (p.warranty_ends_on is null or p.warranty_ends_on >= current_date)
    and (
      p.status = 'completed'
      or p.archived_at is not null
      or p.warranty_ends_on is not null
    );
$$;

create or replace function public.enforce_project_warranty_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.project_has_active_warranty(old) then
    raise exception
      'Hard delete blocked: project "%" is under warranty retention until %. Soft-archive it instead.',
      old.name,
      coalesce(old.warranty_ends_on::text, 'warranty date is set');
  end if;
  return old;
end;
$$;

drop trigger if exists projects_enforce_warranty_retention on public.projects;
create trigger projects_enforce_warranty_retention
  before delete on public.projects
  for each row execute function public.enforce_project_warranty_retention();

-- Also block wiping notes/files while the parent project is under warranty.
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
      'Hard delete blocked: this record belongs to project "%" which is under warranty retention. Soft-archive the project instead of deleting files or messages.',
      v_project.name;
  end if;

  return old;
end;
$$;

drop trigger if exists project_notes_enforce_warranty_retention on public.project_notes;
create trigger project_notes_enforce_warranty_retention
  before delete on public.project_notes
  for each row execute function public.enforce_project_child_warranty_retention();

drop trigger if exists documents_enforce_warranty_retention on public.documents;
create trigger documents_enforce_warranty_retention
  before delete on public.documents
  for each row execute function public.enforce_project_child_warranty_retention();

-- Audit archive / restore / warranty date changes into activity_log.
create or replace function public.log_project_warranty_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_metadata jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.archived_at is null and new.archived_at is not null then
      v_action := 'project_archived';
      v_metadata := jsonb_build_object(
        'name', new.name,
        'warranty_ends_on', new.warranty_ends_on,
        'status', new.status
      );
    elsif old.archived_at is not null and new.archived_at is null then
      v_action := 'project_restored';
      v_metadata := jsonb_build_object(
        'name', new.name,
        'warranty_ends_on', new.warranty_ends_on,
        'status', new.status
      );
    elsif old.warranty_ends_on is distinct from new.warranty_ends_on then
      v_action := 'warranty_date_changed';
      v_metadata := jsonb_build_object(
        'name', new.name,
        'previous_warranty_ends_on', old.warranty_ends_on,
        'warranty_ends_on', new.warranty_ends_on,
        'status', new.status,
        'archived', new.archived_at is not null
      );
    else
      return new;
    end if;

    insert into public.activity_log (
      organization_id,
      actor_id,
      entity_type,
      entity_id,
      action,
      metadata
    ) values (
      new.organization_id,
      auth.uid(),
      'project',
      new.id,
      v_action,
      v_metadata
    );
  end if;

  return new;
end;
$$;

drop trigger if exists projects_log_warranty_audit on public.projects;
create trigger projects_log_warranty_audit
  after update of archived_at, warranty_ends_on on public.projects
  for each row execute function public.log_project_warranty_audit();

-- Prevent clearing a warranty end date once set (management can only move it, not wipe it).
create or replace function public.enforce_warranty_date_not_cleared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.warranty_ends_on is not null and new.warranty_ends_on is null then
    raise exception
      'Warranty end date cannot be cleared once set. Update it to a new date if needed.';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_enforce_warranty_date_not_cleared on public.projects;
create trigger projects_enforce_warranty_date_not_cleared
  before update of warranty_ends_on on public.projects
  for each row execute function public.enforce_warranty_date_not_cleared();

comment on function public.project_has_active_warranty(public.projects) is
  'Warranty retention guard: completed/archived/warranty-dated projects cannot be hard-deleted until warranty_ends_on is in the past.';
