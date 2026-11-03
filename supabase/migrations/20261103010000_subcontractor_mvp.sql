-- Subcontractor MVP: required documents + management review, Ready to Work, Work Orders,
-- Tamay shared resources, company profile (business address), payment/ACH kept to Admin + owner.
--
-- ADDITIVE ONLY: new tables, new nullable columns, new functions, new policies, one new private
-- bucket. No existing policy, function or row is changed, except run_certification_maintenance_job()
-- which also sends subcontractor document expiration alerts. Safe to re-run.
--
-- Document submissions are ordinary documents rows (requirement_key + review_status). Work Orders
-- are project_assignments rows (work_status). Rollback steps are at the end.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_user_is_subcontractor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'subcontractor' and approval_status = 'approved' and is_active and archived_at is null
  );
$$;

create or replace function public.is_management_profile_text(p_profile_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_profile_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.profiles target
      join public.profiles viewer on viewer.id = auth.uid()
      where target.id = p_profile_id::uuid
        and target.role in ('admin', 'project_manager')
        and target.organization_id = viewer.organization_id
    );
$$;

create or replace function public.storage_path_referenced(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.documents d where d.storage_path = p_name);
$$;

revoke all on function public.current_user_is_subcontractor() from public, anon;
revoke all on function public.is_management_profile_text(text) from public, anon;
revoke all on function public.storage_path_referenced(text) from public, anon;
grant execute on function public.current_user_is_subcontractor() to authenticated;
grant execute on function public.is_management_profile_text(text) to authenticated;
grant execute on function public.storage_path_referenced(text) to authenticated;

-- Requirement catalog. Keep in sync with src/lib/subcontractor-requirements.ts.
create or replace function public.subcontractor_requirement_catalog()
returns table (
  requirement_key text,
  label text,
  default_required boolean,
  needs_expiration boolean,
  expiration_optional boolean,
  counts_toward_ready boolean,
  document_category public.document_category,
  sort_order integer
)
language sql
immutable
set search_path = public
as $$
  values
    ('w9', 'W-9', true, false, false, true, 'identification'::public.document_category, 1),
    ('business_info', 'Business Information', true, false, false, true, 'company'::public.document_category, 2),
    ('subcontractor_agreement', 'Subcontractor Agreement', true, false, false, true, 'contract'::public.document_category, 3),
    ('general_liability', 'General Liability Insurance', true, true, false, true, 'insurance'::public.document_category, 4),
    ('workers_comp', 'Workers'' Compensation', true, true, false, true, 'insurance'::public.document_category, 5),
    ('trade_license', 'Trade License', false, true, false, true, 'license'::public.document_category, 6),
    ('osha_safety', 'OSHA / Safety Certification', false, false, true, true, 'certification'::public.document_category, 7),
    ('commercial_auto', 'Commercial Auto Insurance', false, true, false, true, 'insurance'::public.document_category, 8),
    ('payment_ach', 'Payment / ACH Information', false, false, false, false, 'identification'::public.document_category, 9),
    ('other', 'Other Required Document', false, false, true, true, 'miscellaneous'::public.document_category, 10)
$$;

grant execute on function public.subcontractor_requirement_catalog() to authenticated;

create or replace function public.trade_license_types()
returns text[]
language sql
immutable
as $$
  select array['Electrical', 'Plumbing', 'HVAC', 'Home Improvement Contractor (HIC)', 'General Contractor', 'Other'];
$$;

grant execute on function public.trade_license_types() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.subcontractor_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  requirement_key text not null,
  custom_label text,
  required boolean not null default true,
  needs_expiration boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint subcontractor_requirements_key check (requirement_key in (
    'w9', 'business_info', 'subcontractor_agreement', 'general_liability', 'workers_comp',
    'trade_license', 'osha_safety', 'commercial_auto', 'payment_ach', 'other'
  )),
  constraint subcontractor_requirements_other_label check (
    requirement_key <> 'other' or nullif(btrim(coalesce(custom_label, '')), '') is not null
  ),
  constraint subcontractor_requirements_label_length check (char_length(coalesce(custom_label, '')) <= 120)
);

create unique index if not exists subcontractor_requirements_one_per_key
  on public.subcontractor_requirements (profile_id, requirement_key)
  where requirement_key <> 'other';
create index if not exists subcontractor_requirements_profile_idx
  on public.subcontractor_requirements (profile_id);

create table if not exists public.subcontractor_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  business_address text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint subcontractor_profiles_address_length check (char_length(coalesce(business_address, '')) <= 300)
);

alter table public.subcontractor_requirements enable row level security;
alter table public.subcontractor_profiles enable row level security;

grant select, insert, update, delete on public.subcontractor_requirements to authenticated;
grant select, insert, update on public.subcontractor_profiles to authenticated;

drop policy if exists "Subcontractor or management view requirements" on public.subcontractor_requirements;
create policy "Subcontractor or management view requirements"
  on public.subcontractor_requirements for select
  to authenticated
  using (
    public.is_approved_user()
    and (profile_id = auth.uid() or (public.has_management_role() and public.same_organization(organization_id)))
  );

drop policy if exists "Management manage requirements" on public.subcontractor_requirements;
create policy "Management manage requirements"
  on public.subcontractor_requirements for all
  to authenticated
  using (public.has_management_role() and public.same_organization(organization_id))
  with check (public.has_management_role() and public.same_organization(organization_id));

drop policy if exists "Subcontractor or management view company profile" on public.subcontractor_profiles;
create policy "Subcontractor or management view company profile"
  on public.subcontractor_profiles for select
  to authenticated
  using (
    public.is_approved_user()
    and (profile_id = auth.uid() or (public.has_management_role() and public.same_organization(organization_id)))
  );

drop policy if exists "Subcontractor or management edit company profile" on public.subcontractor_profiles;
create policy "Subcontractor or management edit company profile"
  on public.subcontractor_profiles for insert
  to authenticated
  with check (
    public.same_organization(organization_id)
    and ((profile_id = auth.uid() and public.current_user_is_subcontractor()) or public.has_management_role())
  );

drop policy if exists "Subcontractor or management update company profile" on public.subcontractor_profiles;
create policy "Subcontractor or management update company profile"
  on public.subcontractor_profiles for update
  to authenticated
  using (
    public.same_organization(organization_id)
    and ((profile_id = auth.uid() and public.current_user_is_subcontractor()) or public.has_management_role())
  )
  with check (
    public.same_organization(organization_id)
    and ((profile_id = auth.uid() and public.current_user_is_subcontractor()) or public.has_management_role())
  );

-- ---------------------------------------------------------------------------
-- 2. New columns (nullable / defaulted)
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists requirement_key text,
  add column if not exists requirement_id uuid references public.subcontractor_requirements (id) on delete set null,
  add column if not exists review_status text,
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists expires_on date,
  add column if not exists audience text;

alter table public.documents drop constraint if exists documents_review_status_check;
alter table public.documents add constraint documents_review_status_check
  check (review_status is null or review_status in ('submitted', 'approved', 'rejected'));
alter table public.documents drop constraint if exists documents_audience_check;
alter table public.documents add constraint documents_audience_check
  check (audience is null or audience = 'subcontractors');
alter table public.documents drop constraint if exists documents_review_note_length;
alter table public.documents add constraint documents_review_note_length
  check (char_length(coalesce(review_note, '')) <= 300);

create index if not exists documents_requirement_idx
  on public.documents (owner_id, requirement_key, created_at desc)
  where requirement_key is not null;
create index if not exists documents_audience_idx
  on public.documents (organization_id, created_at desc)
  where audience is not null;

alter table public.project_assignments
  add column if not exists work_status text not null default 'assigned',
  add column if not exists work_scope text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists completion_note text;

alter table public.project_assignments drop constraint if exists project_assignments_work_status_check;
alter table public.project_assignments add constraint project_assignments_work_status_check
  check (work_status in ('assigned', 'in_progress', 'completed'));
alter table public.project_assignments drop constraint if exists project_assignments_work_text_length;
alter table public.project_assignments add constraint project_assignments_work_text_length
  check (char_length(coalesce(work_scope, '')) <= 500 and char_length(coalesce(completion_note, '')) <= 1000);

-- Re-assigning someone to a project (the app upserts the same row) starts a fresh work order.
create or replace function public.reset_work_order_on_reassign()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_active and not coalesce(old.is_active, false) then
    new.work_status := 'assigned';
    new.started_at := null;
    new.completed_at := null;
    new.completion_note := null;
  end if;
  return new;
end;
$$;

revoke all on function public.reset_work_order_on_reassign() from public, anon, authenticated;

drop trigger if exists project_assignments_reset_work_order on public.project_assignments;
create trigger project_assignments_reset_work_order
  before update on public.project_assignments
  for each row execute function public.reset_work_order_on_reassign();

-- Requirement / review / audience fields are only set through the functions below or by management.
create or replace function public.enforce_subcontractor_document_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or coalesce(current_setting('tamay.subcontractor_documents', true), '') = 'on'
    or public.has_management_role() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.requirement_key is not null or new.requirement_id is not null or new.review_status is not null
      or new.review_note is not null or new.reviewed_by is not null or new.reviewed_at is not null
      or new.expires_on is not null or new.audience is not null then
      raise exception 'Submit required documents from the Documents & Compliance page' using errcode = '42501';
    end if;
  elsif new.requirement_key is distinct from old.requirement_key
    or new.requirement_id is distinct from old.requirement_id
    or new.review_status is distinct from old.review_status
    or new.review_note is distinct from old.review_note
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.expires_on is distinct from old.expires_on
    or new.audience is distinct from old.audience then
    raise exception 'Only management can review documents' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_subcontractor_document_fields() from public, anon, authenticated;

drop trigger if exists documents_enforce_subcontractor_fields on public.documents;
create trigger documents_enforce_subcontractor_fields
  before insert or update on public.documents
  for each row execute function public.enforce_subcontractor_document_fields();

-- ---------------------------------------------------------------------------
-- 3. Payment / ACH: Admin + owner only (additive restrictive policy + private bucket)
-- ---------------------------------------------------------------------------
drop policy if exists "Payment documents only for admin and owner" on public.documents;
create policy "Payment documents only for admin and owner"
  on public.documents
  as restrictive
  for all
  to authenticated
  using (requirement_key is distinct from 'payment_ach' or public.is_admin() or owner_id = auth.uid())
  with check (requirement_key is distinct from 'payment_ach' or public.is_admin() or owner_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('restricted-documents', 'restricted-documents', false)
on conflict (id) do nothing;

drop policy if exists "Subcontractors upload own payment documents" on storage.objects;
create policy "Subcontractors upload own payment documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'restricted-documents'
    and public.current_user_is_subcontractor()
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'payment'
  );

drop policy if exists "Owner or admin read payment documents" on storage.objects;
create policy "Owner or admin read payment documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'restricted-documents'
    and public.is_approved_user()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "Admin or owner (unsubmitted) delete payment documents" on storage.objects;
create policy "Admin or owner (unsubmitted) delete payment documents"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'restricted-documents'
    and public.is_approved_user()
    and (
      public.is_admin()
      or ((storage.foldername(name))[1] = auth.uid()::text and not public.storage_path_referenced(name))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Tamay shared resources for subcontractors (blank W-9, agreement, safety rules ...)
--    Management uploads to {own id}/shared-subcontractors/... and marks the row audience = 'subcontractors'.
-- ---------------------------------------------------------------------------
drop policy if exists "Subcontractors view Tamay shared resources" on public.documents;
create policy "Subcontractors view Tamay shared resources"
  on public.documents for select
  to authenticated
  using (
    audience = 'subcontractors'
    and project_id is null
    and public.is_approved_user()
    and public.same_organization(organization_id)
    and (public.current_user_is_subcontractor() or public.has_management_role())
  );

drop policy if exists "Subcontractors read Tamay shared resource files" on storage.objects;
create policy "Subcontractors read Tamay shared resource files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = 'shared-subcontractors'
    and public.is_approved_user()
    and (public.current_user_is_subcontractor() or public.has_management_role())
    and public.is_management_profile_text((storage.foldername(name))[1])
  );

-- ---------------------------------------------------------------------------
-- 5. Requirement status, readiness
-- ---------------------------------------------------------------------------
-- One row per requirement that applies to the subcontractor, with the latest submission's status.
-- Visible to the subcontractor themself and to management in their organization. Payment / ACH
-- appears only for the subcontractor and Admin.
create or replace function public.subcontractor_requirement_items(p_profile_id uuid)
returns table (
  requirement_key text,
  requirement_id uuid,
  label text,
  required boolean,
  needs_expiration boolean,
  expiration_optional boolean,
  counts_toward_ready boolean,
  sort_order integer,
  status text,
  document_id uuid,
  document_name text,
  kind_label text,
  submitted_at timestamptz,
  expires_on date,
  review_note text,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select p.id
    from public.profiles p
    where p.id = p_profile_id
      and p.role = 'subcontractor'
      and public.is_approved_user()
      and (p.id = auth.uid() or (public.has_management_role() and public.same_organization(p.organization_id)))
  ),
  reqs as (
    select c.requirement_key, null::uuid as requirement_id, c.label,
      coalesce(r.required, c.default_required) as required,
      c.needs_expiration, c.expiration_optional, c.counts_toward_ready, c.sort_order
    from target t
    cross join public.subcontractor_requirement_catalog() c
    left join public.subcontractor_requirements r
      on r.profile_id = t.id and r.requirement_key = c.requirement_key
    where c.requirement_key <> 'other'
      and (c.requirement_key <> 'payment_ach' or t.id = auth.uid() or public.is_admin())
    union all
    select 'other', r.id, r.custom_label, r.required, r.needs_expiration, not r.needs_expiration, true, 100
    from target t
    join public.subcontractor_requirements r on r.profile_id = t.id and r.requirement_key = 'other'
  ),
  docs as (
    select d.*
    from public.documents d
    join target t on d.owner_id = t.id
    where d.requirement_key is not null
  )
  select
    q.requirement_key, q.requirement_id, q.label, q.required, q.needs_expiration, q.expiration_optional,
    q.counts_toward_ready, q.sort_order,
    case
      when q.requirement_key = 'trade_license' and exists (
        select 1 from docs d
        where d.requirement_key = 'trade_license' and d.review_status = 'approved'
          and (d.expires_on is null or d.expires_on >= current_date)
      ) then 'approved'
      when latest.id is null then 'missing'
      when latest.review_status = 'rejected' then 'rejected'
      when latest.review_status = 'approved' and latest.expires_on is not null and latest.expires_on < current_date then 'expired'
      when latest.review_status = 'approved' then 'approved'
      else 'submitted'
    end,
    latest.id, latest.name, latest.kind_label, latest.created_at, latest.expires_on, latest.review_note, latest.reviewed_at
  from reqs q
  left join lateral (
    select d.*
    from docs d
    where d.requirement_key = q.requirement_key
      and (q.requirement_id is null or d.requirement_id = q.requirement_id)
    order by d.created_at desc
    limit 1
  ) latest on true
  order by q.sort_order, q.label;
$$;

-- setup_required: something required is missing. action_required: something required was rejected or
-- expired. pending_review: everything required is submitted, some not yet reviewed. ready: all approved.
create or replace function public.subcontractor_readiness(p_profile_ids uuid[])
returns table (
  profile_id uuid,
  status text,
  required_count integer,
  approved_count integer,
  missing_labels text[],
  attention_labels text[],
  pending_labels text[],
  payment_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ids.pid,
    case
      when count(*) filter (where i.required and i.counts_toward_ready and i.status in ('rejected', 'expired')) > 0 then 'action_required'
      when count(*) filter (where i.required and i.counts_toward_ready and i.status = 'missing') > 0 then 'setup_required'
      when count(*) filter (where i.required and i.counts_toward_ready and i.status = 'submitted') > 0 then 'pending_review'
      else 'ready'
    end,
    (count(*) filter (where i.required and i.counts_toward_ready))::integer,
    (count(*) filter (where i.required and i.counts_toward_ready and i.status = 'approved'))::integer,
    coalesce(array_agg(i.label order by i.sort_order) filter (where i.required and i.counts_toward_ready and i.status = 'missing'), '{}'),
    coalesce(array_agg(i.label order by i.sort_order) filter (where i.required and i.counts_toward_ready and i.status in ('rejected', 'expired')), '{}'),
    coalesce(array_agg(i.label order by i.sort_order) filter (where i.required and i.counts_toward_ready and i.status = 'submitted'), '{}'),
    max(i.status) filter (where i.requirement_key = 'payment_ach')
  from (select distinct unnest(coalesce(p_profile_ids, '{}'::uuid[])) as pid) ids
  cross join lateral public.subcontractor_requirement_items(ids.pid) i
  group by ids.pid;
$$;

revoke all on function public.subcontractor_requirement_items(uuid) from public, anon;
revoke all on function public.subcontractor_readiness(uuid[]) from public, anon;
grant execute on function public.subcontractor_requirement_items(uuid) to authenticated;
grant execute on function public.subcontractor_readiness(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Notifications helper
-- ---------------------------------------------------------------------------
create or replace function public.notify_subcontractor_management(
  p_organization_id uuid,
  p_admin_only boolean,
  p_title text,
  p_message text,
  p_link text,
  p_entity_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
  select p_organization_id, p.id, p_title, p_message, p_link, 'subcontractor', p_entity_id
  from public.profiles p
  where p.organization_id = p_organization_id
    and p.approval_status = 'approved'
    and p.is_active
    and p.archived_at is null
    and (p.role = 'admin' or (not p_admin_only and p.role = 'project_manager'));
$$;

revoke all on function public.notify_subcontractor_management(uuid, boolean, text, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Submit / review documents, requirement settings
-- ---------------------------------------------------------------------------
create or replace function public.submit_subcontractor_document(
  p_requirement_key text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text default null,
  p_file_size bigint default null,
  p_expires_on date default null,
  p_license_type text default null,
  p_requirement_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles%rowtype;
  v_cat record;
  v_req public.subcontractor_requirements%rowtype;
  v_label text;
  v_needs_expiration boolean;
  v_bucket text;
  v_prefix text;
  v_id uuid;
begin
  select * into v_me from public.profiles where id = v_uid;
  if v_uid is null or not public.current_user_is_subcontractor() then
    raise exception 'Only approved subcontractors can submit required documents' using errcode = '42501';
  end if;

  select * into v_cat from public.subcontractor_requirement_catalog() c where c.requirement_key = p_requirement_key;
  if not found then
    raise exception 'Unknown requirement' using errcode = '22023';
  end if;

  v_label := v_cat.label;
  v_needs_expiration := v_cat.needs_expiration;
  if p_requirement_key = 'other' then
    select * into v_req from public.subcontractor_requirements r
    where r.id = p_requirement_id and r.profile_id = v_uid and r.requirement_key = 'other';
    if not found then
      raise exception 'Unknown requirement' using errcode = '22023';
    end if;
    v_label := v_req.custom_label;
    v_needs_expiration := v_req.needs_expiration;
  elsif p_requirement_id is not null then
    raise exception 'Unknown requirement' using errcode = '22023';
  end if;

  if p_requirement_key = 'payment_ach' then
    v_bucket := 'restricted-documents';
    v_prefix := v_uid::text || '/payment/';
  else
    v_bucket := 'documents';
    v_prefix := v_uid::text || '/requirements/';
  end if;
  if p_storage_path is null or p_storage_path not like v_prefix || '%' or position('..' in p_storage_path) > 0 then
    raise exception 'The file must be uploaded to your own requirements folder' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = v_bucket and o.name = p_storage_path) then
    raise exception 'Upload the file first' using errcode = '22023';
  end if;

  if v_needs_expiration and p_expires_on is null then
    raise exception 'Enter the expiration date' using errcode = '22023';
  end if;
  if p_requirement_key = 'trade_license'
    and (p_license_type is null or not (btrim(p_license_type) = any (public.trade_license_types()))) then
    raise exception 'Choose the license type' using errcode = '22023';
  end if;

  perform set_config('tamay.subcontractor_documents', 'on', true);
  -- clock_timestamp(): the newest submission must sort last even when several are made in one transaction.
  insert into public.documents (
    organization_id, owner_id, uploaded_by, project_id, name, category, storage_path, mime_type, file_size,
    kind_label, requirement_key, requirement_id, review_status, expires_on, team_visible, created_at, updated_at
  ) values (
    v_me.organization_id, v_uid, v_uid, null,
    left(v_label || ' - ' || coalesce(nullif(btrim(p_file_name), ''), 'file'), 250),
    v_cat.document_category, p_storage_path, p_mime_type, p_file_size,
    case when p_requirement_key = 'trade_license' then btrim(p_license_type) else v_label end,
    p_requirement_key, case when p_requirement_key = 'other' then p_requirement_id end,
    'submitted', p_expires_on, false, clock_timestamp(), clock_timestamp()
  )
  returning id into v_id;
  perform set_config('tamay.subcontractor_documents', '', true);

  perform public.notify_subcontractor_management(
    v_me.organization_id,
    p_requirement_key = 'payment_ach',
    'Document submitted for review',
    coalesce(nullif(btrim(v_me.company_name), ''), btrim(v_me.first_name || ' ' || v_me.last_name)) || ' submitted ' || v_label || '.',
    '/subcontractors/' || v_uid::text,
    v_id
  );

  return v_id;
end;
$$;

create or replace function public.review_subcontractor_document(
  p_document_id uuid,
  p_approve boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
  v_label text;
  v_status text := case when p_approve then 'approved' else 'rejected' end;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  select * into v_doc from public.documents where id = p_document_id for update;
  if not found or v_doc.requirement_key is null
    or not public.has_management_role() or not public.same_organization(v_doc.organization_id) then
    raise exception 'Document not found' using errcode = '42501';
  end if;
  if v_doc.requirement_key = 'payment_ach' and not public.is_admin() then
    raise exception 'Only Admin can review payment information' using errcode = '42501';
  end if;

  update public.documents
  set review_status = v_status, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
  where id = v_doc.id;

  v_label := coalesce(
    (select r.custom_label from public.subcontractor_requirements r where r.id = v_doc.requirement_id),
    (select c.label from public.subcontractor_requirement_catalog() c where c.requirement_key = v_doc.requirement_key)
  );

  insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
  values (
    v_doc.organization_id,
    v_doc.owner_id,
    case when p_approve then 'Document approved' else 'Document needs replacement' end,
    case
      when p_approve then v_label || ' was approved.'
      else v_label || ' was not approved.' || coalesce(' Reason: ' || v_note, '') || ' Please upload a replacement.'
    end,
    '/setup',
    'subcontractor_document',
    v_doc.id
  );

  return v_status;
end;
$$;

create or replace function public.set_subcontractor_requirement(
  p_profile_id uuid,
  p_requirement_key text,
  p_required boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.profiles where id = p_profile_id and role = 'subcontractor';
  if v_org is null or not public.has_management_role() or not public.same_organization(v_org) then
    raise exception 'Subcontractor not found' using errcode = '42501';
  end if;
  if p_requirement_key = 'other'
    or not exists (select 1 from public.subcontractor_requirement_catalog() c where c.requirement_key = p_requirement_key) then
    raise exception 'Unknown requirement' using errcode = '22023';
  end if;

  insert into public.subcontractor_requirements (organization_id, profile_id, requirement_key, required, created_by, updated_by)
  values (v_org, p_profile_id, p_requirement_key, coalesce(p_required, false), auth.uid(), auth.uid())
  on conflict (profile_id, requirement_key) where requirement_key <> 'other'
  do update set required = excluded.required, updated_by = auth.uid(), updated_at = now();
end;
$$;

create or replace function public.add_subcontractor_custom_requirement(
  p_profile_id uuid,
  p_label text,
  p_required boolean default true,
  p_needs_expiration boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select organization_id into v_org from public.profiles where id = p_profile_id and role = 'subcontractor';
  if v_org is null or not public.has_management_role() or not public.same_organization(v_org) then
    raise exception 'Subcontractor not found' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_label, '')), '') is null then
    raise exception 'Enter the document name' using errcode = '22023';
  end if;

  insert into public.subcontractor_requirements (
    organization_id, profile_id, requirement_key, custom_label, required, needs_expiration, created_by, updated_by
  ) values (
    v_org, p_profile_id, 'other', left(btrim(p_label), 120), coalesce(p_required, true),
    coalesce(p_needs_expiration, false), auth.uid(), auth.uid()
  )
  returning id into v_id;

  insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
  values (v_org, p_profile_id, 'New document requested', 'Tamay requested: ' || left(btrim(p_label), 120) || '.',
    '/setup', 'subcontractor_requirement', v_id);

  return v_id;
end;
$$;

revoke all on function public.submit_subcontractor_document(text, text, text, text, bigint, date, text, uuid) from public, anon;
revoke all on function public.review_subcontractor_document(uuid, boolean, text) from public, anon;
revoke all on function public.set_subcontractor_requirement(uuid, text, boolean) from public, anon;
revoke all on function public.add_subcontractor_custom_requirement(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.submit_subcontractor_document(text, text, text, text, bigint, date, text, uuid) to authenticated;
grant execute on function public.review_subcontractor_document(uuid, boolean, text) to authenticated;
grant execute on function public.set_subcontractor_requirement(uuid, text, boolean) to authenticated;
grant execute on function public.add_subcontractor_custom_requirement(uuid, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Work orders (project_assignments.work_status)
-- ---------------------------------------------------------------------------
create or replace function public.update_my_work_order(
  p_assignment_id uuid,
  p_action text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.project_assignments%rowtype;
  v_me public.profiles%rowtype;
  v_project public.projects%rowtype;
  v_ready text;
begin
  select * into v_me from public.profiles where id = auth.uid();
  select * into v_row from public.project_assignments where id = p_assignment_id for update;
  if not found or v_row.profile_id is distinct from auth.uid() or not v_row.is_active
    or not public.current_user_is_subcontractor() then
    raise exception 'Work order not found' using errcode = '42501';
  end if;
  select * into v_project from public.projects where id = v_row.project_id;

  if p_action = 'start' then
    if v_row.work_status <> 'assigned' then
      raise exception 'This work order was already started' using errcode = '22023';
    end if;
    select r.status into v_ready from public.subcontractor_readiness(array[auth.uid()]) r;
    if v_ready is distinct from 'ready' then
      raise exception 'Complete your setup before starting work' using errcode = '42501';
    end if;
    update public.project_assignments set work_status = 'in_progress', started_at = now() where id = v_row.id;
    return 'in_progress';
  elsif p_action = 'complete' then
    if v_row.work_status <> 'in_progress' then
      raise exception 'Start the work order before completing it' using errcode = '22023';
    end if;
    update public.project_assignments
    set work_status = 'completed', completed_at = now(),
        completion_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '')
    where id = v_row.id;
    perform public.notify_subcontractor_management(
      v_project.organization_id,
      false,
      'Work order completed',
      coalesce(nullif(btrim(v_me.company_name), ''), btrim(v_me.first_name || ' ' || v_me.last_name))
        || ' marked ' || coalesce(v_project.name, 'a project') || ' completed.',
      '/projects/' || v_row.project_id::text,
      v_row.id
    );
    return 'completed';
  end if;

  raise exception 'Unknown action' using errcode = '22023';
end;
$$;

revoke all on function public.update_my_work_order(uuid, text, text) from public, anon;
grant execute on function public.update_my_work_order(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Expiration alerts (daily, via the existing certification job)
-- ---------------------------------------------------------------------------
create or replace function public.notify_subcontractor_document_expirations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_doc record;
  v_kind text;
begin
  for v_doc in
    select d.*, p.first_name, p.last_name, p.company_name
    from public.documents d
    join public.profiles p on p.id = d.owner_id
    where d.requirement_key is not null
      and d.review_status = 'approved'
      and d.expires_on is not null
      and d.expires_on <= current_date + 30
      and p.role = 'subcontractor' and p.approval_status = 'approved' and p.is_active and p.archived_at is null
      -- only the newest submission for that requirement
      and not exists (
        select 1 from public.documents n
        where n.owner_id = d.owner_id and n.requirement_key = d.requirement_key
          and n.requirement_id is not distinct from d.requirement_id
          and n.created_at > d.created_at
      )
  loop
    v_kind := case when v_doc.expires_on < current_date then 'expired' else 'expiring' end;
    if not exists (
      select 1 from public.notifications n
      where n.entity_type = 'subcontractor_document_' || v_kind and n.entity_id = v_doc.id
    ) then
      insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
      values (
        v_doc.organization_id, v_doc.owner_id,
        case when v_kind = 'expired' then 'Document expired' else 'Document expiring soon' end,
        case
          when v_kind = 'expired' then split_part(v_doc.name, ' - ', 1) || ' expired. Upload a current copy.'
          else split_part(v_doc.name, ' - ', 1) || ' expires on ' || to_char(v_doc.expires_on, 'Mon DD, YYYY') || '. Upload a renewal.'
        end,
        '/setup', 'subcontractor_document_' || v_kind, v_doc.id
      );
      if v_kind = 'expired' then
        perform public.notify_subcontractor_management(
          v_doc.organization_id, v_doc.requirement_key = 'payment_ach', 'Subcontractor document expired',
          coalesce(nullif(btrim(v_doc.company_name), ''), btrim(v_doc.first_name || ' ' || v_doc.last_name))
            || ': ' || split_part(v_doc.name, ' - ', 1) || ' expired.',
          '/subcontractors/' || v_doc.owner_id::text, v_doc.id
        );
      end if;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.notify_subcontractor_document_expirations() from public, anon, authenticated;

create or replace function public.run_certification_maintenance_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  refreshed integer;
  notified integer;
  subcontractor_alerts integer := 0;
begin
  refreshed := public.refresh_all_certification_statuses();
  notified := public.notify_certification_alerts();
  begin
    subcontractor_alerts := public.notify_subcontractor_document_expirations();
  exception when others then
    raise warning 'Subcontractor document alerts failed: %', sqlerrm;
  end;
  return jsonb_build_object(
    'refreshed', refreshed,
    'notified', notified,
    'subcontractor_alerts', subcontractor_alerts,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.run_certification_maintenance_job() from public, anon, authenticated;

notify pgrst, 'reload schema';

select 'subcontractor mvp installed' as status;

-- Manual rollback (run only after the app is rolled back):
--   restore run_certification_maintenance_job() from 20260327000004 (without the subcontractor call);
--   drop function public.notify_subcontractor_document_expirations(), update_my_work_order(uuid, text, text),
--     add_subcontractor_custom_requirement(uuid, text, boolean, boolean), set_subcontractor_requirement(uuid, text, boolean),
--     review_subcontractor_document(uuid, boolean, text), submit_subcontractor_document(text, text, text, text, bigint, date, text, uuid),
--     notify_subcontractor_management(uuid, boolean, text, text, text, uuid), subcontractor_readiness(uuid[]),
--     subcontractor_requirement_items(uuid);
--   drop policy "Subcontractors read Tamay shared resource files", "Subcontractors upload own payment documents",
--     "Owner or admin read payment documents", "Admin or owner (unsubmitted) delete payment documents" on storage.objects;
--   drop policy "Subcontractors view Tamay shared resources", "Payment documents only for admin and owner" on public.documents;
--   drop trigger documents_enforce_subcontractor_fields on public.documents; drop function enforce_subcontractor_document_fields();
--   drop trigger project_assignments_reset_work_order on public.project_assignments; drop function reset_work_order_on_reassign();
--   keep the restricted-documents bucket and the new columns until their files / data are reviewed (dropping them deletes data).
