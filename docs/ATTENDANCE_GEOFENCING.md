# Attendance geofencing — ops checklist

## Apply database migration

1. Supabase → SQL Editor
2. Run `supabase/migrations/20260332000000_attendance_geofencing.sql`
3. Confirm Success

## Deploy geocoding Edge Function (recommended)

```bash
supabase functions deploy geocode-address
# optional paid provider:
supabase secrets set MAPBOX_ACCESS_TOKEN=your_token
```

Without Mapbox, Nominatim is used (rate-limited; fine for admin lookups).

Admins can always enter latitude/longitude manually on the project page.

## Verify existing project addresses

1. Open each active project as Admin / Project Manager
2. Scroll to **Job-site location**
3. Confirm or edit the address → **Generate coordinates** (or paste lat/lng)
4. Set authorized radius (default **300 ft**)
5. **Verify & save location**

Until verified, workers cannot complete normal geofenced clock actions (exception requests still allowed).

## Defaults

| Setting | Value |
| --- | --- |
| Geofence radius | 300 ft ≈ 91.44 m (per project, admin-configurable) |
| Max GPS accuracy | 150 ft ≈ 45.72 m (org setting) |

Poor accuracy ≠ outside geofence. Workers are asked to retry; they may submit an exception.

## Local workflow test

1. Apply migration + deploy function
2. `npm install && npm run dev`
3. Verify a project location
4. Assign yourself to that project
5. On a phone or browser with location permission: Clock In → Start Break → End Break → Clock Out
6. Confirm each action re-requests GPS
7. Timesheets: timeline, paid hours, rejected attempts, exceptions

## Unit tests

```bash
npm test -- src/lib/geo.test.ts
```
