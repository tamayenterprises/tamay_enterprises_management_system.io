-- Company Updates schema/functions (run AFTER 20260334000000 enums have committed)
-- Postgres requires new enum labels to be committed before they can be referenced.


-- Company updates (roots + one-level replies)
create table if not exists public.company_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  parent_id uuid references public.company_updates (id) on delete cascade,
  content text,
  photo_path text,
  audience_type public.company_update_audience not null default 'all_internal',
  replies_enabled boolean not null default true,
  requires_attention boolean not null default false,
  notify_project_team boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_updates_content_or_photo check (
    coalesce(nullif(trim(content), ''), null) is not null or photo_path is not null
  )
);

create index if not exists company_updates_org_created_idx
  on public.company_updates (organization_id, created_at desc);
create index if not exists company_updates_parent_idx
  on public.company_updates (parent_id, created_at asc)
  where parent_id is not null;

drop trigger if exists company_updates_updated_at on public.company_updates;
create trigger company_updates_updated_at
  before update on public.company_updates
  for each row execute function public.set_updated_at();

-- One-level replies only; inherit org; replies use root audience
create or replace function public.enforce_company_update_parent()
returns trigger
language plpgsql
as $$
declare
  v_parent public.company_updates%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into v_parent from public.company_updates where id = new.parent_id;
  if not found then
    raise exception 'Parent company update not found';
  end if;
  if v_parent.parent_id is not null then
    raise exception 'Only one level of replies is supported';
  end if;
  if not v_parent.replies_enabled then
    raise exception 'Replies are disabled for this company update';
  end if;

  new.organization_id := v_parent.organization_id;
  new.audience_type := v_parent.audience_type;
  new.replies_enabled := true;
  new.notify_project_team := false;
  return new;
end;
$$;

drop trigger if exists company_updates_enforce_parent on public.company_updates;
create trigger company_updates_enforce_parent
  before insert on public.company_updates
  for each row execute function public.enforce_company_update_parent();

create table if not exists public.company_update_audience_members (
  update_id uuid not null references public.company_updates (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (update_id, profile_id)
);

create table if not exists public.company_update_mentions (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.company_updates (id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (update_id, mentioned_user_id)
);

create index if not exists company_update_mentions_user_idx
  on public.company_update_mentions (mentioned_user_id, created_at desc);

create table if not exists public.company_update_project_refs (
  update_id uuid not null references public.company_updates (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (update_id, project_id)
);

create index if not exists company_update_project_refs_project_idx
  on public.company_update_project_refs (project_id, created_at desc);

-- Structured # project refs on project notes (link only; no auto-notify)
create table if not exists public.project_note_project_refs (
  note_id uuid not null references public.project_notes (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, project_id)
);

alter table public.notification_preferences
  add column if not exists company_updates_enabled boolean not null default true;

-- Audience membership helpers
create or replace function public.company_update_root_id(p_update_id uuid)
returns uuid
language sql
stable
as $$
  select coalesce(parent_id, id) from public.company_updates where id = p_update_id;
$$;

create or replace function public.is_in_company_update_audience(p_update_id uuid, p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root public.company_updates%rowtype;
  v_role text;
  v_org uuid;
begin
  if p_user_id is null then return false; end if;

  select * into v_root
  from public.company_updates
  where id = public.company_update_root_id(p_update_id);
  if not found then return false; end if;

  select role, organization_id into v_role, v_org
  from public.profiles
  where id = p_user_id
    and approval_status = 'approved'
    and is_active = true
    and archived_at is null;
  if not found then return false; end if;
  if v_org is distinct from v_root.organization_id then return false; end if;

  if v_root.audience_type = 'all_internal' then
    return true;
  elsif v_root.audience_type = 'employees' then
    return v_role in ('employee', 'subcontractor');
  elsif v_root.audience_type = 'management' then
    return v_role in ('admin', 'project_manager');
  elsif v_root.audience_type = 'project_managers' then
    return v_role = 'project_manager' or v_role = 'admin';
  elsif v_root.audience_type = 'selected_users' then
    return exists (
      select 1 from public.company_update_audience_members m
      where m.update_id = v_root.id and m.profile_id = p_user_id
    ) or v_root.author_id = p_user_id or v_role = 'admin';
  end if;
  return false;
end;
$$;

create or replace function public.company_update_audience_user_ids(p_update_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root public.company_updates%rowtype;
begin
  select * into v_root
  from public.company_updates
  where id = public.company_update_root_id(p_update_id);
  if not found then return; end if;

  if v_root.audience_type = 'all_internal' then
    return query
      select p.id from public.profiles p
      where p.organization_id = v_root.organization_id
        and p.approval_status = 'approved'
        and p.is_active = true
        and p.archived_at is null;
  elsif v_root.audience_type = 'employees' then
    return query
      select p.id from public.profiles p
      where p.organization_id = v_root.organization_id
        and p.role in ('employee', 'subcontractor')
        and p.approval_status = 'approved'
        and p.is_active = true
        and p.archived_at is null;
  elsif v_root.audience_type = 'management' then
    return query
      select p.id from public.profiles p
      where p.organization_id = v_root.organization_id
        and p.role in ('admin', 'project_manager')
        and p.approval_status = 'approved'
        and p.is_active = true
        and p.archived_at is null;
  elsif v_root.audience_type = 'project_managers' then
    return query
      select p.id from public.profiles p
      where p.organization_id = v_root.organization_id
        and p.role in ('admin', 'project_manager')
        and p.approval_status = 'approved'
        and p.is_active = true
        and p.archived_at is null;
  elsif v_root.audience_type = 'selected_users' then
    return query
      select m.profile_id from public.company_update_audience_members m
      where m.update_id = v_root.id
      union
      select v_root.author_id where v_root.author_id is not null;
  end if;
end;
$$;

-- RLS
alter table public.company_updates enable row level security;
alter table public.company_update_audience_members enable row level security;
alter table public.company_update_mentions enable row level security;
alter table public.company_update_project_refs enable row level security;
alter table public.project_note_project_refs enable row level security;

grant select, insert, update on public.company_updates to authenticated;
grant select, insert, delete on public.company_update_audience_members to authenticated;
grant select, insert on public.company_update_mentions to authenticated;
grant select, insert, delete on public.company_update_project_refs to authenticated;
grant select, insert, delete on public.project_note_project_refs to authenticated;

drop policy if exists "View company updates in audience" on public.company_updates;
create policy "View company updates in audience"
  on public.company_updates for select
  to authenticated
  using (
    public.is_approved_user()
    and public.is_in_company_update_audience(id)
  );

drop policy if exists "Management create company updates" on public.company_updates;
create policy "Management create company updates"
  on public.company_updates for insert
  to authenticated
  with check (
    public.is_approved_user()
    and author_id = (select auth.uid())
    and (
      (
        parent_id is null
        and public.has_management_role()
        and public.same_organization(organization_id)
      )
      or (
        parent_id is not null
        and public.is_in_company_update_audience(parent_id)
      )
    )
  );

drop policy if exists "Authors or management update company updates" on public.company_updates;
create policy "Authors or management update company updates"
  on public.company_updates for update
  to authenticated
  using (
    public.is_approved_user()
    and (author_id = (select auth.uid()) or public.has_management_role())
  )
  with check (
    public.is_approved_user()
    and (author_id = (select auth.uid()) or public.has_management_role())
  );

drop policy if exists "View company update audience members" on public.company_update_audience_members;
create policy "View company update audience members"
  on public.company_update_audience_members for select
  to authenticated
  using (public.is_approved_user() and public.is_in_company_update_audience(update_id));

drop policy if exists "Authors manage audience members" on public.company_update_audience_members;
create policy "Authors manage audience members"
  on public.company_update_audience_members for insert
  to authenticated
  with check (
    public.is_approved_user()
    and public.has_management_role()
    and exists (
      select 1 from public.company_updates u
      where u.id = update_id and u.author_id = (select auth.uid()) and u.parent_id is null
    )
  );

drop policy if exists "Authors delete audience members" on public.company_update_audience_members;
create policy "Authors delete audience members"
  on public.company_update_audience_members for delete
  to authenticated
  using (
    public.has_management_role()
    and exists (
      select 1 from public.company_updates u
      where u.id = update_id and u.author_id = (select auth.uid())
    )
  );

drop policy if exists "View company update mentions" on public.company_update_mentions;
create policy "View company update mentions"
  on public.company_update_mentions for select
  to authenticated
  using (
    public.is_approved_user()
    and (
      mentioned_user_id = (select auth.uid())
      or public.is_in_company_update_audience(update_id)
    )
  );

drop policy if exists "Insert company update mentions" on public.company_update_mentions;
create policy "Insert company update mentions"
  on public.company_update_mentions for insert
  to authenticated
  with check (
    public.is_approved_user()
    and exists (
      select 1 from public.company_updates u
      where u.id = update_id and u.author_id = (select auth.uid())
    )
  );

drop policy if exists "View company update project refs" on public.company_update_project_refs;
create policy "View company update project refs"
  on public.company_update_project_refs for select
  to authenticated
  using (public.is_approved_user() and public.is_in_company_update_audience(update_id));

drop policy if exists "Insert company update project refs" on public.company_update_project_refs;
create policy "Insert company update project refs"
  on public.company_update_project_refs for insert
  to authenticated
  with check (
    public.is_approved_user()
    and exists (
      select 1 from public.company_updates u
      where u.id = update_id and u.author_id = (select auth.uid())
    )
  );

drop policy if exists "View project note project refs" on public.project_note_project_refs;
create policy "View project note project refs"
  on public.project_note_project_refs for select
  to authenticated
  using (
    public.is_approved_user()
    and exists (
      select 1 from public.project_notes n
      where n.id = note_id
        and (public.has_management_role() or public.is_assigned_to_project(n.project_id))
    )
  );

drop policy if exists "Insert project note project refs" on public.project_note_project_refs;
create policy "Insert project note project refs"
  on public.project_note_project_refs for insert
  to authenticated
  with check (
    public.is_approved_user()
    and exists (
      select 1 from public.project_notes n
      where n.id = note_id and n.author_id = (select auth.uid())
    )
  );

-- Refresh relevance helpers (new enum values)
create or replace function public.relevance_priority(p_relevance public.notification_relevance)
returns smallint
language sql
immutable
as $$
  select case p_relevance
    when 'requires_attention' then 100
    when 'mentioned' then 90
    when 'reply_to_you' then 85
    when 'reply_to_your_update' then 82
    when 'you_are_assigned' then 70
    when 'assigned_project' then 60
    when 'company_update' then 55
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
    when 'reply_to_your_update' then 'Reply to Your Update'
    when 'you_are_assigned' then 'You Are Assigned'
    when 'assigned_project' then 'Activity on Your Assigned Project'
    when 'company_update' then 'Company Update'
    when 'general' then 'General Activity'
    when 'not_involved' then 'You Are Not Involved'
    else 'General Activity'
  end;
$$;

-- Company activity emitter
create or replace function public.emit_company_activity(
  p_organization_id uuid,
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
  p_project_ids uuid[] default '{}',
  p_notify_project_team boolean default false,
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
  v_primary_project uuid;
begin
  v_primary_project := case when coalesce(array_length(p_project_ids, 1), 0) > 0 then p_project_ids[1] else null end;

  insert into public.project_activity_events (
    organization_id, project_id, actor_id, activity_type, entity_type, entity_id, parent_entity_id,
    title, preview_text, destination_route, thumbnail_path, requires_attention, metadata
  ) values (
    p_organization_id, v_primary_project, p_actor_id, p_activity_type, p_entity_type, p_entity_id, p_parent_entity_id,
    p_title, p_preview_text, p_destination_route, p_thumbnail_path, p_requires_attention,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'scope', 'COMPANY',
      'project_ids', to_jsonb(coalesce(p_project_ids, '{}'::uuid[])),
      'notify_project_team', p_notify_project_team
    )
  )
  returning id into v_activity_id;

  for v_recipient in
    select distinct uid from (
      select public.company_update_audience_user_ids(coalesce(p_parent_entity_id, p_entity_id)) as uid
      union
      select unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[]))
      union
      select pa.profile_id
      from public.project_assignments pa
      where p_notify_project_team
        and pa.is_active = true
        and pa.project_id = any(coalesce(p_project_ids, '{}'::uuid[]))
      union
      select cu.author_id
      from public.company_updates cu
      where p_parent_entity_id is not null and cu.id = p_parent_entity_id
    ) candidates
    where uid is not null
  loop
    if v_recipient = p_actor_id then
      continue;
    end if;

    -- Mentions must be able to open the update
    if not public.is_in_company_update_audience(coalesce(p_parent_entity_id, p_entity_id), v_recipient)
       and not (
         p_notify_project_team
         and exists (
           select 1 from public.project_assignments pa
           where pa.profile_id = v_recipient
             and pa.is_active
             and pa.project_id = any(coalesce(p_project_ids, '{}'::uuid[]))
         )
       )
    then
      -- still allow if they are in audience of the update via selected membership after notify team add
      if not public.is_in_company_update_audience(coalesce(p_parent_entity_id, p_entity_id), v_recipient) then
        continue;
      end if;
    end if;

    v_prefs := public.get_or_create_notification_preferences(v_recipient);
    v_relevance := 'company_update';
    v_include := false;

    if p_requires_attention and v_prefs.requires_attention_enabled then
      v_relevance := 'requires_attention';
      v_include := true;
    end if;

    if v_recipient = any(coalesce(p_mentioned_user_ids, '{}'::uuid[])) and v_prefs.mentions_enabled then
      if public.relevance_priority('mentioned') > public.relevance_priority(v_relevance) or not v_include then
        v_relevance := 'mentioned';
      end if;
      v_include := true;
    end if;

    if p_activity_type = 'COMPANY_UPDATE_REPLIED' and p_parent_entity_id is not null then
      if exists (
        select 1 from public.company_updates cu
        where cu.id = p_parent_entity_id and cu.author_id = v_recipient
      ) and v_prefs.replies_to_my_comments then
        if exists (
          select 1 from public.company_updates cu
          where cu.id = p_parent_entity_id and cu.parent_id is null
        ) then
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

    if not v_include and coalesce(v_prefs.company_updates_enabled, true) then
      if p_activity_type in ('COMPANY_UPDATE_CREATED', 'COMPANY_UPDATE_REPLIED', 'COMPANY_UPDATE_MENTIONED') then
        if v_relevance not in ('requires_attention', 'mentioned', 'reply_to_you', 'reply_to_your_update') then
          v_relevance := 'company_update';
        end if;
        -- Prefer not flooding every audience member for ordinary posts unless mention/reply/attention/notify team
        if p_activity_type = 'COMPANY_UPDATE_CREATED'
           and not p_requires_attention
           and coalesce(array_length(p_mentioned_user_ids, 1), 0) = 0
           and not p_notify_project_team then
          -- Author-only broadcast to audience is intentional for company posts: notify audience lightly
          v_include := true;
        elsif p_activity_type = 'COMPANY_UPDATE_REPLIED' then
          -- reply participants: only if they authored root or were mentioned (already handled) or notify team
          if p_notify_project_team
             or exists (
               select 1 from public.company_updates cu
               where cu.id = public.company_update_root_id(p_entity_id)
                 and cu.author_id = v_recipient
             )
             or exists (
               select 1 from public.company_update_mentions m
               where m.update_id in (p_entity_id, p_parent_entity_id)
                 and m.mentioned_user_id = v_recipient
             )
          then
            v_include := true;
          end if;
        else
          v_include := true;
        end if;
      end if;
    end if;

    if p_notify_project_team and exists (
      select 1 from public.project_assignments pa
      where pa.profile_id = v_recipient and pa.is_active
        and pa.project_id = any(coalesce(p_project_ids, '{}'::uuid[]))
    ) then
      if public.relevance_priority('assigned_project') > public.relevance_priority(v_relevance) or not v_include then
        if v_relevance not in ('requires_attention', 'mentioned', 'reply_to_you', 'reply_to_your_update') then
          v_relevance := 'assigned_project';
        end if;
      end if;
      v_include := true;
    end if;

    if not v_include then
      continue;
    end if;

    v_priority := public.relevance_priority(v_relevance);

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
      p_organization_id, v_recipient, p_actor_id, v_primary_project, v_activity_id, p_activity_type,
      p_entity_type, p_entity_id, p_parent_entity_id, v_relevance, v_priority,
      p_title,
      coalesce(p_preview_text, p_title),
      p_preview_text,
      p_destination_route,
      p_destination_route,
      p_thumbnail_path,
      case when p_requires_attention or v_relevance = 'requires_attention'
        then 'new'::public.attention_review_status
        else 'none'::public.attention_review_status
      end,
      jsonb_build_object(
        'relevance_label', public.relevance_label(v_relevance),
        'scope', 'COMPANY'
      ) || coalesce(p_metadata, '{}'::jsonb)
    );
  end loop;

  return v_activity_id;
end;
$$;

revoke all on function public.emit_company_activity(
  uuid, uuid, public.project_activity_type, text, uuid, uuid, text, text, text, text, boolean, uuid[], uuid[], boolean, jsonb
) from public;
grant execute on function public.emit_company_activity(
  uuid, uuid, public.project_activity_type, text, uuid, uuid, text, text, text, text, boolean, uuid[], uuid[], boolean, jsonb
) to authenticated;

-- Trigger after company update insert
create or replace function public.trg_company_update_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
  v_title text;
  v_preview text;
  v_type public.project_activity_type;
  v_route text;
  v_root_id uuid;
  v_project_ids uuid[];
  v_mentions uuid[];
  v_notify_team boolean;
begin
  select trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_actor_name
  from public.profiles where id = new.author_id;

  v_root_id := coalesce(new.parent_id, new.id);
  v_preview := left(coalesce(new.content, case when new.photo_path is not null then 'Shared a photo' else 'Company update' end), 180);
  v_route := '/updates?tab=company&update=' || v_root_id::text;
  if new.parent_id is not null then
    v_route := v_route || '&reply=' || new.id::text;
  end if;

  select coalesce(array_agg(project_id), '{}'::uuid[]) into v_project_ids
  from public.company_update_project_refs
  where update_id = v_root_id;

  select coalesce(array_agg(mentioned_user_id), '{}'::uuid[]) into v_mentions
  from public.company_update_mentions
  where update_id = new.id;

  if new.parent_id is not null then
    v_type := 'COMPANY_UPDATE_REPLIED';
    v_title := coalesce(nullif(v_actor_name, ''), 'Someone') || ' replied in a Company Update';
    v_notify_team := false;
  else
    v_type := 'COMPANY_UPDATE_CREATED';
    v_title := coalesce(nullif(v_actor_name, ''), 'Someone') || ' posted a Company Update';
    v_notify_team := new.notify_project_team;
  end if;

  if new.requires_attention then
    v_title := coalesce(nullif(v_actor_name, ''), 'Someone') || ' requested attention in a Company Update';
  end if;

  perform public.emit_company_activity(
    new.organization_id,
    new.author_id,
    v_type,
    'company_update',
    new.id,
    new.parent_id,
    v_title,
    v_preview,
    v_route,
    new.photo_path,
    coalesce(new.requires_attention, false),
    coalesce(v_mentions, '{}'::uuid[]),
    coalesce(v_project_ids, '{}'::uuid[]),
    v_notify_team,
    jsonb_build_object('audience_type', new.audience_type::text)
  );
  return new;
end;
$$;

drop trigger if exists company_updates_emit_activity on public.company_updates;
create trigger company_updates_emit_activity
  after insert on public.company_updates
  for each row execute function public.trg_company_update_activity();

-- Register mentions + project refs for company updates
create or replace function public.register_company_update_extras(
  p_update_id uuid,
  p_mentioned_user_ids uuid[] default '{}',
  p_project_ids uuid[] default '{}',
  p_audience_user_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_update public.company_updates%rowtype;
  v_root_id uuid;
  v_uid uuid;
  v_pid uuid;
  v_actor_name text;
  v_project_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_update from public.company_updates where id = p_update_id;
  if not found then raise exception 'Update not found'; end if;
  if v_update.author_id is distinct from auth.uid() and not public.has_management_role() then
    raise exception 'Not allowed';
  end if;

  v_root_id := coalesce(v_update.parent_id, v_update.id);

  if v_update.parent_id is null
     and v_update.audience_type = 'selected_users'
     and coalesce(array_length(p_audience_user_ids, 1), 0) > 0 then
    foreach v_uid in array p_audience_user_ids loop
      insert into public.company_update_audience_members (update_id, profile_id)
      values (v_root_id, v_uid)
      on conflict do nothing;
    end loop;
  end if;

  foreach v_uid in array coalesce(p_mentioned_user_ids, '{}'::uuid[]) loop
    if not public.is_in_company_update_audience(v_root_id, v_uid) then
      raise exception 'Mentioned user must be included in the Company Update audience';
    end if;
    insert into public.company_update_mentions (update_id, mentioned_user_id)
    values (p_update_id, v_uid)
    on conflict do nothing;
  end loop;

  foreach v_pid in array coalesce(p_project_ids, '{}'::uuid[]) loop
    insert into public.company_update_project_refs (update_id, project_id)
    values (v_root_id, v_pid)
    on conflict do nothing;
  end loop;

  select coalesce(array_agg(project_id), '{}'::uuid[]) into v_project_ids
  from public.company_update_project_refs where update_id = v_root_id;

  select trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_actor_name
  from public.profiles where id = v_update.author_id;

  if coalesce(array_length(p_mentioned_user_ids, 1), 0) > 0 then
    perform public.emit_company_activity(
      v_update.organization_id,
      v_update.author_id,
      'COMPANY_UPDATE_MENTIONED',
      'company_update',
      p_update_id,
      v_update.parent_id,
      coalesce(nullif(v_actor_name, ''), 'Someone') || ' mentioned you in a Company Update',
      left(coalesce(v_update.content, 'Mention in company update'), 180),
      '/updates?tab=company&update=' || v_root_id::text || case when v_update.parent_id is not null then '&reply=' || p_update_id::text else '' end,
      v_update.photo_path,
      false,
      p_mentioned_user_ids,
      coalesce(v_project_ids, '{}'::uuid[]),
      false,
      '{}'::jsonb
    );
  end if;

  -- Re-notify after audience members / project refs are attached (covers selected_users + notify team)
  if v_update.parent_id is null
     and (
       coalesce(array_length(p_audience_user_ids, 1), 0) > 0
       or (v_update.notify_project_team and coalesce(array_length(v_project_ids, 1), 0) > 0)
     ) then
    perform public.emit_company_activity(
      v_update.organization_id,
      v_update.author_id,
      'COMPANY_UPDATE_CREATED',
      'company_update',
      p_update_id,
      null,
      coalesce(nullif(v_actor_name, ''), 'Someone') || ' posted a Company Update',
      left(coalesce(v_update.content, 'Company update'), 180),
      '/updates?tab=company&update=' || v_root_id::text,
      v_update.photo_path,
      coalesce(v_update.requires_attention, false),
      coalesce(p_mentioned_user_ids, '{}'::uuid[]),
      coalesce(v_project_ids, '{}'::uuid[]),
      coalesce(v_update.notify_project_team, false),
      jsonb_build_object('extras_followup', true)
    );
  end if;
end;
$$;

revoke all on function public.register_company_update_extras(uuid, uuid[], uuid[], uuid[]) from public;
grant execute on function public.register_company_update_extras(uuid, uuid[], uuid[], uuid[]) to authenticated;

create or replace function public.register_project_note_project_refs(
  p_note_id uuid,
  p_project_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.project_notes%rowtype;
  v_pid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_note from public.project_notes where id = p_note_id;
  if not found then raise exception 'Update not found'; end if;
  if v_note.author_id is distinct from auth.uid() and not public.has_management_role() then
    raise exception 'Not allowed';
  end if;

  foreach v_pid in array coalesce(p_project_ids, '{}'::uuid[]) loop
    -- Only allow referencing projects the author can access
    if public.has_management_role() or public.is_assigned_to_project(v_pid) then
      insert into public.project_note_project_refs (note_id, project_id)
      values (p_note_id, v_pid)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.register_project_note_project_refs(uuid, uuid[]) from public;
grant execute on function public.register_project_note_project_refs(uuid, uuid[]) to authenticated;

-- Tighten project note mentions: mentioned user must be able to access the project
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
  v_allowed boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_note from public.project_notes where id = p_note_id;
  if not found then raise exception 'Update not found'; end if;
  if v_note.author_id is distinct from auth.uid() and not public.has_management_role() then
    raise exception 'Not allowed';
  end if;

  foreach v_uid in array coalesce(p_mentioned_user_ids, '{}'::uuid[]) loop
    select exists (
      select 1 from public.profiles p
      where p.id = v_uid
        and p.approval_status = 'approved'
        and p.is_active = true
        and p.archived_at is null
        and (
          p.role in ('admin', 'project_manager')
          or exists (
            select 1 from public.project_assignments pa
            where pa.project_id = v_note.project_id
              and pa.profile_id = v_uid
              and pa.is_active = true
          )
        )
    ) into v_allowed;

    if not v_allowed then
      continue; -- skip unauthorized mentions instead of granting access
    end if;

    insert into public.project_note_mentions (note_id, mentioned_user_id)
    values (p_note_id, v_uid)
    on conflict do nothing;
  end loop;

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
      coalesce(nullif(v_actor_name, ''), 'Someone') || ' mentioned you in a Project Update',
      left(coalesce(v_note.content, 'Mention in project update'), 180),
      '/projects/' || v_note.project_id::text || '?update=' || v_note.id::text,
      v_note.photo_path,
      false,
      (
        select coalesce(array_agg(mentioned_user_id), '{}'::uuid[])
        from public.project_note_mentions
        where note_id = p_note_id
      ),
      jsonb_build_object('scope', 'PROJECT')
    );
  end if;
end;
$$;

-- Improve project reply relevance: root author â†’ reply_to_your_update
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
      coalesce(p_preview_text, p_title) || case when v_project_name is not null then ' Â· ' || v_project_name else '' end,
      p_preview_text,
      p_destination_route,
      p_destination_route,
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
