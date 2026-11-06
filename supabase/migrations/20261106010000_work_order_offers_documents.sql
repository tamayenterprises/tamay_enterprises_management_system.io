-- Work Orders: offers, formal acceptance, documents and insurance.
--
-- * Tamay can offer one work order to several subcontractors. The first to accept gets it; the
--   other offers close. Subcontractors can decline (optional reason).
-- * Accepting is formal: the subcontractor confirms an agreement statement; who / when / what is stored.
-- * Tamay documents have a type (Contract, Proposal, Plans, Photo, Other). Subcontractors upload their
--   own documents to the work order (Insurance certificate, Permit, Receipt / Invoice, Other).
-- * A work order can require an insurance certificate naming a Certificate Holder (usually the client).
--   Start Work stays locked until Tamay approves that certificate.
--
-- ADDITIVE: new columns, one new table, replaced work order functions and policies. Existing work
-- orders keep working (status 'assigned' still accepts / declines). Safe to re-run. Rollback notes at the end.

-- ---------------------------------------------------------------------------
-- 1. Columns and constraints
-- ---------------------------------------------------------------------------
alter table public.work_orders alter column subcontractor_id drop not null;

alter table public.work_orders
  add column if not exists insurance_required boolean not null default false,
  add column if not exists certificate_holder text,
  add column if not exists accepted_by uuid references public.profiles (id) on delete set null,
  add column if not exists acceptance_statement text;

alter table public.work_orders drop constraint if exists work_orders_status_check;
alter table public.work_orders add constraint work_orders_status_check
  check (status in ('offered', 'assigned', 'accepted', 'in_progress', 'work_completed', 'closed'));

-- Offered = nobody has it yet. Every other open status has a subcontractor.
alter table public.work_orders drop constraint if exists work_orders_subcontractor_check;
alter table public.work_orders add constraint work_orders_subcontractor_check
  check ((status = 'offered' and subcontractor_id is null) or (status <> 'offered' and (subcontractor_id is not null or status = 'closed')));

alter table public.work_orders drop constraint if exists work_orders_certificate_holder_check;
alter table public.work_orders add constraint work_orders_certificate_holder_check
  check (
    char_length(coalesce(certificate_holder, '')) <= 500
    and (not insurance_required or char_length(btrim(coalesce(certificate_holder, ''))) > 0)
  );

alter table public.work_order_files
  add column if not exists category text,
  add column if not exists review_status text,
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.work_order_files drop constraint if exists work_order_files_kind_check;
alter table public.work_order_files add constraint work_order_files_kind_check
  check (kind in ('reference', 'update_photo', 'subcontractor_document'));
alter table public.work_order_files drop constraint if exists work_order_files_category_check;
alter table public.work_order_files add constraint work_order_files_category_check
  check (category is null or category in ('contract', 'proposal', 'plans', 'photo', 'insurance', 'permit', 'receipt', 'other'));
alter table public.work_order_files drop constraint if exists work_order_files_review_check;
alter table public.work_order_files add constraint work_order_files_review_check
  check (
    (review_status is null or review_status in ('submitted', 'approved', 'rejected'))
    and char_length(coalesce(review_note, '')) <= 500
  );

-- ---------------------------------------------------------------------------
-- 2. Offers
-- ---------------------------------------------------------------------------
create table if not exists public.work_order_offers (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subcontractor_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  decline_reason text,
  responded_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint work_order_offers_status_check check (status in ('pending', 'accepted', 'declined', 'closed')),
  constraint work_order_offers_reason_length check (char_length(coalesce(decline_reason, '')) <= 500),
  constraint work_order_offers_unique unique (work_order_id, subcontractor_id)
);

create index if not exists work_order_offers_subcontractor_idx on public.work_order_offers (subcontractor_id, status);

alter table public.work_order_offers enable row level security;
revoke all on public.work_order_offers from anon, authenticated;
grant select on public.work_order_offers to authenticated;

drop policy if exists "Management or offered subcontractor view work order offers" on public.work_order_offers;
create policy "Management or offered subcontractor view work order offers"
  on public.work_order_offers for select
  to authenticated
  using (
    public.is_approved_user()
    and (
      (public.has_management_role() and public.same_organization(organization_id))
      or subcontractor_id = auth.uid()
    )
  );

-- A subcontractor with a pending offer can read the work order, its project name / address and
-- Tamay's documents so they can decide. Updates and subcontractor documents stay with the assignee.
create or replace function public.has_open_work_order_offer(p_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_user() and exists (
    select 1
    from public.work_order_offers o
    join public.work_orders w on w.id = o.work_order_id
    where o.work_order_id = p_work_order_id
      and o.subcontractor_id = auth.uid()
      and o.status = 'pending'
      and w.status = 'offered'
  );
$$;

revoke all on function public.has_open_work_order_offer(uuid) from public, anon;
grant execute on function public.has_open_work_order_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Visibility (replaces the select policies from 20261105010000)
-- ---------------------------------------------------------------------------
drop policy if exists "Management or assigned subcontractor view work orders" on public.work_orders;
create policy "Management or assigned subcontractor view work orders"
  on public.work_orders for select
  to authenticated
  using (
    public.is_approved_user()
    and (
      (public.has_management_role() and public.same_organization(organization_id))
      or subcontractor_id = auth.uid()
      or public.has_open_work_order_offer(id)
    )
  );

drop policy if exists "Management or assigned subcontractor view work order files" on public.work_order_files;
create policy "Management or assigned subcontractor view work order files"
  on public.work_order_files for select
  to authenticated
  using (
    public.can_access_work_order(work_order_id)
    or (kind = 'reference' and public.has_open_work_order_offer(work_order_id))
  );

drop policy if exists "Management add work order reference files" on public.work_order_files;
create policy "Management add work order reference files"
  on public.work_order_files for insert
  to authenticated
  with check (
    kind = 'reference'
    and uploaded_by = auth.uid()
    and public.can_manage_work_order(work_order_id)
    and storage_path like work_order_id::text || '/reference/%'
    and (category is null or category in ('contract', 'proposal', 'plans', 'photo', 'other'))
    and review_status is null
  );

drop policy if exists "Work order files readable by management or assigned subcontractor" on storage.objects;
create policy "Work order files readable by management or assigned subcontractor"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'work-order-files'
    and (
      public.can_access_work_order(public.work_order_folder_id(name))
      or ((storage.foldername(name))[2] = 'reference' and public.has_open_work_order_offer(public.work_order_folder_id(name)))
    )
  );

drop policy if exists "Work order files uploaded by management or assigned subcontractor" on storage.objects;
create policy "Work order files uploaded by management or assigned subcontractor"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'work-order-files'
    and (
      ((storage.foldername(name))[2] = 'reference' and public.can_manage_work_order(public.work_order_folder_id(name)))
      or ((storage.foldername(name))[2] in ('updates', 'subcontractor') and public.can_access_work_order(public.work_order_folder_id(name)))
    )
  );

create or replace function public.work_order_project_summaries(p_work_order_ids uuid[])
returns table (work_order_id uuid, project_id uuid, project_name text, job_address text)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, p.id, p.name, coalesce(nullif(btrim(p.job_site_address), ''), nullif(btrim(p.location), ''))
  from public.work_orders w
  join public.projects p on p.id = w.project_id
  where w.id = any (coalesce(p_work_order_ids, '{}'::uuid[]))
    and (public.can_access_work_order(w.id) or public.has_open_work_order_offer(w.id));
$$;

-- ---------------------------------------------------------------------------
-- 4. Triggers: the subcontractor is set only by accepting (never by editing)
-- ---------------------------------------------------------------------------
create or replace function public.prepare_work_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
begin
  select * into v_project from public.projects where id = new.project_id;
  if not found then
    raise exception 'Project not found' using errcode = '22023';
  end if;
  new.organization_id := v_project.organization_id;
  new.title := btrim(new.title);
  new.certificate_holder := nullif(btrim(coalesce(new.certificate_holder, '')), '');
  if tg_op = 'UPDATE' and new.subcontractor_id is distinct from old.subcontractor_id
    and coalesce(current_setting('tamay.work_order_assigning', true), '') <> 'on' then
    raise exception 'To change the subcontractor, close this work order and create a new one' using errcode = '22023';
  end if;
  if new.subcontractor_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.subcontractor_id and p.role = 'subcontractor' and p.organization_id = v_project.organization_id
  ) then
    raise exception 'Choose a subcontractor from this organization' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

-- Direct assignment on create (older flow) still notifies; offers notify from send_work_order_offers.
drop trigger if exists work_orders_notify_assigned on public.work_orders;
create trigger work_orders_notify_assigned
  after insert on public.work_orders
  for each row
  when (new.subcontractor_id is not null)
  execute function public.notify_work_order_assigned();

-- ---------------------------------------------------------------------------
-- 5. Offers: send, accept (formal) or decline
-- ---------------------------------------------------------------------------
create or replace function public.send_work_order_offers(p_work_order_id uuid, p_subcontractor_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.work_orders%rowtype;
  v_project_name text;
  v_sub uuid;
  v_existing text;
  v_sent integer := 0;
begin
  select * into v_row from public.work_orders where id = p_work_order_id for update;
  if not found or not public.can_manage_work_order(p_work_order_id) then
    raise exception 'Only management can offer this work order' using errcode = '42501';
  end if;
  if v_row.status <> 'offered' then
    raise exception 'This work order already has a subcontractor' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_subcontractor_ids), 0) = 0 or cardinality(p_subcontractor_ids) > 20 then
    raise exception 'Choose 1 to 20 subcontractors' using errcode = '22023';
  end if;
  select name into v_project_name from public.projects where id = v_row.project_id;

  for v_sub in select distinct unnest(p_subcontractor_ids) loop
    if not exists (
      select 1 from public.profiles p
      where p.id = v_sub and p.role = 'subcontractor' and p.organization_id = v_row.organization_id
        and p.approval_status = 'approved' and p.is_active and p.archived_at is null
    ) then
      raise exception 'Choose active subcontractors from this organization' using errcode = '22023';
    end if;
    select status into v_existing from public.work_order_offers where work_order_id = v_row.id and subcontractor_id = v_sub;
    if v_existing = 'pending' then
      continue;
    end if;
    insert into public.work_order_offers (work_order_id, organization_id, subcontractor_id, status, created_by)
    values (v_row.id, v_row.organization_id, v_sub, 'pending', auth.uid())
    on conflict (work_order_id, subcontractor_id)
      do update set status = 'pending', decline_reason = null, responded_at = null, created_by = auth.uid(), created_at = now();
    insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
    values (
      v_row.organization_id, v_sub, 'New Work Order offer',
      'WO-' || v_row.work_order_number || ' · ' || v_row.title || ' at ' || coalesce(v_project_name, 'a Tamay project')
        || '. Review it and accept or decline.',
      '/work-orders/' || v_row.id, 'work_order', v_row.id
    );
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

create or replace function public.respond_to_work_order(
  p_work_order_id uuid,
  p_accept boolean,
  p_agree boolean default false,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c_statement constant text :=
    'I have read and agree to the scope of work, agreed price, dates, important job requirements, warranty responsibility and the attached contract documents for this work order.';
  v_row public.work_orders%rowtype;
  v_me public.profiles%rowtype;
  v_offer public.work_order_offers%rowtype;
  v_name text;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_pending integer;
begin
  select * into v_row from public.work_orders where id = p_work_order_id for update;
  if not found then
    raise exception 'Work order not found' using errcode = '42501';
  end if;
  select * into v_me from public.profiles where id = auth.uid();
  if not public.is_approved_user() or v_me.role is distinct from 'subcontractor' then
    raise exception 'Only the subcontractor can respond to this work order' using errcode = '42501';
  end if;
  select * into v_offer from public.work_order_offers where work_order_id = v_row.id and subcontractor_id = auth.uid();
  if v_row.status = 'offered' then
    if v_offer.id is null or v_offer.status <> 'pending' then
      raise exception 'This work order is no longer available' using errcode = '22023';
    end if;
  elsif not (v_row.status = 'assigned' and v_row.subcontractor_id = auth.uid()) then
    raise exception 'This work order is no longer available' using errcode = '22023';
  end if;
  v_name := coalesce(nullif(btrim(v_me.company_name), ''), btrim(coalesce(v_me.first_name, '') || ' ' || coalesce(v_me.last_name, '')));

  if p_accept then
    if not coalesce(p_agree, false) then
      raise exception 'Confirm that you agree to the work order before accepting' using errcode = '22023';
    end if;
    perform set_config('tamay.work_order_assigning', 'on', true);
    update public.work_orders
      set subcontractor_id = auth.uid(), status = 'accepted', accepted_at = now(), accepted_by = auth.uid(),
          acceptance_statement = c_statement
      where id = v_row.id;
    perform set_config('tamay.work_order_assigning', 'off', true);
    if v_offer.id is not null then
      update public.work_order_offers set status = 'accepted', responded_at = now() where id = v_offer.id;
    end if;
    insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
    select v_row.organization_id, o.subcontractor_id, 'Work order no longer available',
      'WO-' || v_row.work_order_number || ' · ' || v_row.title || ' was accepted by another subcontractor.',
      '/work-orders', 'work_order', v_row.id
    from public.work_order_offers o
    where o.work_order_id = v_row.id and o.status = 'pending' and o.subcontractor_id <> auth.uid();
    update public.work_order_offers set status = 'closed', responded_at = now()
      where work_order_id = v_row.id and status = 'pending';
    insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
    select v_row.organization_id, p.id, 'Work order accepted',
      v_name || ' accepted WO-' || v_row.work_order_number || ' · ' || v_row.title || '.',
      '/work-orders/' || v_row.id, 'work_order', v_row.id
    from public.profiles p
    where p.organization_id = v_row.organization_id and p.role in ('admin', 'project_manager')
      and p.approval_status = 'approved' and p.is_active and p.archived_at is null;
    return 'accepted';
  end if;

  if v_offer.id is not null then
    update public.work_order_offers set status = 'declined', decline_reason = v_reason, responded_at = now() where id = v_offer.id;
  else
    insert into public.work_order_offers (work_order_id, organization_id, subcontractor_id, status, decline_reason, responded_at)
    values (v_row.id, v_row.organization_id, auth.uid(), 'declined', v_reason, now());
  end if;
  if v_row.status = 'assigned' then
    perform set_config('tamay.work_order_assigning', 'on', true);
    update public.work_orders set subcontractor_id = null, status = 'offered' where id = v_row.id;
    perform set_config('tamay.work_order_assigning', 'off', true);
  end if;
  select count(*) into v_pending from public.work_order_offers where work_order_id = v_row.id and status = 'pending';
  insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
  select v_row.organization_id, p.id, 'Work order declined',
    v_name || ' declined WO-' || v_row.work_order_number || ' · ' || v_row.title
      || coalesce(' — "' || v_reason || '"', '') || '.'
      || case when v_pending = 0 then ' No offers are pending; send it to another subcontractor.' else '' end,
    '/work-orders/' || v_row.id, 'work_order', v_row.id
  from public.profiles p
  where p.organization_id = v_row.organization_id and p.role in ('admin', 'project_manager')
    and p.approval_status = 'approved' and p.is_active and p.archived_at is null;
  return 'declined';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Status changes (replaces 20261105010000). Accepting moved to respond_to_work_order.
--    Start Work needs Ready to Work and, when required, an approved insurance certificate.
-- ---------------------------------------------------------------------------
create or replace function public.update_work_order_status(p_work_order_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.work_orders%rowtype;
  v_me public.profiles%rowtype;
  v_next text;
  v_ready text;
  v_name text;
begin
  select * into v_row from public.work_orders where id = p_work_order_id for update;
  if not found or not public.can_access_work_order(p_work_order_id) then
    raise exception 'Work order not found' using errcode = '42501';
  end if;
  select * into v_me from public.profiles where id = auth.uid();

  if p_action = 'close' then
    if not public.can_manage_work_order(p_work_order_id) then
      raise exception 'Only management can close a work order' using errcode = '42501';
    end if;
    if v_row.status = 'closed' then
      raise exception 'This work order is already closed' using errcode = '22023';
    end if;
    update public.work_orders set status = 'closed', closed_at = now() where id = v_row.id;
    update public.work_order_offers set status = 'closed', responded_at = now()
      where work_order_id = v_row.id and status = 'pending';
    if v_row.subcontractor_id is not null then
      insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
      values (v_row.organization_id, v_row.subcontractor_id, 'Work Order closed',
        'WO-' || v_row.work_order_number || ' · ' || v_row.title || ' was closed by Tamay.',
        '/work-orders/' || v_row.id, 'work_order', v_row.id);
    end if;
    return 'closed';
  end if;

  if v_row.subcontractor_id is distinct from auth.uid() then
    raise exception 'Only the assigned subcontractor can update this work order' using errcode = '42501';
  end if;

  if p_action = 'start' and v_row.status = 'accepted' then
    if to_regprocedure('public.subcontractor_readiness(uuid[])') is not null then
      select r.status into v_ready from public.subcontractor_readiness(array[auth.uid()]) r;
      if v_ready is distinct from 'ready' then
        raise exception 'Complete your setup before starting work' using errcode = '42501';
      end if;
    end if;
    if v_row.insurance_required and not exists (
      select 1 from public.work_order_files f
      where f.work_order_id = v_row.id and f.kind = 'subcontractor_document' and f.category = 'insurance'
        and f.review_status = 'approved'
    ) then
      raise exception 'Tamay must approve your insurance certificate for this work order before you start' using errcode = '42501';
    end if;
    v_next := 'in_progress';
    update public.work_orders set status = v_next, started_at = now() where id = v_row.id;
  elsif p_action = 'complete' and v_row.status = 'in_progress' then
    v_next := 'work_completed';
    update public.work_orders set status = v_next, completed_at = now() where id = v_row.id;
    v_name := coalesce(nullif(btrim(v_me.company_name), ''), btrim(v_me.first_name || ' ' || v_me.last_name));
    insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
    select v_row.organization_id, p.id, 'Work order completed',
      v_name || ' marked WO-' || v_row.work_order_number || ' · ' || v_row.title || ' completed.',
      '/work-orders/' || v_row.id, 'work_order', v_row.id
    from public.profiles p
    where p.organization_id = v_row.organization_id and p.role in ('admin', 'project_manager')
      and p.approval_status = 'approved' and p.is_active and p.archived_at is null;
  else
    raise exception 'This action is not available for a % work order', replace(v_row.status, '_', ' ') using errcode = '22023';
  end if;
  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Subcontractor documents (insurance, permits, receipts) and insurance review
-- ---------------------------------------------------------------------------
create or replace function public.submit_work_order_document(
  p_work_order_id uuid,
  p_category text,
  p_path text,
  p_name text,
  p_mime_type text default null,
  p_file_size bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.work_orders%rowtype;
  v_me public.profiles%rowtype;
  v_id uuid;
  v_name text;
  v_label text;
begin
  select * into v_row from public.work_orders where id = p_work_order_id;
  if not found or v_row.subcontractor_id is distinct from auth.uid() or not public.is_approved_user() then
    raise exception 'Only the assigned subcontractor can add documents to this work order' using errcode = '42501';
  end if;
  if v_row.status = 'closed' then
    raise exception 'This work order is closed' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('insurance', 'permit', 'receipt', 'other') then
    raise exception 'Choose a document type' using errcode = '22023';
  end if;
  if p_path is null or p_path not like v_row.id::text || '/subcontractor/%' or position('..' in p_path) > 0
    or not exists (select 1 from storage.objects o where o.bucket_id = 'work-order-files' and o.name = p_path) then
    raise exception 'Upload the file before saving it' using errcode = '22023';
  end if;

  insert into public.work_order_files (
    work_order_id, organization_id, uploaded_by, kind, category, name, storage_path, mime_type, file_size, review_status
  )
  values (
    v_row.id, v_row.organization_id, auth.uid(), 'subcontractor_document', p_category,
    left(coalesce(nullif(btrim(p_name), ''), 'document'), 200), p_path, p_mime_type, p_file_size,
    case when p_category = 'insurance' then 'submitted' end
  )
  returning id into v_id;

  select * into v_me from public.profiles where id = auth.uid();
  v_name := coalesce(nullif(btrim(v_me.company_name), ''), btrim(coalesce(v_me.first_name, '') || ' ' || coalesce(v_me.last_name, '')));
  v_label := case p_category
    when 'insurance' then 'an insurance certificate (review needed)'
    when 'permit' then 'a permit'
    when 'receipt' then 'a receipt / invoice'
    else 'a document' end;
  insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
  select v_row.organization_id, p.id,
    case when p_category = 'insurance' then 'Insurance certificate to review' else 'Work order document added' end,
    v_name || ' added ' || v_label || ' to WO-' || v_row.work_order_number || ' · ' || v_row.title || '.',
    '/work-orders/' || v_row.id, 'work_order', v_row.id
  from public.profiles p
  where p.organization_id = v_row.organization_id and p.role in ('admin', 'project_manager')
    and p.approval_status = 'approved' and p.is_active and p.archived_at is null;
  return v_id;
end;
$$;

create or replace function public.review_work_order_document(p_file_id uuid, p_approve boolean, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.work_order_files%rowtype;
  v_row public.work_orders%rowtype;
  v_status text := case when p_approve then 'approved' else 'rejected' end;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  select * into v_file from public.work_order_files where id = p_file_id for update;
  if not found or not public.can_manage_work_order(v_file.work_order_id) then
    raise exception 'Only management can review work order documents' using errcode = '42501';
  end if;
  if v_file.kind <> 'subcontractor_document' or v_file.category is distinct from 'insurance' then
    raise exception 'Only insurance certificates are reviewed' using errcode = '22023';
  end if;
  update public.work_order_files
    set review_status = v_status, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
    where id = v_file.id;
  select * into v_row from public.work_orders where id = v_file.work_order_id;
  if v_file.uploaded_by is not null then
    insert into public.notifications (organization_id, recipient_id, title, message, link, entity_type, entity_id)
    values (
      v_row.organization_id, v_file.uploaded_by,
      case when p_approve then 'Insurance certificate approved' else 'Insurance certificate rejected' end,
      'WO-' || v_row.work_order_number || ' · ' || v_row.title || ': '
        || case when p_approve then 'your insurance certificate was approved.' else 'please upload a new insurance certificate.' end
        || coalesce(' ' || v_note, ''),
      '/work-orders/' || v_row.id, 'work_order', v_row.id
    );
  end if;
  return v_status;
end;
$$;

revoke all on function public.send_work_order_offers(uuid, uuid[]) from public, anon;
revoke all on function public.respond_to_work_order(uuid, boolean, boolean, text) from public, anon;
revoke all on function public.update_work_order_status(uuid, text) from public, anon;
revoke all on function public.submit_work_order_document(uuid, text, text, text, text, bigint) from public, anon;
revoke all on function public.review_work_order_document(uuid, boolean, text) from public, anon;
grant execute on function public.send_work_order_offers(uuid, uuid[]) to authenticated;
grant execute on function public.respond_to_work_order(uuid, boolean, boolean, text) to authenticated;
grant execute on function public.update_work_order_status(uuid, text) to authenticated;
grant execute on function public.submit_work_order_document(uuid, text, text, text, text, bigint) to authenticated;
grant execute on function public.review_work_order_document(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';

select 'work order offers and documents installed' as status;

-- Manual rollback (only after the app is rolled back):
--   drop function public.send_work_order_offers(uuid, uuid[]);
--   drop function public.respond_to_work_order(uuid, boolean, boolean, text);
--   drop function public.submit_work_order_document(uuid, text, text, text, text, bigint);
--   drop function public.review_work_order_document(uuid, boolean, text);
--   then re-run 20261105010000_work_orders.sql to restore its functions and policies
--   (offered work orders must be closed or given a subcontractor first). Keep the new table and columns.
