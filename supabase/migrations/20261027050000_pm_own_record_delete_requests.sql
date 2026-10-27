-- Project managers use the worker Certifications page, so they request deletion of
-- their own credentials and personal files. Work documents stay immediately removable.

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
  if public.is_admin() or (public.has_management_role() and v_doc.project_id is not null) then
    raise exception 'Management can remove files directly' using errcode = '42501';
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
  if char_length(v_reason) < 5 then
    raise exception 'Explain why this certification should be deleted' using errcode = '22023';
  end if;

  select * into v_cert from public.certifications where id = p_certification_id;
  if not found or not public.can_access_certification(v_cert.profile_id, v_cert.organization_id) then
    raise exception 'Certification not found' using errcode = '42501';
  end if;
  if public.is_admin() or (public.has_management_role() and v_cert.profile_id is distinct from v_uid) then
    raise exception 'Management can remove certifications directly' using errcode = '42501';
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
