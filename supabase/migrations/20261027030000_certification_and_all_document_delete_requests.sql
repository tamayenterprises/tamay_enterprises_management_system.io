-- Workers may request deletion of any document or certification they can see.
-- Admin notifications and file cards stay Pending until approved or denied.

alter table public.document_delete_requests
  add column if not exists certification_id uuid references public.certifications (id) on delete set null;

create unique index if not exists document_delete_requests_pending_cert_idx
  on public.document_delete_requests (certification_id)
  where status = 'pending' and certification_id is not null;

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
  if public.is_admin() or public.has_management_role() then
    raise exception 'Management can remove files directly' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Explain why this document should be deleted' using errcode = '22023';
  end if;

  select * into v_doc from public.documents where id = p_document_id;
  if not found then
    raise exception 'Document not found' using errcode = '42501';
  end if;
  if not public.can_view_document_row(
    v_doc.owner_id,
    v_doc.uploaded_by,
    v_doc.project_id,
    v_doc.category,
    v_doc.mime_type,
    coalesce(v_doc.team_visible, false)
  ) then
    raise exception 'Document not found' using errcode = '42501';
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

  v_title := 'Pending: delete ' || left(v_doc.name, 80);
  v_preview := coalesce(nullif(btrim(v_requester.first_name || ' ' || v_requester.last_name), ''), 'A worker')
    || ' asked to delete document "' || left(v_doc.name, 80) || '". Reason: ' || v_reason;

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
          'target', 'document',
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

create or replace function public.request_certification_delete(p_certification_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_cert public.certifications%rowtype;
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
  if public.is_admin() or public.has_management_role() then
    raise exception 'Management can remove certifications directly' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Explain why this certification should be deleted' using errcode = '22023';
  end if;

  select * into v_cert from public.certifications where id = p_certification_id;
  if not found or not public.can_access_certification(v_cert.profile_id, v_cert.organization_id) then
    raise exception 'Certification not found' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.document_delete_requests r
    where r.certification_id = v_cert.id and r.status = 'pending'
  ) then
    raise exception 'A delete request for this certification is already waiting for admin review' using errcode = '23505';
  end if;

  select * into v_requester from public.profiles where id = v_uid;

  insert into public.document_delete_requests (
    organization_id, certification_id, document_name, requested_by, reason
  ) values (
    v_cert.organization_id, v_cert.id, v_cert.name, v_uid, v_reason
  ) returning id into v_request_id;

  select array_agg(p.id) into v_admin_ids
  from public.profiles p
  where p.organization_id is not distinct from v_cert.organization_id
    and p.role = 'admin'
    and p.approval_status = 'approved'
    and p.is_active
    and p.archived_at is null
    and p.id is distinct from v_uid;

  if v_admin_ids is null then
    select array_agg(p.id) into v_admin_ids
    from public.profiles p
    where p.organization_id is not distinct from v_cert.organization_id
      and p.role in ('admin', 'project_manager')
      and p.approval_status = 'approved'
      and p.is_active
      and p.archived_at is null
      and p.id is distinct from v_uid;
  end if;

  v_title := 'Pending: delete ' || left(v_cert.name, 80);
  v_preview := coalesce(nullif(btrim(v_requester.first_name || ' ' || v_requester.last_name), ''), 'A worker')
    || ' asked to delete certification "' || left(v_cert.name, 80) || '". Reason: ' || v_reason;

  if v_admin_ids is not null then
    foreach v_admin in array v_admin_ids loop
      insert into public.notifications (
        organization_id, recipient_id, actor_id, project_id,
        entity_type, entity_id, relevance, priority,
        title, message, preview_text, link, destination_route,
        review_status, metadata
      ) values (
        v_cert.organization_id,
        v_admin,
        v_uid,
        null,
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
          'target', 'certification',
          'certification_id', v_cert.id,
          'document_name', v_cert.name,
          'reason', v_reason,
          'status', 'pending'
        )
      );
    end loop;
  end if;

  return v_request_id;
end;
$$;

create or replace function public.remove_certification(p_certification_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert public.certifications%rowtype;
begin
  select * into v_cert from public.certifications where id = p_certification_id for update;
  if not found or not public.can_access_certification(v_cert.profile_id, v_cert.organization_id) then
    raise exception 'Certification not found' using errcode = '42501';
  end if;
  if not public.has_management_role() then
    raise exception 'Ask an admin to delete this certification' using errcode = '42501';
  end if;

  if v_cert.document_url is not null then
    delete from public.documents
    where storage_path = v_cert.document_url and category = 'certification' and organization_id = v_cert.organization_id;
  end if;
  delete from public.certifications where id = v_cert.id;

  return v_cert.document_url;
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
  v_cert public.certifications%rowtype;
  v_status text;
  v_note text := nullif(left(btrim(coalesce(p_review_note, '')), 500), '');
  v_title text;
  v_message text;
  v_route text;
  v_proof text;
  v_kind text;
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
  v_kind := case when v_req.certification_id is not null then 'certification' else 'document' end;

  if v_req.document_id is not null then
    select * into v_doc from public.documents where id = v_req.document_id;
  end if;
  if v_req.certification_id is not null then
    select * into v_cert from public.certifications where id = v_req.certification_id;
  end if;

  if p_approve and v_doc.id is not null then
    delete from storage.objects
    where name = v_doc.storage_path
      and bucket_id in ('documents', 'project-files');
    delete from public.documents where id = v_doc.id;
  end if;

  if p_approve and v_cert.id is not null then
    v_proof := public.remove_certification(v_cert.id);
    if v_proof is not null then
      delete from storage.objects
      where name = v_proof
        and bucket_id in ('documents', 'project-files');
    end if;
  end if;

  update public.document_delete_requests
  set
    status = v_status,
    reviewed_by = v_uid,
    reviewed_at = now(),
    review_note = v_note,
    document_id = case when p_approve then null else document_id end,
    certification_id = case when p_approve then null else certification_id end
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
    when v_kind = 'certification' then '/certifications'
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
      'Admin denied deleting "' || left(v_req.document_name, 80) || '". It is still available.'
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
      'target', v_kind,
      'document_name', v_req.document_name,
      'reason', v_req.reason,
      'status', v_status
    )
  );

  return jsonb_build_object('status', v_status, 'request_id', v_req.id, 'target', v_kind);
end;
$$;

revoke all on function public.request_certification_delete(uuid, text) from public;
grant execute on function public.request_document_delete(uuid, text) to authenticated;
grant execute on function public.request_certification_delete(uuid, text) to authenticated;
grant execute on function public.review_document_delete(uuid, boolean, text) to authenticated;

select 'certification and all-document delete requests installed' as status;
