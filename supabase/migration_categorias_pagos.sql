-- ============================================================
-- Tanda 1: categorias personalizadas por grupo + registrar pagos
-- Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ---------- Categorias personalizadas (por grupo) ----------
-- Las categorias preset viven en el codigo (lib/categories.ts) y estan
-- disponibles para todos los grupos. Esta tabla guarda SOLO las que el
-- usuario crea a mano en un grupo. `value` es el slug que se guarda en
-- expenses.category.
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  value      text not null,
  label      text not null,
  color      text not null default 'bg-slate-100 text-slate-600',
  hex        text not null default '#94a3b8',
  created_at timestamptz not null default now(),
  unique (group_id, value)
);

create index if not exists idx_categories_group on public.categories(group_id);

alter table public.categories enable row level security;
drop policy if exists categories_all on public.categories;
create policy categories_all on public.categories
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- ---------- Pagos / saldados ----------
-- Un pago es "from_member le pagó amount (moneda base) a to_member".
-- Reduce la deuda en los balances y en la liquidacion.
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  from_member uuid not null references public.members(id) on delete cascade,
  to_member   uuid not null references public.members(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  date        date not null default current_date,
  note        text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_payments_group on public.payments(group_id);

alter table public.payments enable row level security;
drop policy if exists payments_all on public.payments;
create policy payments_all on public.payments
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- ---------- Privilegios de tabla (ademas de RLS) ----------
grant select, insert, update, delete on
  public.categories,
  public.payments
to authenticated;
