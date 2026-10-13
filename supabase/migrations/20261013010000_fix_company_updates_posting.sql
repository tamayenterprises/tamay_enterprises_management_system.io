-- APPLY THIS ENTIRE FILE in the Supabase SQL Editor (Dashboard → SQL).
-- Vercel deploys do not run it. Until this succeeds, posting returns 403 and
-- list_company_updates returns 404.
--
-- Company updates: admins must be able to load and post even when a mention is
-- outside the chosen audience or notification fan-out hits an error.

create or replace function public.company_update_root_id(p_update_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
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
  if p_user_id is null or p_update_id is null then return false; end if;

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

  if v_role = 'admin' then
    return true;
  end if;

  if v_root.audience_type = 'all_internal' then
    return true;
  elsif v_root.audience_type = 'employees' then
    return v_role in ('employee', 'subcontractor');
  elsif v_root.audience_type = 'management' then
    return v_role in ('admin', 'project_manager');
  elsif v_root.audience_type = 'project_managers' then
    return v_role in ('project_manager', 'admin');
  elsif v_root.audience_type = 'selected_users' then
    return exists (
      select 1 from public.company_update_audience_members m
      where m.update_id = v_root.id and m.profile_id = p_user_id
    ) or v_root.author_id = p_user_id;
  end if;
  return false;
exception
  when others then
    return false;
end;
$$;

grant execute on function public.company_update_root_id(uuid) to authenticated;
grant execute on function public.is_in_company_update_audience(uuid, uuid) to authenticated;

drop policy if exists "View company updates in audience" on public.company_updates;
create policy "View company updates in audience"
  on public.company_updates for select
  to authenticated
  using (
    public.is_approved_user()
    and public.same_organization(organization_id)
    and (
      public.has_management_role()
      or public.is_in_company_update_audience(id)
    )
  );

grant select, insert, update on public.company_updates to authenticated;
grant select, insert, delete on public.company_update_audience_members to authenticated;
grant select, insert on public.company_update_mentions to authenticated;
grant select, insert, delete on public.company_update_project_refs to authenticated;

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

  begin
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
  exception
    when others then
      raise warning 'Company update notification fan-out failed: %', sqlerrm;
  end;
  return new;
end;
$$;

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
    -- Mentioning someone outside a role audience should not block the post.
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

  begin
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

    if coalesce(array_length(p_project_ids, 1), 0) > 0 then
      perform public.emit_company_activity(
        v_update.organization_id,
        v_update.author_id,
        'COMPANY_UPDATE_CREATED',
        'company_update',
        p_update_id,
        v_update.parent_id,
        coalesce(nullif(v_actor_name, ''), 'Someone') || ' referenced a project in a Company Update',
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
  exception
    when others then
      raise warning 'Company update extras notification failed: %', sqlerrm;
  end;
end;
$$;

grant execute on function public.register_company_update_extras(uuid, uuid[], uuid[], uuid[]) to authenticated;

create or replace function public.list_company_updates(p_limit int default 40)
returns setof public.company_updates
language sql
stable
security definer
set search_path = public
as $$
  select u.*
  from public.company_updates u
  where public.is_approved_user()
    and public.same_organization(u.organization_id)
    and (
      public.has_management_role()
      or public.is_in_company_update_audience(u.id)
    )
  order by u.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

grant execute on function public.list_company_updates(int) to authenticated;

drop policy if exists "Management create company updates" on public.company_updates;
create policy "Management create company updates"
  on public.company_updates for insert
  to authenticated
  with check (
    public.is_approved_user()
    and author_id = (select auth.uid())
    and public.same_organization(organization_id)
    and (
      (
        parent_id is null
        and public.has_management_role()
      )
      or (
        parent_id is not null
        and public.is_in_company_update_audience(parent_id)
      )
    )
  );

create or replace function public.post_company_update(
  p_content text default null,
  p_photo_path text default null,
  p_parent_id uuid default null,
  p_audience_type public.company_update_audience default 'all_internal',
  p_replies_enabled boolean default true,
  p_requires_attention boolean default false,
  p_notify_project_team boolean default false,
  p_mentioned_user_ids uuid[] default '{}',
  p_project_ids uuid[] default '{}',
  p_audience_user_ids uuid[] default '{}'
)
returns public.company_updates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_row public.company_updates%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid
    and approval_status = 'approved'
    and is_active = true
    and archived_at is null;
  if not found then
    raise exception 'Not allowed';
  end if;

  if p_parent_id is null then
    if v_profile.role not in ('admin', 'project_manager') then
      raise exception 'Not allowed';
    end if;
  elsif not public.is_in_company_update_audience(p_parent_id, v_uid) then
    raise exception 'Not allowed';
  end if;

  if coalesce(trim(p_content), '') = '' and p_photo_path is null then
    raise exception 'Write an update or add a photo';
  end if;

  insert into public.company_updates (
    organization_id,
    author_id,
    content,
    photo_path,
    parent_id,
    audience_type,
    replies_enabled,
    requires_attention,
    notify_project_team
  )
  values (
    v_profile.organization_id,
    v_uid,
    nullif(trim(p_content), ''),
    p_photo_path,
    p_parent_id,
    case when p_parent_id is null then coalesce(p_audience_type, 'all_internal') else 'all_internal' end,
    case when p_parent_id is null then coalesce(p_replies_enabled, true) else true end,
    case when p_parent_id is null then coalesce(p_requires_attention, false) else false end,
    case when p_parent_id is null then coalesce(p_notify_project_team, false) else false end
  )
  returning * into v_row;

  perform public.register_company_update_extras(
    v_row.id,
    coalesce(p_mentioned_user_ids, '{}'::uuid[]),
    coalesce(p_project_ids, '{}'::uuid[]),
    coalesce(p_audience_user_ids, '{}'::uuid[])
  );

  return v_row;
end;
$$;

revoke all on function public.post_company_update(
  text, text, uuid, public.company_update_audience, boolean, boolean, boolean, uuid[], uuid[], uuid[]
) from public;
grant execute on function public.post_company_update(
  text, text, uuid, public.company_update_audience, boolean, boolean, boolean, uuid[], uuid[], uuid[]
) to authenticated;

notify pgrst, 'reload schema';
