-- Project cover photo: management deliberately chooses the image used as the project thumbnail.
-- DEVELOPMENT ONLY. DO NOT APPLY TO PRODUCTION until Carlos approves the release.
-- Requires 20261001080000_project_document_team_visibility.sql (is_project_photo_document).
--
-- projects.cover_photo_document_id references an existing project image in public.documents
-- (no duplicate storage). Only management (admin / project_manager) can set or clear it; the
-- check runs in a trigger, so direct API updates are covered too (assigned workers otherwise have
-- an UPDATE policy on projects for status changes). The cover must be an image on the same
-- project, filed as a work photo or project file, and never labelled as a formal document.
-- Receipts live in project_receipts and can never be referenced here.
--
-- No foreign key on purpose: deleting the photo must never fail because it is a cover (the
-- worker-update trigger would reject the cascaded update). A missing or no-longer-eligible
-- cover is ignored by the app, which falls back to the automatic cover.
--
-- Additive: one nullable column, two functions, one trigger. No rows are modified. Safe to re-run.

alter table public.documents
  add column if not exists kind_label text;

alter table public.projects
  add column if not exists cover_photo_document_id uuid;

comment on column public.projects.cover_photo_document_id is
  'Optional management-chosen cover image (public.documents.id on this project). Null = automatic cover.';

create or replace function public.is_project_cover_eligible(
  p_category public.document_category,
  p_mime_type text,
  p_kind_label text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_mime_type, '') ilike 'image/%'
    and p_category in ('work_photo', 'project_file')
    and lower(btrim(coalesce(p_kind_label, ''))) not in (
      'agreement',
      'project breakdown',
      'change order / additional work',
      'work order',
      'completion document',
      'warranty',
      'warranty void',
      'receipt',
      'invoice',
      'estimate',
      'contract'
    );
$$;

create or replace function public.enforce_project_cover_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
begin
  if tg_op = 'UPDATE' and new.cover_photo_document_id is not distinct from old.cover_photo_document_id then
    return new;
  end if;
  if tg_op = 'INSERT' and new.cover_photo_document_id is null then
    return new;
  end if;

  if not public.has_management_role() then
    raise exception 'Only management can change the project cover photo'
      using errcode = '42501';
  end if;

  if new.cover_photo_document_id is null then
    return new;
  end if;

  select d.id, d.project_id, d.category, d.mime_type, d.kind_label
    into v_doc
    from public.documents d
   where d.id = new.cover_photo_document_id;

  if not found then
    raise exception 'Cover photo not found' using errcode = '23503';
  end if;
  if v_doc.project_id is distinct from new.id then
    raise exception 'The cover photo must belong to this project' using errcode = '23514';
  end if;
  if not public.is_project_cover_eligible(v_doc.category, v_doc.mime_type, v_doc.kind_label) then
    raise exception 'This file cannot be used as a project cover. Choose a project photo.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_project_cover_photo() from public;
grant execute on function public.is_project_cover_eligible(public.document_category, text, text) to anon, authenticated;

drop trigger if exists projects_enforce_cover_photo on public.projects;
create trigger projects_enforce_cover_photo
  before insert or update of cover_photo_document_id on public.projects
  for each row execute function public.enforce_project_cover_photo();

select 'project cover photo installed' as status;

-- Manual rollback (Development):
--   drop trigger if exists projects_enforce_cover_photo on public.projects;
--   drop function if exists public.enforce_project_cover_photo();
--   drop function if exists public.is_project_cover_eligible(public.document_category, text, text);
--   alter table public.projects drop column if exists cover_photo_document_id;
