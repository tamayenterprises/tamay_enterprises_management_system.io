-- Centralized project activity + enhanced notifications (additive)

do $$ begin
  create type public.project_activity_type as enum (
    'COMMENT_CREATED',
    'COMMENT_REPLIED',
    'USER_MENTIONED',
    'PHOTO_UPLOADED',
    'FILE_UPLOADED',
    'PROJECT_STATUS_CHANGED',
    'USER_ASSIGNED_TO_PROJECT',
    'USER_REMOVED_FROM_PROJECT',
    'ATTENDANCE_STARTED',
    'BREAK_STARTED',
    'BREAK_ENDED',
    'ATTENDANCE_ENDED',
    'ATTENDANCE_REJECTED',
    'ATTENDANCE_EXCEPTION_SUBMITTED',
    'ATTENDANCE_CORRECTED',
    'ATTENTION_REQUESTED',
    'ATTENTION_REVIEWED',
    'ATTENTION_RESOLVED',
    'GENERAL'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_relevance as enum (
    'requires_attention',
    'mentioned',
    'reply_to_you',
    'assigned_project',
    'you_are_assigned',
    'general',
    'not_involved'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.attention_review_status as enum (
    'none',
    'new',
    'reviewed',
    'resolved'
  );
exception when duplicate_object then null;
end $$;

-- Extend notifications (keep existing rows working)
alter table public.notifications
  add column if not exists actor_id uuid references public.profiles (id) on delete set null,
  add column if not exists project_id uuid references public.projects (id) on delete set null,
  add column if not exists activity_id uuid,
  add column if not exists activity_type public.project_activity_type,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists parent_entity_id uuid,
  add column if not exists relevance public.notification_relevance default 'general',
  add column if not exists priority smallint not null default 50,
  add column if not exists preview_text text,
  add column if not exists destination_route text,
  add column if not exists read_at timestamptz,
  add column if not exists review_status public.attention_review_status not null default 'none',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists thumbnail_path text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill destination from link
update public.notifications
set destination_route = coalesce(destination_route, link)
where destination_route is null and link is not null;

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_priority_idx
  on public.notifications (recipient_id, is_read, priority desc, created_at desc);
create index if not exists notifications_project_idx
  on public.notifications (project_id, created_at desc);

-- Project activity event stream (feed source)
create table if not exists public.project_activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  activity_type public.project_activity_type not null,
  entity_type text,
  entity_id uuid,
  parent_entity_id uuid,
  title text not null,
  preview_text text,
  destination_route text,
  thumbnail_path text,
  requires_attention boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_activity_events_org_created_idx
  on public.project_activity_events (organization_id, created_at desc);
create index if not exists project_activity_events_project_created_idx
  on public.project_activity_events (project_id, created_at desc);
create index if not exists project_activity_events_type_idx
  on public.project_activity_events (activity_type, created_at desc);

alter table public.notifications
  drop constraint if exists notifications_activity_id_fkey;
alter table public.notifications
  add constraint notifications_activity_id_fkey
  foreign key (activity_id) references public.project_activity_events (id) on delete set null;

-- Structured mentions on project updates
create table if not exists public.project_note_mentions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.project_notes (id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (note_id, mentioned_user_id)
);

create index if not exists project_note_mentions_user_idx
  on public.project_note_mentions (mentioned_user_id, created_at desc);

alter table public.project_notes
  add column if not exists requires_attention boolean not null default false;

-- Per-user notification preferences
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  mentions_enabled boolean not null default true,
  replies_to_my_comments boolean not null default true,
  assigned_project_comments boolean not null default true,
  assigned_project_photos boolean not null default true,
  general_project_activity boolean not null default false,
  attendance_alerts boolean not null default true,
  requires_attention_enabled boolean not null default true,
  admin_feed_mode text not null default 'high_priority',
  updated_at timestamptz not null default now(),
  constraint notification_preferences_admin_feed_mode_check
    check (admin_feed_mode in ('all', 'high_priority', 'assigned_only'))
);

-- RLS
alter table public.project_activity_events enable row level security;
alter table public.project_note_mentions enable row level security;
alter table public.notification_preferences enable row level security;

drop policy if exists "Users view permitted activity events" on public.project_activity_events;
create policy "Users view permitted activity events"
  on public.project_activity_events for select
  to authenticated
  using (
    public.is_approved_user()
    and (
      public.has_management_role()
      or (
        project_id is not null
        and public.is_assigned_to_project(project_id)
      )
      or actor_id = (select auth.uid())
    )
  );

drop policy if exists "Users view note mentions" on public.project_note_mentions;
create policy "Users view note mentions"
  on public.project_note_mentions for select
  to authenticated
  using (
    public.is_approved_user()
    and (
      mentioned_user_id = (select auth.uid())
      or public.has_management_role()
      or exists (
        select 1 from public.project_notes n
        where n.id = note_id
          and (
            n.author_id = (select auth.uid())
            or public.is_assigned_to_project(n.project_id)
          )
      )
    )
  );

drop policy if exists "Users insert note mentions for own notes" on public.project_note_mentions;
create policy "Users insert note mentions for own notes"
  on public.project_note_mentions for insert
  to authenticated
  with check (
    public.is_approved_user()
    and exists (
      select 1 from public.project_notes n
      where n.id = note_id and n.author_id = (select auth.uid())
    )
  );

drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences"
  on public.notification_preferences for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Relevance rank helper
create or replace function public.relevance_priority(p_relevance public.notification_relevance)
returns smallint
language sql
immutable
as $$
  select case p_relevance
    when 'requires_attention' then 100
    when 'mentioned' then 90
    when 'reply_to_you' then 80
    when 'you_are_assigned' then 70
    when 'assigned_project' then 60
    when 'general' then 40
    when 'not_involved' then 20
    else 30
  end;
$$;

create or replace function public.relevance_label(p_relevance public.notification_relevance)
returns text
language sql
immutable
as $$
  select case p_relevance
    when 'requires_attention' then 'Requires Your Attention'
    when 'mentioned' then 'You Were Mentioned'
    when 'reply_to_you' then 'Reply to Your Comment'
    when 'you_are_assigned' then 'You Are Assigned'
    when 'assigned_project' then 'Activity on Your Assigned Project'
    when 'general' then 'General Project Activity'
    when 'not_involved' then 'You Are Not Involved'
    else 'General Project Activity'
  end;
$$;

create or replace function public.get_or_create_notification_preferences(p_user_id uuid)
returns public.notification_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notification_preferences%rowtype;
begin
  select * into v_row from public.notification_preferences where user_id = p_user_id;
  if found then return v_row; end if;
  insert into public.notification_preferences (user_id)
  values (p_user_id)
  returning * into v_row;
  return v_row;
end;
$$;

-- Core emitter: activity event + deduplicated notifications
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
begin
  select name into v_project_name from public.projects where id = p_project_id;

  insert into public.project_activity_events (
    organization_id, project_id, actor_id, activity_type, entity_type, entity_id, parent_entity_id,
    title, preview_text, destination_route, thumbnail_path, requires_attention, metadata
  ) values (
    p_organization_id, p_project_id, p_actor_id, p_activity_type, p_entity_type, p_entity_id, p_parent_entity_id,
    p_title, p_preview_text, p_destination_route, p_thumbnail_path, p_requires_attention, coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_activity_id;

  -- Candidate recipients: assignees + management in org + mentioned + parent author
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
      continue; -- never notify actor about own action
    end if;

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
          if public.relevance_priority('reply_to_you') > public.relevance_priority(v_relevance) or not v_include then
            v_relevance := 'reply_to_you';
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
        if public.relevance_priority('assigned_project') > public.relevance_priority(v_relevance) or not v_include then
          if v_relevance not in ('requires_attention', 'mentioned', 'reply_to_you', 'you_are_assigned') then
            v_relevance := 'assigned_project';
          end if;
        end if;
        v_include := true;
      elsif p_activity_type in ('PHOTO_UPLOADED', 'FILE_UPLOADED') and v_prefs.assigned_project_photos then
        if v_relevance not in ('requires_attention', 'mentioned', 'reply_to_you', 'you_are_assigned') then
          v_relevance := 'assigned_project';
        end if;
        v_include := true;
      elsif p_activity_type in ('PROJECT_STATUS_CHANGED', 'USER_ASSIGNED_TO_PROJECT', 'USER_REMOVED_FROM_PROJECT') then
        if v_prefs.general_project_activity or v_prefs.assigned_project_comments then
          if v_relevance not in ('requires_attention', 'mentioned', 'reply_to_you', 'you_are_assigned') then
            v_relevance := 'assigned_project';
          end if;
          v_include := true;
        end if;
      end if;
    end if;

    -- Management visibility for attendance / admin-worthy events
    if exists (
      select 1 from public.profiles p
      where p.id = v_recipient and p.role in ('admin', 'project_manager')
    ) then
      if p_activity_type in (
        'ATTENDANCE_EXCEPTION_SUBMITTED', 'ATTENDANCE_REJECTED', 'ATTENDANCE_CORRECTED', 'ATTENTION_REQUESTED'
      ) then
        if v_prefs.attendance_alerts or v_prefs.requires_attention_enabled then
          if public.relevance_priority('requires_attention') >= public.relevance_priority(v_relevance) then
            v_relevance := 'requires_attention';
          end if;
          v_include := true;
        end if;
      elsif not v_include and v_prefs.admin_feed_mode = 'all' and v_prefs.general_project_activity then
        v_relevance := 'not_involved';
        v_include := true;
      elsif not v_include and v_prefs.admin_feed_mode = 'high_priority' and p_requires_attention then
        v_relevance := 'requires_attention';
        v_include := true;
      end if;
    end if;

    if not v_include then
      continue;
    end if;

    v_priority := public.relevance_priority(v_relevance);

    -- Dedupe: keep a single unread notification per recipient+entity; upgrade if higher priority
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
      p_destination_route,
      p_destination_route,
      p_thumbnail_path,
      case when p_requires_attention or v_relevance = 'requires_attention' then 'new'::public.attention_review_status else 'none'::public.attention_review_status end,
      jsonb_build_object(
        'relevance_label', public.relevance_label(v_relevance),
        'project_name', v_project_name
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

-- Trigger: project notes → activity + notifications
create or replace function public.trg_project_note_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_actor_name text;
  v_title text;
  v_preview text;
  v_type public.project_activity_type;
  v_route text;
  v_mentions uuid[];
  v_parent uuid;
begin
  select organization_id into v_org from public.projects where id = new.project_id;
  select trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_actor_name
  from public.profiles where id = new.author_id;

  v_parent := new.parent_id;
  v_preview := left(coalesce(new.content, case when new.photo_path is not null then 'Shared a photo' else 'Project update' end), 180);
  v_route := '/projects/' || new.project_id::text || '?update=' || new.id::text;
  if v_parent is not null then
    v_route := v_route || '&parent=' || v_parent::text;
  end if;

  select coalesce(array_agg(mentioned_user_id), '{}'::uuid[])
  into v_mentions
  from public.project_note_mentions
  where note_id = new.id;

  if v_parent is not null then
    v_type := 'COMMENT_REPLIED';
    v_title := coalesce(nullif(v_actor_name, ''), 'Someone') || ' replied to a comment';
  elsif new.photo_path is not null and coalesce(trim(new.content), '') = '' then
    v_type := 'PHOTO_UPLOADED';
    v_title := coalesce(nullif(v_actor_name, ''), 'Someone') || ' uploaded a photo';
  else
    v_type := 'COMMENT_CREATED';
    v_title := coalesce(nullif(v_actor_name, ''), 'Someone') || ' posted a project update';
  end if;

  -- Keep comment/reply/photo type for recipient rules; attention is a flag + title prefix
  if new.requires_attention then
    v_title := coalesce(nullif(v_actor_name, ''), 'Someone') || ' requested attention';
  end if;

  perform public.emit_project_activity(
    v_org,
    new.project_id,
    new.author_id,
    v_type,
    'project_note',
    new.id,
    v_parent,
    v_title,
    v_preview,
    v_route,
    new.photo_path,
    coalesce(new.requires_attention, false),
    coalesce(v_mentions, '{}'::uuid[]),
    jsonb_build_object('has_photo', new.photo_path is not null)
  );

  -- Mention-specific activity type amplification already handled via mentioned ids in emitter
  return new;
end;
$$;

drop trigger if exists project_notes_emit_activity on public.project_notes;
create trigger project_notes_emit_activity
  after insert on public.project_notes
  for each row execute function public.trg_project_note_activity();

-- Mentions inserted after note: refresh notifications for those users by emitting mention signal
create or replace function public.register_project_note_mentions(
  p_note_id uuid,
  p_mentioned_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.project_notes%rowtype;
  v_org uuid;
  v_actor_name text;
  v_uid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_note from public.project_notes where id = p_note_id;
  if not found then raise exception 'Update not found'; end if;
  if v_note.author_id is distinct from auth.uid() and not public.has_management_role() then
    raise exception 'Not allowed';
  end if;

  foreach v_uid in array coalesce(p_mentioned_user_ids, '{}'::uuid[]) loop
    insert into public.project_note_mentions (note_id, mentioned_user_id)
    values (p_note_id, v_uid)
    on conflict do nothing;
  end loop;

  -- Re-emit a mention-focused activity for newly registered mentions (dedupe by creating USER_MENTIONED)
  select organization_id into v_org from public.projects where id = v_note.project_id;
  select trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_actor_name
  from public.profiles where id = v_note.author_id;

  if coalesce(array_length(p_mentioned_user_ids, 1), 0) > 0 then
    perform public.emit_project_activity(
      v_org,
      v_note.project_id,
      v_note.author_id,
      'USER_MENTIONED',
      'project_note',
      v_note.id,
      v_note.parent_id,
      coalesce(nullif(v_actor_name, ''), 'Someone') || ' mentioned you',
      left(coalesce(v_note.content, 'Mention in project update'), 180),
      '/projects/' || v_note.project_id::text || '?update=' || v_note.id::text,
      v_note.photo_path,
      false,
      p_mentioned_user_ids,
      '{}'::jsonb
    );
  end if;
end;
$$;

revoke all on function public.register_project_note_mentions(uuid, uuid[]) from public;
grant execute on function public.register_project_note_mentions(uuid, uuid[]) to authenticated;

-- Document uploads on projects
create or replace function public.trg_document_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
  v_type public.project_activity_type;
  v_title text;
begin
  if new.project_id is null then
    return new;
  end if;

  select trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_actor_name
  from public.profiles where id = new.uploaded_by;

  if new.category = 'work_photo' then
    v_type := 'PHOTO_UPLOADED';
    v_title := coalesce(nullif(v_actor_name, ''), 'Someone') || ' uploaded project photos';
  else
    v_type := 'FILE_UPLOADED';
    v_title := coalesce(nullif(v_actor_name, ''), 'Someone') || ' uploaded a project file';
  end if;

  perform public.emit_project_activity(
    new.organization_id,
    new.project_id,
    new.uploaded_by,
    v_type,
    'document',
    new.id,
    null,
    v_title,
    left(new.name, 180),
    '/projects/' || new.project_id::text || '?tab=files&doc=' || new.id::text,
    case when new.category = 'work_photo' then new.storage_path else null end,
    false,
    '{}'::uuid[],
    jsonb_build_object('category', new.category)
  );
  return new;
end;
$$;

drop trigger if exists documents_emit_project_activity on public.documents;
create trigger documents_emit_project_activity
  after insert on public.documents
  for each row execute function public.trg_document_project_activity();

-- Attendance exception → admin attention
create or replace function public.trg_attendance_exception_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  select trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_actor_name
  from public.profiles where id = new.user_id;

  perform public.emit_project_activity(
    new.organization_id,
    new.project_id,
    new.user_id,
    'ATTENDANCE_EXCEPTION_SUBMITTED',
    'attendance_exception',
    new.id,
    null,
    coalesce(nullif(v_actor_name, ''), 'Someone') || ' submitted a clock-in exception',
    left(new.explanation, 180),
    '/timesheets?exception=' || new.id::text,
    new.photo_path,
    true,
    '{}'::uuid[],
    jsonb_build_object('requested_action', new.requested_action)
  );
  return new;
end;
$$;

drop trigger if exists attendance_exception_emit_activity on public.attendance_exception_requests;
create trigger attendance_exception_emit_activity
  after insert on public.attendance_exception_requests
  for each row execute function public.trg_attendance_exception_activity();

-- Mark read helper sets read_at
create or replace function public.trg_notification_read_at()
returns trigger
language plpgsql
as $$
begin
  if new.is_read is distinct from old.is_read then
    if new.is_read then
      new.read_at := coalesce(new.read_at, now());
    else
      new.read_at := null;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_read_at on public.notifications;
create trigger notifications_read_at
  before update on public.notifications
  for each row execute function public.trg_notification_read_at();

-- Assignment changes
create or replace function public.trg_project_assignment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_actor uuid;
  v_actor_name text;
  v_assignee_name text;
  v_type public.project_activity_type;
  v_title text;
begin
  select organization_id into v_org from public.projects where id = coalesce(new.project_id, old.project_id);
  v_actor := auth.uid();
  select trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_actor_name
  from public.profiles where id = v_actor;
  select trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_assignee_name
  from public.profiles where id = coalesce(new.profile_id, old.profile_id);

  if tg_op = 'INSERT' and new.is_active then
    v_type := 'USER_ASSIGNED_TO_PROJECT';
    v_title := coalesce(nullif(v_assignee_name, ''), 'Someone') || ' was assigned to the project';
    perform public.emit_project_activity(
      v_org, new.project_id, v_actor, v_type, 'project_assignment', new.id, null,
      v_title, v_title,
      '/projects/' || new.project_id::text,
      null, false, '{}'::uuid[],
      jsonb_build_object('assignee_id', new.profile_id)
    );
  elsif tg_op = 'UPDATE' and old.is_active and not new.is_active then
    v_type := 'USER_REMOVED_FROM_PROJECT';
    v_title := coalesce(nullif(v_assignee_name, ''), 'Someone') || ' was removed from the project';
    perform public.emit_project_activity(
      v_org, new.project_id, v_actor, v_type, 'project_assignment', new.id, null,
      v_title, v_title,
      '/projects/' || new.project_id::text,
      null, false, '{}'::uuid[],
      jsonb_build_object('assignee_id', new.profile_id)
    );
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists project_assignments_emit_activity on public.project_assignments;
create trigger project_assignments_emit_activity
  after insert or update of is_active on public.project_assignments
  for each row execute function public.trg_project_assignment_activity();

-- Project status changes
create or replace function public.trg_project_status_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  select trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_actor_name
  from public.profiles where id = auth.uid();

  perform public.emit_project_activity(
    new.organization_id,
    new.id,
    auth.uid(),
    'PROJECT_STATUS_CHANGED',
    'project',
    new.id,
    null,
    coalesce(nullif(v_actor_name, ''), 'Someone') || ' changed project status',
    'Status: ' || old.status::text || ' → ' || new.status::text,
    '/projects/' || new.id::text,
    null,
    false,
    '{}'::uuid[],
    jsonb_build_object('from_status', old.status, 'to_status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists projects_status_emit_activity on public.projects;
create trigger projects_status_emit_activity
  after update of status on public.projects
  for each row execute function public.trg_project_status_activity();

-- Limited historical backfill for activity feed only (NOT unread notifications)
insert into public.project_activity_events (
  organization_id, project_id, actor_id, activity_type, entity_type, entity_id, parent_entity_id,
  title, preview_text, destination_route, thumbnail_path, requires_attention, metadata, created_at
)
select
  pr.organization_id,
  n.project_id,
  n.author_id,
  case
    when n.parent_id is not null then 'COMMENT_REPLIED'::public.project_activity_type
    when n.photo_path is not null and coalesce(trim(n.content), '') = '' then 'PHOTO_UPLOADED'::public.project_activity_type
    else 'COMMENT_CREATED'::public.project_activity_type
  end,
  'project_note',
  n.id,
  n.parent_id,
  'Historical project update',
  left(coalesce(n.content, 'Photo update'), 180),
  '/projects/' || n.project_id::text || '?update=' || n.id::text,
  n.photo_path,
  false,
  jsonb_build_object('backfill', true),
  n.created_at
from public.project_notes n
join public.projects pr on pr.id = n.project_id
where n.created_at > now() - interval '14 days'
  and not exists (
    select 1 from public.project_activity_events e
    where e.entity_type = 'project_note' and e.entity_id = n.id
  );
