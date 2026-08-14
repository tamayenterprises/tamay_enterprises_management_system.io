-- STEP 1 of 2 — Exception request status values only.
-- Run this first and wait for Success before 20260336000001.
-- Postgres requires new enum values to be committed before use (55P04).

do $$ begin
  alter type public.exception_request_status add value if not exists 'under_review';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type public.exception_request_status add value if not exists 'cancelled';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type public.exception_request_status add value if not exists 'resolved';
exception
  when duplicate_object then null;
end $$;

select 'Exception status enums ready — next run 20260336000001_attendance_repair_workflow.sql' as next_step;
