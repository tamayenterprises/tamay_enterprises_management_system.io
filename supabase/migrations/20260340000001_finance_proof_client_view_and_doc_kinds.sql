-- Development/additive: clearer client payment-proof storage access + document kind labels
-- Does not make project-finance public. Does not weaken receipt isolation.

-- Document subtype labels (photo type / document type) without replacing category enum.
alter table public.documents
  add column if not exists kind_label text;

comment on column public.documents.kind_label is
  'Optional photo/document type label (e.g. Progress, Agreement). category still distinguishes work_photo vs files.';

-- Reaffirm private client SELECT on payment proofs only (never receipts).
drop policy if exists "Clients read authorized payment proofs" on storage.objects;
create policy "Clients read authorized payment proofs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-finance'
    and position('/payments/' in name) > 0
    and exists (
      select 1
      from public.project_payments pp
      join public.profiles p on p.id = auth.uid()
      where pp.proof_storage_path = name
        and pp.status <> 'void'
        and p.role = 'client'
        and p.approval_status = 'approved'
        and p.is_active = true
        and p.archived_at is null
        and public.is_assigned_to_project(pp.project_id)
    )
  );

select 'finance proof + document kind_label installed' as status;
