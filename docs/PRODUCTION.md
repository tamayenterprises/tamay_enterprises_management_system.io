# Production readiness notes

## Apply before go-live

1. Run migration `supabase/migrations/20260327000003_production_security_hardening.sql` in Supabase SQL Editor (or `supabase db push`).
2. In Supabase Auth settings, add production site URL and redirect URLs for Vercel.
3. Confirm first admin exists (`profiles.role = 'admin'`, `approval_status = 'approved'`).
4. Optional: schedule `select public.run_certification_maintenance();` daily via pg_cron / Edge Function.

## What this release hardens

- Profile privilege escalation blocked by trigger
- Storage read/write scoped to owner folder + approved users / managers
- Document inserts bound to uploader + organization
- Worker project updates limited to status
- Certification status refresh + expiration notifications
- Upload size/type validation, delete confirmations, global sign-out, password recovery route
- App error boundary and stronger password rules
