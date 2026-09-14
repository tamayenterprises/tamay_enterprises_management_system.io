-- Project conversation is shared with assigned clients by default.
-- Staff no longer opt-in per message; clients on the project see the thread.

-- Always mark new notes client-visible (clients already forced true; staff now too).
create or replace function public.enforce_project_note_client_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_visible boolean;
begin
  new.visible_to_client := true;

  -- Keep reply chains consistent if a parent somehow lagged.
  if new.parent_id is not null then
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

-- Assigned clients see the full project thread (not only flagged notes).
drop policy if exists "Assigned or managers can view notes" on public.project_notes;
create policy "Assigned or managers can view notes"
  on public.project_notes for select
  using (
    public.is_approved_user()
    and (
      public.has_management_role()
      or public.is_assigned_to_project(project_id)
    )
  );

-- Backfill: share existing conversation on projects that already have a client.
update public.project_notes n
set visible_to_client = true,
    updated_at = now()
where n.visible_to_client = false
  and exists (
    select 1
    from public.project_assignments a
    join public.profiles p on p.id = a.profile_id
    where a.project_id = n.project_id
      and a.is_active = true
      and p.role = 'client'
  );
