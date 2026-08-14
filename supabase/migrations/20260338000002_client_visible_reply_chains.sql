-- Client-visible threads: replies inherit visibility from the parent update.

-- When posting a reply under a client-visible root, keep the whole chain visible.
-- Clients still always post as client-visible.
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

-- If a root update is marked visible to the client, cascade that to existing replies.
create or replace function public.cascade_project_note_client_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_id is null
     and new.visible_to_client is distinct from old.visible_to_client then
    update public.project_notes
    set visible_to_client = new.visible_to_client,
        updated_at = now()
    where parent_id = new.id
      and visible_to_client is distinct from new.visible_to_client;
  end if;

  return new;
end;
$$;

drop trigger if exists project_notes_cascade_client_visibility on public.project_notes;
create trigger project_notes_cascade_client_visibility
  after update of visible_to_client on public.project_notes
  for each row execute function public.cascade_project_note_client_visibility();

-- Backfill: any reply under a client-visible root should also be client-visible.
update public.project_notes as reply
set visible_to_client = true,
    updated_at = now()
from public.project_notes as root
where reply.parent_id = root.id
  and root.visible_to_client = true
  and reply.visible_to_client = false;
