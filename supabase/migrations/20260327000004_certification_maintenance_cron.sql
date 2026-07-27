-- Daily certification maintenance job (pg_cron)
-- Runs without a user session, so this uses a dedicated job function.

create or replace function public.run_certification_maintenance_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  refreshed integer;
  notified integer;
begin
  refreshed := public.refresh_all_certification_statuses();
  notified := public.notify_certification_alerts();
  return jsonb_build_object(
    'refreshed', refreshed,
    'notified', notified,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.run_certification_maintenance_job() from public;
revoke all on function public.run_certification_maintenance_job() from anon;
revoke all on function public.run_certification_maintenance_job() from authenticated;
-- Cron / database owner can still execute (security definer).

-- Enable pg_cron (Supabase: also enable under Database → Extensions if needed)
create extension if not exists pg_cron with schema pg_catalog;

-- Avoid duplicate schedules if migration is re-run
do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'tamay-certification-maintenance-daily'
  ) then
    perform cron.unschedule('tamay-certification-maintenance-daily');
  end if;
exception
  when undefined_table then
    -- cron schema not ready yet; create extension should have handled this
    null;
end;
$$;

-- 13:00 UTC ≈ 9:00 AM Eastern (EDT)
select cron.schedule(
  'tamay-certification-maintenance-daily',
  '0 13 * * *',
  $$select public.run_certification_maintenance_job();$$
);
