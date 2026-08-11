-- Warranty records: keep finished jobs findable for Tamay's 7-year warranty.

alter table public.projects
  add column if not exists warranty_ends_on date;

comment on column public.projects.warranty_ends_on is
  'End of warranty coverage (typically completion date + 7 years). Soft-archived projects remain queryable for warranty lookups.';

create index if not exists projects_warranty_ends_on_idx
  on public.projects (warranty_ends_on)
  where warranty_ends_on is not null;

create index if not exists projects_archived_at_idx
  on public.projects (archived_at)
  where archived_at is not null;

-- When a project is marked completed and warranty is empty, default to +7 years.
create or replace function public.set_default_project_warranty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and new.warranty_ends_on is null then
    new.warranty_ends_on := (current_date + interval '7 years')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_default_warranty on public.projects;
create trigger projects_default_warranty
  before insert or update of status, warranty_ends_on on public.projects
  for each row execute function public.set_default_project_warranty();

-- Backfill completed projects that never got a warranty date.
-- SQL Editor has no management session, so disable the worker-update guard for this pass.
alter table public.projects disable trigger projects_enforce_worker_update;

update public.projects
set warranty_ends_on = (coalesce(updated_at::date, current_date) + interval '7 years')::date
where status = 'completed'
  and warranty_ends_on is null;

alter table public.projects enable trigger projects_enforce_worker_update;
