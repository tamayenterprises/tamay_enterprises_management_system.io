-- Ensure org members can load each other's avatars for identification.
-- Public bucket URLs already work; this covers authenticated storage reads.

drop policy if exists "Approved users read permitted storage" on storage.objects;

create policy "Approved users read permitted storage"
  on storage.objects for select
  using (
    public.is_approved_user()
    and (
      bucket_id = 'avatars'
      or (
        bucket_id in ('documents', 'project-files')
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.has_management_role()
        )
      )
    )
  );

-- Include avatar on workforce status board
create or replace view public.current_worker_statuses
with (security_invoker = true)
as
select distinct on (w.user_id)
  w.id,
  w.organization_id,
  w.user_id,
  w.project_id,
  w.status,
  w.note,
  w.created_at as updated_at,
  p.first_name,
  p.last_name,
  p.email,
  p.role,
  p.company_name,
  p.avatar_url,
  proj.name as project_name
from public.worker_status_updates w
join public.profiles p on p.id = w.user_id
left join public.projects proj on proj.id = w.project_id
where p.archived_at is null
  and p.approval_status = 'approved'
order by w.user_id, w.created_at desc;
