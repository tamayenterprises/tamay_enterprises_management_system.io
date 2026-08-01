# Production readiness — Tamay Enterprises (single company)

This app is an **internal** employee & subcontractor management system for **Tamay Enterprises only** (not multi-tenant SaaS).

Use this checklist before treating the Vercel + Supabase deployment as production.

---

## 1. Apply all database migrations (required)

In Supabase → **SQL Editor**, run each file in order (or use `supabase db push` if the CLI is linked):

1. `supabase/migrations/20260327000000_initial_schema.sql`
2. `supabase/migrations/20260327000001_roles_lookup_dropdown.sql`
3. `supabase/migrations/20260327000002_notifications_delete_policy.sql`
4. `supabase/migrations/20260327000003_production_security_hardening.sql`
5. `supabase/migrations/20260327000004_certification_maintenance_cron.sql`
6. `supabase/migrations/20260327000005_owner_delete_certs_docs.sql`
7. `supabase/migrations/20260328000000_workforce_status.sql`
8. `supabase/migrations/20260328000001_attendance_records.sql`
9. `supabase/migrations/20260329000000_profile_avatars.sql`
10. `supabase/migrations/20260331000000_project_updates.sql`
11. `supabase/migrations/20260332000000_attendance_geofencing.sql`

**Notes**

- Migration `00004` requires **pg_cron**. Enable it first: Dashboard → **Database → Extensions → pg_cron**.
- Migration `00001` (attendance) depends on workforce status (`00000` in the `20260328` series).
- Migration `00000` (avatars / `20260329`) updates the workforce status view — run after workforce status.
- Migration `20260332` (geofencing) adds project coordinates, breaks, location attempts, exceptions, and RPCs. After applying it, deploy Edge Function `geocode-address` (optional Mapbox secret `MAPBOX_ACCESS_TOKEN`; otherwise Nominatim).
- Existing projects are marked `needs_verification` until an admin verifies coordinates on the project page.

### Verify cron job

```sql
select * from cron.job where jobname = 'tamay-certification-maintenance-daily';
select public.run_certification_maintenance_job();
```

---

## 2. Auth URLs (required)

In Supabase → **Authentication → URL configuration**:

- **Site URL**: your production Vercel URL (e.g. `https://your-app.vercel.app`)
- **Redirect URLs** (include all that apply):
  - `https://your-app.vercel.app/**`
  - `http://localhost:5173/**` (local development)

Confirm password reset / change-password routes work after deploy.

---

## 3. First admin (required)

After the first registration (or Auth user create):

```sql
update public.profiles
set role = 'admin', approval_status = 'approved', is_active = true
where email = 'your-admin@email.com';
```

Confirm you can open `/admin` and approve other users.

---

## 4. Vercel environment (required)

| Variable | Notes |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon/public key only (never service role in the frontend) |

Build: `npm run build` · Output: `dist` · SPA rewrites: see `vercel.json`.

---

## 5. Storage buckets (required)

Confirm these buckets exist (created by initial migration):

- `documents` (private)
- `project-files` (private)
- `avatars` (public — used for profile photos)

---

## 6. Smoke test (required)

Sign in as **admin**, then as an **employee** (or use two browsers):

1. Admin approves a pending user
2. Worker uploads a profile photo from the sidebar
3. Worker clocks in → status becomes Active; set status to On Site
4. Management sees workforce status + today’s attendance
5. Worker clocks out → hours appear on Timesheets
6. Upload a certification with proof file; confirm documents list
7. Search for a person/project name
8. Sign out works; unapproved users stay on pending screen

---

## 7. What production hardening already includes

- Profile privilege escalation blocked by trigger
- Storage read/write scoped to owner folder + approved users / managers
- Document inserts bound to uploader + organization
- Worker project updates limited to status
- Certification status refresh + expiration notifications (daily cron)
- Upload size/type validation, delete confirmations, global sign-out, password recovery
- App error boundary and stronger password rules
- Search input sanitized for PostgREST filters

---

## 8. Backups (Tamay ops)

- Rely on **Supabase** automatic backups for the project plan in use
- Assign an owner (usually company admin) who knows how to restore from the Supabase dashboard if needed
- Keep at least one approved admin account accessible

---

## 9. Optional hardening (not blockers)

- Error monitoring (e.g. Sentry) on the Vercel frontend
- Email alerts for certification expiry (in-app notifications already exist)
- Code-split large client bundle if page loads feel slow on mobile
