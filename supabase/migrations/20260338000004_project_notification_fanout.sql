-- Broader project notifications: management always hears project conversation;
-- clients only get client-visible activity (with portal links).

create or replace function public.emit_project_activity(
  p_organization_id uuid,
  p_project_id uuid,
  p_actor_id uuid,
  p_activity_type public.project_activity_type,
  p_entity_type text,
  p_entity_id uuid,
  p_parent_entity_id uuid,
  p_title text,
  p_preview_text text,
  p_destination_route text,
  p_thumbnail_path text default null,
  p_requires_attention boolean default false,
  p_mentioned_user_ids uuid[] default '{}',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_recipient uuid;
  v_relevance public.notification_relevance;
  v_prefs public.notification_preferences%rowtype;
  v_priority smallint;
  v_include boolean;
  v_project_name text;
  v_parent_is_root boolean;
  v_recipient_role text;
  v_route text;
  v_note_visible boolean;
begin
  select name into v_project_name from public.projects where id = p_project_id;

  insert into public.project_activity_events (
    organization_id, project_id, actor_id, activity_type, entity_type, entity_id, parent_entity_id,
    title, preview_text, destination_route, thumbnail_path, requires_attention, metadata
  ) values (
    p_organization_id, p_project_id, p_actor_id, p_activity_type, p_entity_type, p_entity_id, p_parent_entity_id,
    p_title, p_preview_text, p_destination_route, p_thumbnail_path, p_requires_attention,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('scope', 'PROJECT')
  )
  returning id into v_activity_id;

  for v_recipient in
    select distinct uid from (
      select pa.profile_id as uid
      from public.project_assignments pa
      where pa.project_id = p_project_id and pa.is_active = true
      union
      select p.id
      from public.profiles p
      where p.organization_id = p_organization_id
        and p.role in ('admin', 'project_manager')
        and p.approval_status = 'approved'
        and p.is_active = true
        and p.archived_at is null
      union
      select unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[]))
      union
      select n.author_id
      from public.project_notes n
      where p_parent_entity_id is not null and n.id = p_parent_entity_id
    ) candidates
    where uid is not null
  loop
    if v_recipient = p_actor_id then
      continue;
    end if;

    select role into v_recipient_role from public.profiles where id = v_recipient;

    v_prefs := public.get_or_create_notification_preferences(v_recipient);
    v_relevance := 'general';
    v_include := false;

    if p_requires_attention or p_activity_type = 'ATTENTION_REQUESTED' then
      if v_prefs.requires_attention_enabled then
        v_relevance := 'requires_attention';
        v_include := true;
      end if;
    end if;

    if v_recipient = any(coalesce(p_mentioned_user_ids, '{}'::uuid[])) then
      if v_prefs.mentions_enabled then
        if public.relevance_priority('mentioned') > public.relevance_priority(v_relevance) or not v_include then
          v_relevance := 'mentioned';
        end if;
        v_include := true;
      end if;
    end if;

    if p_activity_type = 'COMMENT_REPLIED' and p_parent_entity_id is not null then
      if exists (
        select 1 from public.project_notes n
        where n.id = p_parent_entity_id and n.author_id = v_recipient
      ) then
        if v_prefs.replies_to_my_comments then
          select (parent_id is null) into v_parent_is_root
          from public.project_notes where id = p_parent_entity_id;

          if coalesce(v_parent_is_root, true) then
            if public.relevance_priority('reply_to_your_update') > public.relevance_priority(v_relevance) or not v_include then
              v_relevance := 'reply_to_your_update';
            end if;
          else
            if public.relevance_priority('reply_to_you') > public.relevance_priority(v_relevance) or not v_include then
              v_relevance := 'reply_to_you';
            end if;
          end if;
          v_include := true;
        end if;
      end if;
    end if;

    if p_activity_type in ('USER_ASSIGNED_TO_PROJECT') and (p_metadata->>'assignee_id')::uuid = v_recipient then
      v_relevance := 'you_are_assigned';
      v_include := true;
    end if;

    if exists (
      select 1 from public.project_assignments pa
      where pa.project_id = p_project_id and pa.profile_id = v_recipient and pa.is_active
    ) then
      if p_activity_type in ('COMMENT_CREATED', 'COMMENT_REPLIED') and v_prefs.assigned_project_comments then
        if v_relevance not in ('requires_attention', 'mentioned', 'reply_to_you', 'reply_to_your_update', 'you_are_assigned') then
          v_relevance := 'assigned_project';
        end if;
        v_include := true;
      elsif p_activity_type in ('PHOTO_UPLOADED', 'FILE_UPLOADED') and v_prefs.assigned_project_photos then
        if v_relevance not in ('requires_attention', 'mentioned', 'reply_to_you', 'reply_to_your_update', 'you_are_assigned') then
          v_relevance := 'assigned_project';
        end if;
        v_include := true;
      elsif p_activity_type in ('PROJECT_STATUS_CHANGED', 'USER_ASSIGNED_TO_PROJECT', 'USER_REMOVED_FROM_PROJECT') then
        if v_prefs.general_project_activity or v_prefs.assigned_project_comments then
          if v_relevance not in ('requires_attention', 'mentioned', 'reply_to_you', 'reply_to_your_update', 'you_are_assigned') then
            v_relevance := 'assigned_project';
          end if;
          v_include := true;
        end if;
      end if;
    end if;

    -- Management always receives project conversation / file activity (not only high-priority prefs).
    if v_recipient_role in ('admin', 'project_manager') then
      if p_activity_type in (
        'ATTENDANCE_EXCEPTION_SUBMITTED', 'ATTENDANCE_REJECTED', 'ATTENDANCE_CORRECTED', 'ATTENTION_REQUESTED'
      ) then
        if v_prefs.attendance_alerts or v_prefs.requires_attention_enabled then
          if public.relevance_priority('requires_attention') >= public.relevance_priority(v_relevance) then
            v_relevance := 'requires_attention';
          end if;
          v_include := true;
        end if;
      elsif p_activity_type in (
        'COMMENT_CREATED', 'COMMENT_REPLIED', 'PHOTO_UPLOADED', 'FILE_UPLOADED', 'PROJECT_STATUS_CHANGED'
      ) then
        if v_relevance not in (
          'requires_attention', 'mentioned', 'reply_to_you', 'reply_to_your_update', 'you_are_assigned'
        ) then
          v_relevance := 'assigned_project';
        end if;
        v_include := true;
      elsif not v_include and v_prefs.admin_feed_mode = 'all' and v_prefs.general_project_activity then
        v_relevance := 'not_involved';
        v_include := true;
      elsif not v_include and v_prefs.admin_feed_mode = 'high_priority' and p_requires_attention then
        v_relevance := 'requires_attention';
        v_include := true;
      end if;
    end if;

    -- Clients only see client-facing project notes (and assignment/status on their projects).
    if v_include and v_recipient_role = 'client' then
      if p_entity_type = 'project_note' then
        select coalesce(visible_to_client, false) or author_id = v_recipient
        into v_note_visible
        from public.project_notes
        where id = p_entity_id;

        if not coalesce(v_note_visible, false) then
          v_include := false;
        end if;
      elsif p_activity_type in ('PHOTO_UPLOADED', 'FILE_UPLOADED') and p_entity_type = 'document' then
        -- Project files on their assignment stay visible.
        null;
      elsif p_activity_type in (
        'PROJECT_STATUS_CHANGED', 'USER_ASSIGNED_TO_PROJECT', 'USER_REMOVED_FROM_PROJECT'
      ) then
        null;
      elsif p_activity_type in ('COMMENT_CREATED', 'COMMENT_REPLIED', 'PHOTO_UPLOADED', 'FILE_UPLOADED') then
        -- Non-note conversation types without visibility still allowed if already included
        -- via assignee rules above (e.g. document uploads).
        null;
      end if;
    end if;

    if not v_include then
      continue;
    end if;

    v_priority := public.relevance_priority(v_relevance);
    v_route := p_destination_route;
    if v_recipient_role = 'client' and v_route like '/projects/%' then
      v_route := replace(v_route, '/projects/', '/portal/projects/');
    end if;

    delete from public.notifications
    where recipient_id = v_recipient
      and entity_id is not distinct from p_entity_id
      and entity_type is not distinct from p_entity_type
      and is_read = false
      and created_at > now() - interval '10 minutes'
      and priority <= v_priority;

    if exists (
      select 1 from public.notifications n
      where n.recipient_id = v_recipient
        and n.entity_id is not distinct from p_entity_id
        and n.entity_type is not distinct from p_entity_type
        and n.is_read = false
        and n.created_at > now() - interval '10 minutes'
        and n.priority > v_priority
    ) then
      continue;
    end if;

    insert into public.notifications (
      organization_id, recipient_id, actor_id, project_id, activity_id, activity_type,
      entity_type, entity_id, parent_entity_id, relevance, priority,
      title, message, preview_text, link, destination_route, thumbnail_path,
      review_status, metadata
    ) values (
      p_organization_id, v_recipient, p_actor_id, p_project_id, v_activity_id, p_activity_type,
      p_entity_type, p_entity_id, p_parent_entity_id, v_relevance, v_priority,
      p_title,
      coalesce(p_preview_text, p_title) || case when v_project_name is not null then ' · ' || v_project_name else '' end,
      p_preview_text,
      v_route,
      v_route,
      p_thumbnail_path,
      case when p_requires_attention or v_relevance = 'requires_attention'
        then 'new'::public.attention_review_status
        else 'none'::public.attention_review_status
      end,
      jsonb_build_object(
        'relevance_label', public.relevance_label(v_relevance),
        'project_name', v_project_name,
        'scope', 'PROJECT'
      ) || coalesce(p_metadata, '{}'::jsonb)
    );
  end loop;

  return v_activity_id;
end;
$$;

revoke all on function public.emit_project_activity(
  uuid, uuid, uuid, public.project_activity_type, text, uuid, uuid, text, text, text, text, boolean, uuid[], jsonb
) from public;
grant execute on function public.emit_project_activity(
  uuid, uuid, uuid, public.project_activity_type, text, uuid, uuid, text, text, text, text, boolean, uuid[], jsonb
) to authenticated;
