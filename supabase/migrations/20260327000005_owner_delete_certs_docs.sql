-- Allow workers to remove their own certifications (managers already can)
drop policy if exists "Managers delete certifications" on public.certifications;

create policy "Owners or managers delete certifications"
  on public.certifications for delete
  using (
    profile_id = auth.uid()
    or public.has_management_role()
  );

-- Ensure document owners can delete even if uploaded_by differs
drop policy if exists "Managers delete documents" on public.documents;

create policy "Owners uploaders or managers delete documents"
  on public.documents for delete
  using (
    owner_id = auth.uid()
    or uploaded_by = auth.uid()
    or public.has_management_role()
  );
