-- Development: employee receipts are personal; ensure document kind_label exists.
-- Does not touch production. Idempotent where appropriate.

alter table public.documents
  add column if not exists kind_label text;

comment on column public.documents.kind_label is
  'Optional photo/document type label (e.g. Progress, Agreement). category still distinguishes work_photo vs files.';

-- Assigned employees may only SELECT their own receipts (created_by = auth.uid()).
-- Management policy remains unchanged (full project receipts).
drop policy if exists "Assigned employees view project receipts" on public.project_receipts;
create policy "Assigned employees view project receipts"
  on public.project_receipts for select
  to authenticated
  using (
    public.is_approved_user()
    and public.is_assigned_to_project(project_id)
    and created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'employee'
        and p.is_active = true
        and p.archived_at is null
    )
  );

-- Keep insert/update policies aligned: employees only create/update their own rows.
drop policy if exists "Assigned employees insert project receipts" on public.project_receipts;
create policy "Assigned employees insert project receipts"
  on public.project_receipts for insert
  to authenticated
  with check (
    public.is_approved_user()
    and public.is_assigned_to_project(project_id)
    and created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'employee'
        and p.is_active = true
        and p.archived_at is null
    )
  );

drop policy if exists "Assigned employees update own project receipts" on public.project_receipts;
create policy "Assigned employees update own project receipts"
  on public.project_receipts for update
  to authenticated
  using (
    public.is_approved_user()
    and public.is_assigned_to_project(project_id)
    and created_by = auth.uid()
    and status = 'active'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'employee'
    )
  )
  with check (
    public.is_assigned_to_project(project_id)
    and created_by = auth.uid()
    and status = 'active'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'employee'
    )
  );

select 'employee own-receipts RLS + kind_label ensured' as status;
