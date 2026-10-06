-- Project document privacy + optional project team access
-- DEVELOPMENT ONLY. DO NOT APPLY TO PRODUCTION until Carlos approves the release.
--
-- Project documents (contracts, estimates, breakdowns, agreements, ...) are visible to
-- management, the uploader, and assigned clients. Assigned employees / subcontractors only
-- see them when management turns on documents.team_visible. Project photos (work photos
-- and ordinary images) stay visible to the assigned team exactly as before.
--
-- Enforced in the database: documents SELECT, project-files storage reads (signed URLs,
-- downloads, folder listing), project activity events and notifications.
-- Additive: one column (default false), one index, helper functions, replaced SELECT
-- policies, two triggers. No existing rows are modified. Safe to re-run.

alter table public.documents
  add column if not exists team_visible boolean not null default false;

comment on column public.documents.team_visible is
  'When true, workers assigned to the project can view this project document. Photos ignore this flag.';

create index if not exists documents_storage_path_idx on public.documents (storage_path);

-- Photos: work photos and ordinary images. Images filed under a sensitive category stay private.
create or replace function public.is_project_photo_document(
  p_category public.document_category,
  p_mime_type text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_category = 'work_photo'
    or (
      coalesce(p_mime_type, '') ilike 'image/%'
      and p_category not in ('contract', 'license', 'insurance', 'identification', 'certification')
    );
$$;

-- Single source of truth for document visibility.
create or replace function public.can_view_document_row(
  p_owner_id uuid,
  p_uploaded_by uuid,
  p_project_id uuid,
  p_category public.document_category,
  p_mime_type text,
  p_team_visible boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_user()
    and (
      p_owner_id = auth.uid()
      or p_uploaded_by = auth.uid()
      or public.has_management_role()
      or (
        p_project_id is not null
        and public.is_assigned_to_project(p_project_id)
        and (
          public.is_project_photo_document(p_category, p_mime_type)
          or coalesce(p_team_visible, false)
          or exists (
            select 1 from public.profiles viewer
            where viewer.id = auth.uid() and viewer.role = 'client'
          )
        )
      )
    );
$$;

create or replace function public.document_hidden_from_current_user(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and not public.can_view_document_row(
        d.owner_id, d.uploaded_by, d.project_id, d.category, d.mime_type, d.team_visible
      )
  );
$$;

create or replace function public.storage_path_hidden_from_current_user(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name
      and not public.can_view_document_row(
        d.owner_id, d.uploaded_by, d.project_id, d.category, d.mime_type, d.team_visible
      )
  );
$$;

revoke all on function public.can_view_document_row(uuid, uuid, uuid, public.document_category, text, boolean) from public;
revoke all on function public.document_hidden_from_current_user(uuid) from public;
revoke all on function public.storage_path_hidden_from_current_user(text) from public;
grant execute on function public.can_view_document_row(uuid, uuid, uuid, public.document_category, text, boolean) to anon, authenticated;
grant execute on function public.document_hidden_from_current_user(uuid) to anon, authenticated;
grant execute on function public.storage_path_hidden_from_current_user(text) to anon, authenticated;

-- Documents: same owner / uploader / management access as before; assigned workers lose
-- private project documents, assigned clients keep everything on their projects.
drop policy if exists "Users view permitted documents" on public.documents;
create policy "Users view permitted documents"
  on public.documents for select
  using (
    public.can_view_document_row(owner_id, uploaded_by, project_id, category, mime_type, team_visible)
  );

-- Only management decides who on the team can see a document.
create or replace function public.enforce_document_team_visible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_management_role() then
    return new;
  end if;
  if tg_op = 'INSERT' and new.team_visible then
    raise exception 'Only management can share a document with the project team';
  end if;
  if tg_op = 'UPDATE' and new.team_visible is distinct from old.team_visible then
    raise exception 'Only management can change project team access';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_enforce_team_visible on public.documents;
create trigger documents_enforce_team_visible
  before insert or update on public.documents
  for each row execute function public.enforce_document_team_visible();

-- Record access changes in the existing project activity stream (no notifications).
create or replace function public.trg_document_team_visible_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is null or new.team_visible is not distinct from old.team_visible then
    return new;
  end if;

  insert into public.project_activity_events (
    organization_id, project_id, actor_id, activity_type, entity_type, entity_id,
    title, destination_route, metadata
  ) values (
    new.organization_id,
    new.project_id,
    auth.uid(),
    'GENERAL',
    'document',
    new.id,
    case when new.team_visible
      then 'Project team access enabled for ' || new.name
      else 'Project team access disabled for ' || new.name
    end,
    '/projects/' || new.project_id::text || '?tab=files&doc=' || new.id::text,
    jsonb_build_object(
      'scope', 'PROJECT',
      'action', case when new.team_visible then 'team_access_enabled' else 'team_access_disabled' end
    )
  );
  return new;
end;
$$;

drop trigger if exists documents_team_visible_activity on public.documents;
create trigger documents_team_visible_activity
  after update of team_visible on public.documents
  for each row execute function public.trg_document_team_visible_activity();

-- Activity feed: document events follow document visibility.
drop policy if exists "Users view permitted activity events" on public.project_activity_events;
create policy "Users view permitted activity events"
  on public.project_activity_events for select
  to authenticated
  using (
    public.is_approved_user()
    and (
      public.has_management_role()
      or (
        project_id is not null
        and public.is_assigned_to_project(project_id)
        and (
          entity_type is distinct from 'document'
          or entity_id is null
          or not public.document_hidden_from_current_user(entity_id)
        )
      )
      or actor_id = (select auth.uid())
    )
  );

-- Notifications: rows about a private document stay hidden until the recipient can view it.
drop policy if exists "Users view own notifications" on public.notifications;
create policy "Users view own notifications"
  on public.notifications for select
  using (
    recipient_id = auth.uid()
    and (
      entity_type is distinct from 'document'
      or entity_id is null
      or not public.document_hidden_from_current_user(entity_id)
    )
  );

-- Storage: assigned workers keep reading project photos and update photos under the project
-- folder, but not objects that belong to a document they cannot view.
drop policy if exists "Approved users read permitted storage" on storage.objects;
create policy "Approved users read permitted storage"
  on storage.objects for select
  using (
    public.is_approved_user()
    and (
      bucket_id = 'avatars'
      or (
        bucket_id = 'documents'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.has_management_role()
        )
      )
      or (
        bucket_id = 'project-files'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.has_management_role()
          or (
            case
              when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then public.is_assigned_to_project(((storage.foldername(name))[2])::uuid)
              else false
            end
            and not public.storage_path_hidden_from_current_user(name)
          )
        )
      )
    )
  );

select 'project document team visibility installed' as status;

-- Manual rollback (Development): re-run the previous definitions of the four policies from
-- 20260327000000 (documents, notifications), 20260333000000 (activity events) and
-- 20260331000000 (storage), then:
--   drop trigger if exists documents_team_visible_activity on public.documents;
--   drop trigger if exists documents_enforce_team_visible on public.documents;
-- The team_visible column and helper functions can stay; they grant nothing on their own.
