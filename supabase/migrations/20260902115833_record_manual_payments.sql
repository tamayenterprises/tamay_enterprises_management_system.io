-- Allow management to log cash/check/other payments that did not go through Stripe.
alter table public.payments
  add column if not exists method text not null default 'stripe';

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('stripe', 'manual'));

alter table public.payments drop constraint if exists payments_manual_paid_check;
alter table public.payments add constraint payments_manual_paid_check
  check (
    method <> 'manual'
    or (
      status = 'paid'
      and paid_at is not null
      and stripe_payment_link_id is null
      and payment_link_url is null
      and stripe_checkout_session_id is null
    )
  );

drop policy if exists "Management create payment records" on public.payments;
create policy "Management create payment records"
  on public.payments for insert
  to authenticated
  with check (
    public.has_management_role()
    and created_by = (select auth.uid())
    and public.same_organization(organization_id)
    and (
      method is distinct from 'manual'
      or (status = 'paid' and paid_at is not null)
    )
  );

grant select, insert on public.payments to authenticated;
