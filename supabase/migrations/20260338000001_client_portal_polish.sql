-- Client portal polish: client-visible project updates

alter table public.project_notes
  add column if not exists visible_to_client boolean not null default false;

create index if not exists project_notes_visible_to_client_idx
  on public.project_notes (project_id, visible_to_client)
  where visible_to_client = true;

-- Clients always post client-visible updates; staff control the flag explicitly.
create or replace function public.enforce_project_note_client_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'client'
  ) then
    new.visible_to_client := true;
  end if;
  return new;
end;
$$;

drop trigger if exists project_notes_client_visibility on public.project_notes;
create trigger project_notes_client_visibility
  before insert on public.project_notes
  for each row execute function public.enforce_project_note_client_visibility();

-- Tighten note visibility: clients only see client-visible notes (plus their own).
drop policy if exists "Assigned or managers can view notes" on public.project_notes;
create policy "Assigned or managers can view notes"
  on public.project_notes for select
  using (
    public.is_approved_user()
    and (
      public.has_management_role()
      or (
        public.is_assigned_to_project(project_id)
        and (
          not exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'client'
          )
          or visible_to_client = true
          or author_id = auth.uid()
        )
      )
    )
  );
