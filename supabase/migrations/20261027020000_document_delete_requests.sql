-- Workers cannot hard-delete files. They request deletion with a reason; admins approve or deny.

create table if not exists public.document_delete_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  document_name text not null,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists document_delete_requests_org_idx
  on public.document_delete_requests (organization_id, created_at desc);
create index if not exists document_delete_requests_requester_idx
  on public.document_delete_requests (requested_by, status);
create unique index if not exists document_delete_requests_pending_doc_idx
  on public.document_delete_requests (document_id)
  where status = 'pending' and document_id is not null;

alter table public.document_delete_requests enable row level security;

drop policy if exists "Read own or admin document delete requests" on public.document_delete_requests;
create policy "Read own or admin document delete requests"
  on public.document_delete_requests for select
  using (
    public.is_approved_user()
    and public.same_organization(organization_id)
    and (requested_by = auth.uid() or public.is_admin())
  );

grant select on public.document_delete_requests to authenticated;

create or replace function public.request_document_delete(p_document_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_doc public.documents%rowtype;
  v_requester public.profiles%rowtype;
  v_request_id uuid;
  v_admin_ids uuid[];
  v_admin uuid;
  v_title text;
  v_preview text;
begin
  if v_uid is null or not public.is_approved_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Explain why this document should be deleted' using errcode = '22023';
  end if;

  select * into v_doc from public.documents where id = p_document_id;
  if not found then
    raise exception 'Document not found' using errcode = '42501';
  end if;
  if v_doc.uploaded_by is distinct from v_uid then
    raise exception 'You can only request deletion of files you uploaded' using errcode = '42501';
  end if;
  if public.is_admin() or public.has_management_role() then
    raise exception 'Management can remove files directly' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.document_delete_requests r
    where r.document_id = v_doc.id and r.status = 'pending'
  ) then
    raise exception 'A delete request for this file is already waiting for admin review' using errcode = '23505';
  end if;

  select * into v_requester from public.profiles where id = v_uid;

  insert into public.document_delete_requests (
    organization_id, document_id, document_name, requested_by, reason
  ) values (
    v_doc.organization_id, v_doc.id, v_doc.name, v_uid, v_reason
  ) returning id into v_request_id;

  select array_agg(p.id) into v_admin_ids
  from public.profiles p
  where p.organization_id is not distinct from v_doc.organization_id
    and p.role = 'admin'
    and p.approval_status = 'approved'
    and p.is_active
    and p.archived_at is null
    and p.id is distinct from v_uid;

  if v_admin_ids is null then
    select array_agg(p.id) into v_admin_ids
    from public.profiles p
    where p.organization_id is not distinct from v_doc.organization_id
      and p.role in ('admin', 'project_manager')
      and p.approval_status = 'approved'
      and p.is_active
      and p.archived_at is null
      and p.id is distinct from v_uid;
  end if;

  v_title := 'Delete request: ' || left(v_doc.name, 80);
  v_preview := coalesce(nullif(btrim(v_requester.first_name || ' ' || v_requester.last_name), ''), 'A worker')
    || ' asked to delete "' || left(v_doc.name, 80) || '". Reason: ' || v_reason;

  if v_admin_ids is not null then
    foreach v_admin in array v_admin_ids loop
      insert into public.notifications (
        organization_id, recipient_id, actor_id, project_id,
        entity_type, entity_id, relevance, priority,
        title, message, preview_text, link, destination_route,
        review_status, metadata
      ) values (
        v_doc.organization_id,
        v_admin,
        v_uid,
        v_doc.project_id,
        'document_delete_request',
        v_request_id,
        'requires_attention'::public.notification_relevance,
        public.relevance_priority('requires_attention'),
        v_title,
        v_preview,
        v_reason,
        '/notifications',
        '/notifications',
        'new'::public.attention_review_status,
        jsonb_build_object(
          'request_id', v_request_id,
          'document_id', v_doc.id,
          'document_name', v_doc.name,
          'reason', v_reason,
          'status', 'pending'
        )
      );
    end loop;
  end if;

  return v_request_id;
end;
$$;

create or replace function public.review_document_delete(
  p_request_id uuid,
  p_approve boolean,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.document_delete_requests%rowtype;
  v_doc public.documents%rowtype;
  v_status text;
  v_note text := nullif(left(btrim(coalesce(p_review_note, '')), 500), '');
  v_title text;
  v_message text;
  v_route text;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Only an admin can approve document deletion' using errcode = '42501';
  end if;

  select * into v_req from public.document_delete_requests where id = p_request_id for update;
  if not found then
    raise exception 'Delete request not found' using errcode = '42501';
  end if;
  if not public.same_organization(v_req.organization_id) then
    raise exception 'Delete request not found' using errcode = '42501';
  end if;
  if v_req.status is distinct from 'pending' then
    raise exception 'This delete request was already reviewed' using errcode = '22023';
  end if;

  v_status := case when p_approve then 'approved' else 'denied' end;

  if v_req.document_id is not null then
    select * into v_doc from public.documents where id = v_req.document_id;
  end if;

  if p_approve and v_doc.id is not null then
    delete from storage.objects
    where name = v_doc.storage_path
      and bucket_id in ('documents', 'project-files');
    delete from public.documents where id = v_doc.id;
  end if;

  update public.document_delete_requests
  set
    status = v_status,
    reviewed_by = v_uid,
    reviewed_at = now(),
    review_note = v_note,
    document_id = case when p_approve then null else document_id end
  where id = v_req.id;

  update public.notifications
  set
    is_read = true,
    read_at = coalesce(read_at, now()),
    review_status = 'resolved'::public.attention_review_status,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('status', v_status)
  where entity_type = 'document_delete_request'
    and entity_id = v_req.id;

  v_route := case
    when v_doc.project_id is not null then '/documents'
    else '/certifications'
  end;
  v_title := case
    when p_approve then 'Delete request approved'
    else 'Delete request denied'
  end;
  v_message := case
    when p_approve then
      'Admin approved deleting "' || left(v_req.document_name, 80) || '".'
    else
      'Admin denied deleting "' || left(v_req.document_name, 80) || '". The file is still available.'
  end;
  if v_note is not null then
    v_message := v_message || ' Note: ' || v_note;
  end if;

  insert into public.notifications (
    organization_id, recipient_id, actor_id, project_id,
    entity_type, entity_id, relevance, priority,
    title, message, preview_text, link, destination_route,
    review_status, metadata
  ) values (
    v_req.organization_id,
    v_req.requested_by,
    v_uid,
    v_doc.project_id,
    'document_delete_request',
    v_req.id,
    'mentioned'::public.notification_relevance,
    public.relevance_priority('mentioned'),
    v_title,
    v_message,
    v_message,
    v_route,
    v_route,
    'none'::public.attention_review_status,
    jsonb_build_object(
      'request_id', v_req.id,
      'document_name', v_req.document_name,
      'reason', v_req.reason,
      'status', v_status
    )
  );

  return jsonb_build_object('status', v_status, 'request_id', v_req.id);
end;
$$;

revoke all on function public.request_document_delete(uuid, text) from public;
revoke all on function public.review_document_delete(uuid, boolean, text) from public;
grant execute on function public.request_document_delete(uuid, text) to authenticated;
grant execute on function public.review_document_delete(uuid, boolean, text) to authenticated;

select 'document delete requests installed' as status;
