-- Company Updates enums ONLY (must commit before schema migration)
-- Run this file first in Supabase SQL Editor, then run 20260334000001_company_updates_schema.sql

do $$ begin
  alter type public.project_activity_type add value if not exists 'COMPANY_UPDATE_CREATED';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type public.project_activity_type add value if not exists 'COMPANY_UPDATE_REPLIED';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type public.project_activity_type add value if not exists 'COMPANY_UPDATE_MENTIONED';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.notification_relevance add value if not exists 'reply_to_your_update';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type public.notification_relevance add value if not exists 'company_update';
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.company_update_audience as enum (
    'all_internal',
    'employees',
    'management',
    'project_managers',
    'selected_users'
  );
exception when duplicate_object then null;
end $$;
