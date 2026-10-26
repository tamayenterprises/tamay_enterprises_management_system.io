-- Admin can file tax, license, and insurance documents on a worker's record.
-- The row is owned by the worker; the file lives in {owner_id}/personnel/.

drop policy if exists "Approved users upload documents" on public.documents;
create policy "Approved users upload documents"
  on public.documents for insert
  with check (
    public.is_approved_user()
    and uploaded_by = auth.uid()
    and public.same_organization(organization_id)
    and (
      (
        owner_id = auth.uid()
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
      )
      or (
        public.is_admin()
        and project_id is null
        and owner_id is distinct from auth.uid()
        and public.profile_in_my_organization(owner_id)
        and exists (
          select 1
          from public.profiles p
          where p.id = owner_id
            and p.role in ('admin', 'project_manager', 'employee', 'subcontractor')
        )
      )
    )
  );

drop policy if exists "Admin upload personnel documents for workers" on storage.objects;
create policy "Admin upload personnel documents for workers"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and public.is_approved_user()
    and public.is_admin()
    and (storage.foldername(name))[2] = 'personnel'
    and public.profile_in_my_organization_text((storage.foldername(name))[1])
  );

drop policy if exists "Workers read own personnel documents" on storage.objects;
create policy "Workers read own personnel documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and public.is_approved_user()
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'personnel'
  );

select 'admin personnel document upload installed' as status;
