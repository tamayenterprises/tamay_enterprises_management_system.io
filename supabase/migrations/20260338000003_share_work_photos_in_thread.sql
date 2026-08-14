-- Share existing project work photos into the client-visible message thread
-- when they were only stored as documents (not in project_notes).

insert into public.project_notes (
  project_id,
  author_id,
  content,
  photo_path,
  visible_to_client
)
select
  d.project_id,
  coalesce(d.uploaded_by, d.owner_id),
  'Shared a photo',
  d.storage_path,
  true
from public.documents d
where d.project_id is not null
  and d.category = 'work_photo'
  and d.storage_path is not null
  and coalesce(d.uploaded_by, d.owner_id) is not null
  and not exists (
    select 1
    from public.project_notes n
    where n.photo_path = d.storage_path
  );
