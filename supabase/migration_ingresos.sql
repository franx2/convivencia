-- ============================================================
-- Ingresos por miembro (para el balance mensual)
-- Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================
-- Los ingresos NO afectan la liquidación (quién le debe a quién); solo sirven
-- para el balance mensual (ingresos - gastos). Importe en la moneda base.

create table if not exists public.incomes (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  amount     numeric(14,2) not null check (amount > 0),
  date       date not null default current_date,
  note       text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_incomes_group on public.incomes(group_id);

alter table public.incomes enable row level security;
drop policy if exists incomes_all on public.incomes;
create policy incomes_all on public.incomes
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

grant select, insert, update, delete on public.incomes to authenticated;

notify pgrst, 'reload schema';
