-- Project payment links and receivables.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  recipient_id uuid not null references public.profiles (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  payer_email text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency = lower(currency) and length(currency) = 3),
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'canceled')),
  stripe_payment_link_id text unique,
  payment_link_url text,
  stripe_checkout_session_id text unique,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_org_created_idx on public.payments (organization_id, created_at desc);
create index if not exists payments_project_idx on public.payments (project_id, created_at desc);
create index if not exists payments_recipient_idx on public.payments (recipient_id, created_at desc);
create index if not exists payments_status_idx on public.payments (organization_id, status, created_at desc);

create or replace function public.validate_payment_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.projects p
    where p.id = new.project_id and p.organization_id = new.organization_id
  ) then
    raise exception 'Project does not belong to the payment organization';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.recipient_id and p.organization_id = new.organization_id
  ) then
    raise exception 'Recipient does not belong to the payment organization';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_validate_scope on public.payments;
create trigger payments_validate_scope before insert or update on public.payments
for each row execute function public.validate_payment_scope();

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments
for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

drop policy if exists "Users view payment history" on public.payments;
create policy "Users view payment history"
  on public.payments for select
  using (
    recipient_id = auth.uid()
    or (public.has_management_role() and public.same_organization(organization_id))
  );

drop policy if exists "Management create payment records" on public.payments;
create policy "Management create payment records"
  on public.payments for insert
  with check (
    public.has_management_role()
    and created_by = auth.uid()
    and public.same_organization(organization_id)
  );

revoke all on public.payments from anon;
grant select, insert on public.payments to authenticated;
