-- ============================================================
-- Tanda 2: reparto proporcional (pesos) + gastos típicos (plantillas)
-- Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ---------- Reparto proporcional ----------
-- Peso por defecto del miembro (1 = parte normal). Sirve para repartir
-- proporcional al ingreso/criterio del grupo en vez de siempre 50/50.
alter table public.members
  add column if not exists weight numeric(12,4) not null default 1 check (weight > 0);

-- Peso de cada participante en un gasto puntual (default 1 = partes iguales).
alter table public.expense_shares
  add column if not exists weight numeric(12,4) not null default 1 check (weight > 0);

-- ---------- Gastos típicos / plantillas (por grupo) ----------
-- Atajos de un tap: "Super", "Delivery", "Nafta". `amount` es opcional
-- (monto sugerido); al tocar la plantilla se abre el form precargado.
create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  label      text not null,
  category   text not null default 'otros',
  amount     numeric(14,2) check (amount is null or amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_templates_group on public.templates(group_id);

alter table public.templates enable row level security;
drop policy if exists templates_all on public.templates;
create policy templates_all on public.templates
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

grant select, insert, update, delete on public.templates to authenticated;
