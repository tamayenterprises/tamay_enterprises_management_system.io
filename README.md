# Tamay Enterprises Management System

Private internal employee and subcontractor management platform for **Tamay Enterprises**.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS + shadcn-style UI primitives
- React Router + TanStack Query
- React Hook Form + Zod
- Supabase (Auth, Postgres, Storage, RLS)
- Vitest + Testing Library
- GitHub Actions CI
- Vercel deployment

## Getting started

1. Clone the repository
2. Copy environment variables:

```bash
cp .env.example .env
```

3. Create a Supabase project and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

4. Apply the SQL migration in `supabase/migrations/20260327000000_initial_schema.sql` from the Supabase SQL editor (or via Supabase CLI).

5. Install and run locally:

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite development server |
| `npm run build` | Typecheck and production build |
| `npm run test` | Run unit tests |
| `npm run lint` | Lint source files |
| `npm run typecheck` | TypeScript project build check |
| `npm run preview` | Preview production build |

## Authentication & approval flow

- Users can register as **Employee** or **Subcontractor**
- New accounts are created in `pending` approval status
- Unapproved users cannot enter the application
- Admins approve/reject registrations from `/admin`

## Roles

- **Admin** — full access, approvals, role assignment, settings
- **Project Manager** — projects, assignments, documents
- **Employee** — assigned projects, progress updates, personal docs/certs
- **Subcontractor** — same operational access as employees, plus trade/company fields

## Deployment

### Vercel

1. Import the GitHub repository into Vercel
2. Framework preset: Vite
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

`vercel.json` already configures SPA rewrites for client-side routing.

### GitHub Actions

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`/`develop`:

- install
- lint
- typecheck
- test
- build

## Feature branches

Recommended workflow:

- `feature/authentication`
- `feature/user-roles`
- `feature/employee-management`
- `feature/subcontractor-management`
- `feature/project-management`
- `feature/project-assignment`
- `feature/dashboard`
- `feature/certification-management`
- `feature/document-management`
- `feature/notifications`
- `feature/admin-panel`

## Architecture notes

- Organization-scoped schema supports future multi-tenant SaaS conversion
- Authorization is enforced with Supabase Row Level Security
- Frontend route guards are convenience only; RLS is the source of truth
- Document/file uploads use private Supabase Storage buckets

## First admin bootstrap

After applying migrations:

1. Register the first admin candidate through the UI (or create via Supabase Auth)
2. In SQL, promote and approve that profile:

```sql
update public.profiles
set role = 'admin', approval_status = 'approved', is_active = true
where email = 'your-admin@email.com';
```

## Editing roles in Supabase (non-technical)

Roles are stored in the `roles` lookup table with friendly labels (Admin, Project Manager, etc.).

1. Open **Table Editor** → **profiles**
2. Click the **role** cell for a user
3. Choose from the dropdown (linked to `roles`)

To rename how a role appears in that dropdown, edit the `label` column in the **roles** table. Do not change role `id` values unless you also update app/RLS logic.
