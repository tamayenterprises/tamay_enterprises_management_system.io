-- Evolve project_notes into Project Updates: replies + optional photo

alter table public.project_notes
  add column if not exists parent_id uuid references public.project_notes (id) on delete cascade,
  add column if not exists photo_path text;

create index if not exists project_notes_parent_idx
  on public.project_notes (parent_id);

create index if not exists project_notes_project_created_idx
  on public.project_notes (project_id, created_at desc);

-- Allow photo-only updates (content optional when a photo is attached)
alter table public.project_notes
  alter column content drop not null;

alter table public.project_notes
  drop constraint if exists project_notes_content_or_photo;

alter table public.project_notes
  add constraint project_notes_content_or_photo
  check (
    (content is not null and length(trim(content)) > 0)
    or photo_path is not null
  );

-- Replies must stay on the same project and only one level deep
create or replace function public.enforce_project_note_parent()
returns trigger
language plpgsql
as $$
declare
  parent_row public.project_notes%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into parent_row
  from public.project_notes
  where id = new.parent_id;

  if not found then
    raise exception 'Parent update not found';
  end if;

  if parent_row.project_id is distinct from new.project_id then
    raise exception 'Reply must belong to the same project';
  end if;

  if parent_row.parent_id is not null then
    raise exception 'Replies are only allowed on top-level updates';
  end if;

  return new;
end;
$$;

drop trigger if exists project_notes_enforce_parent on public.project_notes;

create trigger project_notes_enforce_parent
  before insert or update on public.project_notes
  for each row execute function public.enforce_project_note_parent();

-- Assigned workers need to see each other's project update photos
drop policy if exists "Approved users read permitted storage" on storage.objects;

create policy "Approved users read permitted storage"
  on storage.objects for select
  using (
    public.is_approved_user()
    and (
      bucket_id = 'avatars'
      or (
        bucket_id = 'documents'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.has_management_role()
        )
      )
      or (
        bucket_id = 'project-files'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.has_management_role()
          or (
            (storage.foldername(name))[2] is not null
            and public.is_assigned_to_project(((storage.foldername(name))[2])::uuid)
          )
        )
      )
    )
  );
