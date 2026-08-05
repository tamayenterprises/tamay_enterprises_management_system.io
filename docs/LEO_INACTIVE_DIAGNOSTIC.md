# Leo / worker inactive diagnostic

Run in Supabase SQL Editor. Read-only. Does not change data.

```sql
-- 1) Eligibility for Leo matches
select public.diagnose_worker_by_name('Leo');

-- 2) Authoritative profile fields
select
  id, first_name, last_name, email, role,
  approval_status, is_active, archived_at, created_at, updated_at
from public.profiles
where first_name ilike 'Leo%'
   or (first_name || ' ' || last_name) ilike '%Leo%Cabrera%'
order by created_at desc;

-- 3) Active assignments vs profile activity
select
  pa.is_active as assignment_active,
  p.name as project_name,
  pr.first_name, pr.last_name,
  pr.is_active as profile_active,
  pr.approval_status
from public.project_assignments pa
join public.profiles pr on pr.id = pa.profile_id
join public.projects p on p.id = pa.project_id
where pr.first_name ilike 'Leo%' and pa.is_active = true;

-- 4) Exception requests
select r.id, r.status, r.requested_action, r.explanation, r.created_at, p.name as project_name
from public.attendance_exception_requests r
join public.profiles pr on pr.id = r.user_id
left join public.projects p on p.id = r.project_id
where pr.first_name ilike 'Leo%'
order by r.created_at desc
limit 20;
```

## Exact inactive rule (Clock In)

Worker is blocked when any of these fail:

1. `profiles.approval_status = 'approved'`
2. `profiles.is_active = true`
3. `profiles.archived_at is null` (eligibility service)

Common Leo failure mode:

- Assigned to a project (`project_assignments.is_active = true`)
- But `profiles.is_active = false` (deactivated, rejected signup set inactive, or never activated after approval edge case)

Clock In raises: profile not approved/active.

Exception **approval review** remains available. Creating attendance while inactive is blocked until Activate Worker. **Approve and Correct Attendance** still works for management after activation (activation alone does not create attendance).
