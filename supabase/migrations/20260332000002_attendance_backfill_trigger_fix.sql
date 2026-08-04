-- Run this NOW in Supabase SQL Editor, then re-run the full geofencing migration.
-- Fixes: "Cannot modify a closed attendance record" during workflow_status backfill.

alter table public.attendance_records disable trigger attendance_records_enforce_update;

update public.attendance_records
set workflow_status = case
  when clock_out_time is null then 'working'::public.attendance_workflow_status
  else 'completed'::public.attendance_workflow_status
end
where workflow_status is null;

alter table public.attendance_records enable trigger attendance_records_enforce_update;

select 'Attendance backfill done — re-run 20260332000000_attendance_geofencing.sql' as next_step;
