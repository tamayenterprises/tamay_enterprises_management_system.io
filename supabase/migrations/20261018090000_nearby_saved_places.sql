-- Nearby Finder: Tamay Saved Places (suppliers + crew food spots).
-- DEVELOPMENT FIRST. Do not apply to Production until Carlos approves the release.
--
-- Staff (admin, project manager, employee, subcontractor) read their organization's active saved
-- places. Only approved management creates, edits, marks preferred, or archives them. Clients have
-- no access. Rows hold only what a staff member typed in (no copied Google business data).
-- No hard deletes: archive instead. Additive and safe to re-run.

create table if not exists public.nearby_saved_places (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  place_type text not null,
  category text not null,
  business_name text not null,
  address text not null,
  latitude double precision,
  longitude double precision,
  phone text,
  website text,
  note text,
  is_preferred boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nearby_saved_places_type check (place_type in ('supplier', 'food')),
  constraint nearby_saved_places_category check (category ~ '^[a-z_]{2,40}$'),
  constraint nearby_saved_places_name check (char_length(btrim(business_name)) between 1 and 120),
  constraint nearby_saved_places_address check (char_length(btrim(address)) between 3 and 250),
  constraint nearby_saved_places_coords check (
    (latitude is null and longitude is null)
    or (
      latitude is not null
      and longitude is not null
      and latitude between -90 and 90
      and longitude between -180 and 180
      and not (latitude = 0 and longitude = 0)
    )
  ),
  constraint nearby_saved_places_phone check (phone is null or char_length(phone) <= 40),
  constraint nearby_saved_places_website check (
    website is null or (char_length(website) <= 300 and website ~* '^https?://')
  ),
  constraint nearby_saved_places_note check (note is null or char_length(note) <= 200)
);

create index if not exists nearby_saved_places_org_type_idx
  on public.nearby_saved_places (organization_id, place_type)
  where archived_at is null;

-- Who may read: approved, active, non-archived staff. Clients and pending users never.
create or replace function public.is_nearby_finder_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and pr.approval_status = 'approved'
      and pr.is_active = true
      and pr.archived_at is null
      and pr.role in ('admin', 'project_manager', 'employee', 'subcontractor')
  );
$$;

-- Who may write: approved, active management.
create or replace function public.is_nearby_places_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_management_role() and public.is_approved_user();
$$;

revoke all on function public.is_nearby_finder_user() from public, anon;
revoke all on function public.is_nearby_places_manager() from public, anon;
grant execute on function public.is_nearby_finder_user() to authenticated;
grant execute on function public.is_nearby_places_manager() to authenticated;

-- Server-stamped audit fields; text trimmed, blanks stored as null. Organization never changes.
create or replace function public.stamp_nearby_saved_place()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.organization_id := old.organization_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  new.business_name := btrim(new.business_name);
  new.address := btrim(new.address);
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  new.website := nullif(btrim(coalesce(new.website, '')), '');
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  return new;
end;
$$;

drop trigger if exists nearby_saved_places_stamp on public.nearby_saved_places;
create trigger nearby_saved_places_stamp
  before insert or update on public.nearby_saved_places
  for each row execute function public.stamp_nearby_saved_place();

alter table public.nearby_saved_places enable row level security;

revoke all on public.nearby_saved_places from anon;
revoke all on public.nearby_saved_places from authenticated;
grant select, insert, update on public.nearby_saved_places to authenticated;

drop policy if exists "Staff view saved places" on public.nearby_saved_places;
create policy "Staff view saved places"
  on public.nearby_saved_places for select
  to authenticated
  using (
    public.is_nearby_finder_user()
    and public.same_organization(organization_id)
    and (archived_at is null or public.is_nearby_places_manager())
  );

drop policy if exists "Management add saved places" on public.nearby_saved_places;
create policy "Management add saved places"
  on public.nearby_saved_places for insert
  to authenticated
  with check (public.is_nearby_places_manager() and public.same_organization(organization_id));

drop policy if exists "Management edit saved places" on public.nearby_saved_places;
create policy "Management edit saved places"
  on public.nearby_saved_places for update
  to authenticated
  using (public.is_nearby_places_manager() and public.same_organization(organization_id))
  with check (public.is_nearby_places_manager() and public.same_organization(organization_id));

notify pgrst, 'reload schema';

select 'nearby saved places installed' as status;

-- Manual rollback (Development):
--   drop table if exists public.nearby_saved_places;
--   drop function if exists public.stamp_nearby_saved_place();
--   drop function if exists public.is_nearby_places_manager();
--   drop function if exists public.is_nearby_finder_user();
