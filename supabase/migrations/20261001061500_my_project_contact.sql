-- Employee project contact
-- Employees can only read their own project_assignments rows (RLS), so Project Detail
-- cannot list a project's clients for them. This narrow read returns only the resolved
-- project contact (Primary Client, otherwise the earliest active client — the same
-- resolve_project_client rule used by get_my_work_schedule) for a project the caller is
-- actively assigned to. No email, no full profile, no finance.
-- Requires 20261001045500_project_primary_client.sql. Safe to re-run (idempotent).

create or replace function public.get_my_project_contact(p_project_id uuid)
returns table (
  project_id uuid,
  client_name text,
  client_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    cl.client_name,
    cl.client_phone
  from public.projects p
  join public.profiles viewer
    on viewer.id = auth.uid()
   and viewer.approval_status = 'approved'
   and viewer.is_active = true
   and viewer.archived_at is null
   and viewer.role in ('employee', 'project_manager')
   and viewer.organization_id = p.organization_id
  left join lateral public.resolve_project_client(p.id) cl on true
  where p.id = p_project_id
    and exists (
      select 1 from public.project_assignments pa
      where pa.project_id = p.id
        and pa.profile_id = auth.uid()
        and pa.is_active = true
    );
$$;

revoke all on function public.get_my_project_contact(uuid) from public;
revoke all on function public.get_my_project_contact(uuid) from anon;
grant execute on function public.get_my_project_contact(uuid) to authenticated;

select 'Employee project contact installed' as status;
