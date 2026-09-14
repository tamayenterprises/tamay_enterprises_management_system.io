-- Project Financial Tracking Phase 1: client payments + internal receipts
-- Additive only. Does not expose receipts to clients. Does not flip existing project visibility.

alter table public.projects
  add column if not exists original_project_total numeric(12, 2),
  add column if not exists current_project_total numeric(12, 2),
  add column if not exists project_total_updated_at timestamptz,
  add column if not exists project_total_updated_by uuid references public.profiles (id) on delete set null;

comment on column public.projects.original_project_total is
  'Original contract total. Established on first save; later management corrections require confirmation and audit.';
comment on column public.projects.current_project_total is
  'Current contract total (may change with change orders).';

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  label text not null,
  stage_key text not null default 'other'
    check (stage_key in ('initial', 'progress', 'second_progress', 'final', 'other')),
  expected_percent numeric(6, 2),
  expected_amount numeric(12, 2) not null default 0
    check (expected_amount >= 0),
  actual_amount numeric(12, 2) not null default 0
    check (actual_amount >= 0),
  status text not null default 'due'
    check (status in ('due', 'partial', 'paid', 'void')),
  method text
    check (method is null or method in ('check', 'stripe', 'other')),
  received_on date,
  check_reference text,
  proof_storage_path text,
  proof_mime_type text,
  proof_file_name text,
  notes text,
  stripe_payment_link_url text,
  stripe_payment_link_active boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_payments_project_sort_idx
  on public.project_payments (project_id, sort_order, created_at);
create index if not exists project_payments_project_status_idx
  on public.project_payments (project_id, status);

create table if not exists public.project_payment_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  payment_id uuid references public.project_payments (id) on delete set null,
  receipt_id uuid,
  entity_type text not null check (entity_type in ('payment', 'receipt', 'project_total')),
  field_name text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists project_payment_audit_project_idx
  on public.project_payment_audit (project_id, changed_at desc);

create table if not exists public.project_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  receipt_number text,
  amount numeric(12, 2) not null
    check (amount >= 0),
  received_on date not null default (current_date),
  proof_storage_path text,
  proof_mime_type text,
  proof_file_name text,
  notes text,
  status text not null default 'active'
    check (status in ('active', 'void')),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_receipts_project_created_idx
  on public.project_receipts (project_id, created_at desc);
create index if not exists project_receipts_project_status_idx
  on public.project_receipts (project_id, status);

-- Link audit receipt_id after receipts table exists
do $$ begin
  alter table public.project_payment_audit
    add constraint project_payment_audit_receipt_fk
    foreign key (receipt_id) references public.project_receipts (id) on delete set null;
exception when duplicate_object then null;
end $$;

alter table public.project_payments enable row level security;
alter table public.project_receipts enable row level security;
alter table public.project_payment_audit enable row level security;

-- Payments: management full access; assigned clients can read non-void rows
drop policy if exists "Managers manage project payments" on public.project_payments;
create policy "Managers manage project payments"
  on public.project_payments for all
  to authenticated
  using (public.has_management_role() and public.same_organization(organization_id))
  with check (public.has_management_role() and public.same_organization(organization_id));

drop policy if exists "Assigned clients view project payments" on public.project_payments;
create policy "Assigned clients view project payments"
  on public.project_payments for select
  to authenticated
  using (
    public.is_approved_user()
    and public.is_assigned_to_project(project_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'client'
    )
    and status <> 'void'
  );

-- Receipts: management full access; assigned employees can view/add for their projects
drop policy if exists "Managers manage project receipts" on public.project_receipts;
create policy "Managers manage project receipts"
  on public.project_receipts for all
  to authenticated
  using (public.has_management_role() and public.same_organization(organization_id))
  with check (public.has_management_role() and public.same_organization(organization_id));

drop policy if exists "Assigned employees view project receipts" on public.project_receipts;
create policy "Assigned employees view project receipts"
  on public.project_receipts for select
  to authenticated
  using (
    public.is_approved_user()
    and public.is_assigned_to_project(project_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'employee'
        and p.is_active = true
        and p.archived_at is null
    )
  );

drop policy if exists "Assigned employees insert project receipts" on public.project_receipts;
create policy "Assigned employees insert project receipts"
  on public.project_receipts for insert
  to authenticated
  with check (
    public.is_approved_user()
    and public.is_assigned_to_project(project_id)
    and created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'employee'
        and p.is_active = true
        and p.archived_at is null
    )
  );

drop policy if exists "Assigned employees update own project receipts" on public.project_receipts;
create policy "Assigned employees update own project receipts"
  on public.project_receipts for update
  to authenticated
  using (
    public.is_approved_user()
    and public.is_assigned_to_project(project_id)
    and created_by = auth.uid()
    and status = 'active'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'employee'
    )
  )
  with check (
    public.is_assigned_to_project(project_id)
    and created_by = auth.uid()
    and status = 'active'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'employee'
    )
  );

-- Audit: management read/write
drop policy if exists "Managers manage financial audit" on public.project_payment_audit;
create policy "Managers manage financial audit"
  on public.project_payment_audit for all
  to authenticated
  using (public.has_management_role() and public.same_organization(organization_id))
  with check (public.has_management_role() and public.same_organization(organization_id));

-- Clients may read project totals columns via existing projects SELECT (assigned).
-- No separate client policy needed for projects columns.

grant select, insert, update, delete on public.project_payments to authenticated;
grant select, insert, update, delete on public.project_receipts to authenticated;
grant select, insert, update, delete on public.project_payment_audit to authenticated;

-- Dedicated private bucket for payment proofs + receipts (not the broad project-files bucket).
insert into storage.buckets (id, name, public)
values ('project-finance', 'project-finance', false)
on conflict (id) do nothing;

drop policy if exists "Managers read project finance storage" on storage.objects;
create policy "Managers read project finance storage"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-finance'
    and public.has_management_role()
  );

drop policy if exists "Managers insert project finance storage" on storage.objects;
create policy "Managers insert project finance storage"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-finance'
    and public.has_management_role()
  );

drop policy if exists "Assigned employees insert receipt files" on storage.objects;
create policy "Assigned employees insert receipt files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-finance'
    and name like '%/receipts/%'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'employee'
        and p.approval_status = 'approved'
        and p.is_active = true
        and p.archived_at is null
        and public.is_assigned_to_project(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "Assigned employees read project receipts storage" on storage.objects;
create policy "Assigned employees read project receipts storage"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-finance'
    and exists (
      select 1
      from public.project_receipts r
      join public.profiles p on p.id = auth.uid()
      where r.proof_storage_path = name
        and r.status <> 'void'
        and p.role = 'employee'
        and p.approval_status = 'approved'
        and p.is_active = true
        and public.is_assigned_to_project(r.project_id)
    )
  );

drop policy if exists "Managers update project finance storage" on storage.objects;
create policy "Managers update project finance storage"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-finance'
    and public.has_management_role()
  )
  with check (
    bucket_id = 'project-finance'
    and public.has_management_role()
  );

drop policy if exists "Managers delete project finance storage" on storage.objects;
create policy "Managers delete project finance storage"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-finance'
    and public.has_management_role()
  );

-- Clients may read only payment-proof objects tied to a non-void payment on their assigned project.
-- Receipt objects are never matched by this policy (they live under receipts/ and only in project_receipts).
drop policy if exists "Clients read authorized payment proofs" on storage.objects;
create policy "Clients read authorized payment proofs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-finance'
    and exists (
      select 1
      from public.project_payments pp
      join public.profiles p on p.id = auth.uid()
      where pp.proof_storage_path = name
        and pp.status <> 'void'
        and p.role = 'client'
        and p.approval_status = 'approved'
        and p.is_active = true
        and p.archived_at is null
        and public.is_assigned_to_project(pp.project_id)
    )
  );

select 'Project financial tracking phase 1 installed' as status;
