-- ============================================================
-- Tanda 3: alias de pago por miembro + presupuesto mensual por categoría
-- Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

-- Alias / CBU para cobrar (texto libre, opcional).
alter table public.members
  add column if not exists alias text;

-- Presupuesto mensual por categoría (uno por grupo+categoría).
create table if not exists public.budgets (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  category   text not null,
  amount     numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (group_id, category)
);

create index if not exists idx_budgets_group on public.budgets(group_id);

alter table public.budgets enable row level security;
drop policy if exists budgets_all on public.budgets;
create policy budgets_all on public.budgets
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

grant select, insert, update, delete on public.budgets to authenticated;
