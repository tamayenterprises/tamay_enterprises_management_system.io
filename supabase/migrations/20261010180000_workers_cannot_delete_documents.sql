-- Employees and subcontractors can still upload, but they cannot edit or delete
-- documents (personal files, photos, or project files). Management keeps delete
-- so Tamay is not stuck with a removed file. Clients keep deleting their own uploads.

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
        public.current_user_is_client()
        and (p_owner_id = auth.uid() or p_uploaded_by = auth.uid())
      )
    );
$$;
