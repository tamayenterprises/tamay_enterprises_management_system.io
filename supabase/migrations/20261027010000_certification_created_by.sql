-- Record who added each certification so workers can see Tamay uploads separately from their own.

alter table public.certifications
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

create index if not exists certifications_created_by_idx on public.certifications (created_by);

create or replace function public.certifications_assign_created_by()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists certifications_assign_created_by on public.certifications;
create trigger certifications_assign_created_by
  before insert on public.certifications
  for each row
  execute function public.certifications_assign_created_by();
