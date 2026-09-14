-- Restore staff opt-in for "Visible to client".
-- Migration 000006 forced every note visible, which made the checkbox useless.

-- Clients always post client-visible; replies under a client-visible root stay visible;
-- staff top-level posts keep the value they send (true or false).
create or replace function public.enforce_project_note_client_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_visible boolean;
begin
  if exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'client'
  ) then
    new.visible_to_client := true;
  elsif new.parent_id is not null then
    select visible_to_client into v_parent_visible
    from public.project_notes
    where id = new.parent_id;

    if coalesce(v_parent_visible, false) then
      new.visible_to_client := true;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists project_notes_client_visibility on public.project_notes;
create trigger project_notes_client_visibility
  before insert on public.project_notes
  for each row execute function public.enforce_project_note_client_visibility();

-- Clients only see notes marked visible_to_client (plus their own).
-- Staff/managers still see the full thread when assigned.
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

comment on function public.enforce_project_note_client_visibility() is
  'Clients always visible; reply chains inherit parent visibility; staff opt in via visible_to_client.';
