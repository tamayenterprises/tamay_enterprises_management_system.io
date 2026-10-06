-- Project document privacy, follow-up: assigned workers and their own uploads.
-- DEVELOPMENT ONLY. DO NOT APPLY TO PRODUCTION until Carlos approves the release.
-- Requires 20261001080000_project_document_team_visibility.sql.
--
-- Employees and subcontractors see a project document only while management has it shared
-- with the project team, even when they uploaded it themselves, they never edit or delete
-- project documents, and they upload project photos / field images only (formal documents
-- come from management). Management is unchanged. Clients keep their existing access,
-- including uploading and removing their own files. Photos and personal (non-project)
-- files keep the existing owner rules. Receipts (project_receipts) are not touched.
--
-- Additive: helper functions and replaced policies. No rows are modified. Safe to re-run.

create or replace function public.current_user_is_client()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'client');
$$;

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
      public.has_management_role()
      or (
        p_project_id is null
        and (p_owner_id = auth.uid() or p_uploaded_by = auth.uid())
      )
      or (
        p_project_id is not null
        and public.is_project_photo_document(p_category, p_mime_type)
        and (
          public.is_assigned_to_project(p_project_id)
          or p_owner_id = auth.uid()
          or p_uploaded_by = auth.uid()
        )
      )
      or (
        p_project_id is not null
        and not public.is_project_photo_document(p_category, p_mime_type)
        and (
          (
            public.current_user_is_client()
            and (
              public.is_assigned_to_project(p_project_id)
              or p_owner_id = auth.uid()
              or p_uploaded_by = auth.uid()
            )
          )
          or (coalesce(p_team_visible, false) and public.is_assigned_to_project(p_project_id))
        )
      )
    );
$$;

-- Edit / delete: management; otherwise the owner of a personal file, a project photo, or a
-- client's own project upload. Workers cannot edit or delete project documents.
create or replace function public.can_modify_document_row(
  p_owner_id uuid,
  p_uploaded_by uuid,
  p_project_id uuid,
  p_category public.document_category,
  p_mime_type text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_user()
    and (
      public.has_management_role()
      or (
        (p_owner_id = auth.uid() or p_uploaded_by = auth.uid())
        and (
          p_project_id is null
          or public.is_project_photo_document(p_category, p_mime_type)
          or public.current_user_is_client()
        )
      )
    );
$$;

create or replace function public.storage_path_locked_for_current_user(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name
      and not public.can_modify_document_row(d.owner_id, d.uploaded_by, d.project_id, d.category, d.mime_type)
  );
$$;

revoke all on function public.current_user_is_client() from public;
revoke all on function public.can_modify_document_row(uuid, uuid, uuid, public.document_category, text) from public;
revoke all on function public.storage_path_locked_for_current_user(text) from public;
grant execute on function public.current_user_is_client() to anon, authenticated;
grant execute on function public.can_modify_document_row(uuid, uuid, uuid, public.document_category, text) to anon, authenticated;
grant execute on function public.storage_path_locked_for_current_user(text) to anon, authenticated;

drop policy if exists "Owners uploaders or managers delete documents" on public.documents;
drop policy if exists "Users delete permitted documents" on public.documents;
create policy "Users delete permitted documents"
  on public.documents for delete
  using (public.can_modify_document_row(owner_id, uploaded_by, project_id, category, mime_type));

drop policy if exists "Owners or managers update documents" on public.documents;
drop policy if exists "Users update permitted documents" on public.documents;
create policy "Users update permitted documents"
  on public.documents for update
  using (public.can_modify_document_row(owner_id, uploaded_by, project_id, category, mime_type))
  with check (
    public.same_organization(organization_id)
    and public.can_modify_document_row(owner_id, uploaded_by, project_id, category, mime_type)
  );

-- Storage reads: an uploader's own folder no longer bypasses document visibility.
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
          public.has_management_role()
          or (
            (storage.foldername(name))[1] = auth.uid()::text
            and not public.storage_path_hidden_from_current_user(name)
          )
        )
      )
      or (
        bucket_id = 'project-files'
        and (
          public.has_management_role()
          or (
            (
              (storage.foldername(name))[1] = auth.uid()::text
              or case
                when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then public.is_assigned_to_project(((storage.foldername(name))[2])::uuid)
                else false
              end
            )
            and not public.storage_path_hidden_from_current_user(name)
          )
        )
      )
    )
  );

-- Storage overwrite / delete follow the document edit rule; files with no document row
-- (failed uploads, project update photos) keep the existing own-folder rule.
drop policy if exists "Users update own storage objects" on storage.objects;
create policy "Users update own storage objects"
  on storage.objects for update
  using (
    bucket_id in ('documents', 'project-files', 'avatars')
    and public.is_approved_user()
    and (
      public.has_management_role()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and not public.storage_path_locked_for_current_user(name)
      )
    )
  );

drop policy if exists "Users delete own or managed storage objects" on storage.objects;
create policy "Users delete own or managed storage objects"
  on storage.objects for delete
  using (
    bucket_id in ('documents', 'project-files', 'avatars')
    and public.is_approved_user()
    and (
      public.has_management_role()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and not public.storage_path_locked_for_current_user(name)
      )
    )
  );

-- Uploads: formal project documents come from management (clients keep their portal uploads).
-- Employees / subcontractors add photos and field images to their projects only.
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
      or (
        public.is_assigned_to_project(project_id)
        and (
          public.current_user_is_client()
          or (
            coalesce(mime_type, '') ilike 'image/%'
            and public.is_project_photo_document(category, mime_type)
          )
        )
      )
    )
  );

select 'project document worker access installed' as status;

-- Manual rollback (Development): re-run 20261001080000 (restores can_view_document_row and the
-- storage read policy), then recreate "Owners uploaders or managers delete documents" from
-- 20260327000005 and "Owners or managers update documents" / "Approved users upload documents" /
-- the two storage policies from 20260327000003, and drop "Users delete permitted documents" /
-- "Users update permitted documents".
