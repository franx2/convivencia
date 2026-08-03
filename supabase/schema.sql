-- ============================================================
-- convivencia (Tricount clone) - esquema completo
-- Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ---------- Tablas ----------

create table if not exists public.groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  base_currency text not null default 'ARS',
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invite_token  uuid not null default gen_random_uuid(),
  created_at    timestamptz not null default now()
);

create table if not exists public.group_users (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  title        text not null,
  amount       numeric(14,2) not null check (amount > 0),
  currency     text not null,
  rate_to_base numeric(18,8) not null default 1 check (rate_to_base > 0),
  paid_by      uuid not null references public.members(id) on delete restrict,
  date         date not null default current_date,
  category     text not null default 'otros',
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  primary key (expense_id, member_id)
);

create index if not exists idx_members_group   on public.members(group_id);
create index if not exists idx_expenses_group   on public.expenses(group_id);
create index if not exists idx_group_users_user on public.group_users(user_id);

alter table public.group_users
  add column if not exists member_id uuid references public.members(id) on delete set null;
create index if not exists idx_group_users_member on public.group_users(member_id);

-- ---------- Funciones de apoyo (SECURITY DEFINER, evitan recursion en RLS) ----------

-- ¿el usuario actual pertenece al grupo?
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_users gu
    where gu.group_id = gid and gu.user_id = auth.uid()
  );
$$;

-- al crear un grupo, sumar automaticamente al dueno como usuario con acceso
create or replace function public.add_owner_to_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_users (group_id, user_id)
  values (new.id, new.owner_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_add_owner_to_group on public.groups;
create trigger trg_add_owner_to_group
  after insert on public.groups
  for each row execute function public.add_owner_to_group();

-- sumarse a un grupo con el token de invitacion
create or replace function public.join_group(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  select id into gid from public.groups where invite_token = p_token;
  if gid is null then
    raise exception 'Invitacion invalida';
  end if;
  insert into public.group_users (group_id, user_id)
  values (gid, auth.uid())
  on conflict do nothing;
  return gid;
end;
$$;

-- ---------- RLS ----------

alter table public.groups        enable row level security;
alter table public.group_users   enable row level security;
alter table public.members       enable row level security;
alter table public.expenses      enable row level security;
alter table public.expense_shares enable row level security;

-- groups
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select using (owner_id = auth.uid() or public.is_group_member(id));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert with check (owner_id = auth.uid());

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update using (owner_id = auth.uid());

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete using (owner_id = auth.uid());

-- group_users (insert se maneja por trigger / join_group, ambos SECURITY DEFINER)
drop policy if exists group_users_select on public.group_users;
create policy group_users_select on public.group_users
  for select using (user_id = auth.uid() or public.is_group_member(group_id));

drop policy if exists group_users_delete on public.group_users;
create policy group_users_delete on public.group_users
  for delete using (user_id = auth.uid());

drop policy if exists group_users_update_self on public.group_users;
create policy group_users_update_self on public.group_users
  for update using (
    user_id = auth.uid()
    and public.is_group_member(group_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_group_member(group_id)
    and (
      member_id is null
      or exists (
        select 1
        from public.members m
        where m.id = member_id
          and m.group_id = group_users.group_id
      )
    )
  );

-- members
-- select/insert/update colaborativos; el delete queda solo para el dueño del
-- grupo (F4): members.* es ON DELETE CASCADE en shares/ingresos/ahorros/pagos,
-- así que un borrado podía destruir historial y corromper balances.
drop policy if exists members_all    on public.members;
drop policy if exists members_select on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;
create policy members_select on public.members
  for select using (public.is_group_member(group_id));
create policy members_insert on public.members
  for insert with check (public.is_group_member(group_id));
create policy members_update on public.members
  for update using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));
create policy members_delete on public.members
  for delete using (
    exists (
      select 1 from public.groups g
      where g.id = members.group_id and g.owner_id = auth.uid()
    )
  );

-- expenses
drop policy if exists expenses_all on public.expenses;
create policy expenses_all on public.expenses
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- expense_shares (membresia via el gasto padre)
drop policy if exists expense_shares_all on public.expense_shares;
create policy expense_shares_all on public.expense_shares
  for all using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

-- ---------- Privilegios de tabla ----------
-- PostgREST exige privilegios de tabla ADEMAS de las policies de RLS:
-- RLS filtra las FILAS, pero el rol primero necesita el GRANT sobre la TABLA.
-- Damos acceso al rol `authenticated` (usuarios logueados); RLS limita a sus grupos.
-- `anon` (deslogueado) queda sin acceso a proposito: la app exige login.

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.groups,
  public.group_users,
  public.members,
  public.expenses,
  public.expense_shares
to authenticated;

grant execute on function public.join_group(uuid) to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;

-- ============================================================
-- Categorias personalizadas por grupo + pagos (ver migration_categorias_pagos.sql)
-- ============================================================

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

alter table public.categories enable row level security;
drop policy if exists categories_all on public.categories;
create policy categories_all on public.categories
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

alter table public.payments enable row level security;
drop policy if exists payments_all on public.payments;
create policy payments_all on public.payments
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

grant select, insert, update, delete on
  public.categories,
  public.payments
to authenticated;

-- ============================================================
-- Reparto proporcional (pesos) + plantillas (ver migration_reparto_plantillas.sql)
-- ============================================================

alter table public.members
  add column if not exists weight numeric(12,4) not null default 1 check (weight > 0);
alter table public.expense_shares
  add column if not exists weight numeric(12,4) not null default 1 check (weight > 0);

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

-- ============================================================
-- Alias de pago + presupuesto mensual (ver migration_alias_presupuesto.sql)
-- ============================================================

alter table public.members
  add column if not exists alias text;

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

-- ============================================================
-- Espacio personal (ver migration_espacio_personal.sql)
-- ============================================================

alter table public.groups
  add column if not exists is_personal boolean not null default false;

-- ============================================================
-- Tipo de grupo: convivencia (por defecto) o viaje (ver migration_group_kind.sql)
-- En un grupo tipo "viaje" la app no separa gastos/balances por mes. Fijo al
-- crear el grupo, no editable despues.
-- ============================================================

alter table public.groups
  add column if not exists kind text not null default 'convivencia'
  check (kind in ('convivencia', 'viaje'));

-- ============================================================
-- Saldo inicial / ajuste del balance acumulado (ver migration_balance_baseline.sql)
-- baseline_date null = se cuenta todo desde el principio. Si tiene fecha, el balance
-- acumulado arranca en baseline_amount y solo suma movimientos con date >= baseline_date.
-- No borra historial: los movimientos previos siguen en las listas.
-- ============================================================

alter table public.groups
  add column if not exists baseline_amount numeric not null default 0;
alter table public.groups
  add column if not exists baseline_date date;

-- ============================================================
-- Banco y tarjeta por gasto (ver migration_banco_tarjeta.sql)
-- ============================================================

alter table public.expenses
  add column if not exists bank text;
alter table public.expenses
  add column if not exists card text;

create table if not exists public.cards (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  name        text not null,
  bank        text,
  last4       text,
  closing_day integer check (closing_day is null or (closing_day between 1 and 31)),
  due_day     integer check (due_day is null or (due_day between 1 and 31)),
  created_at  timestamptz not null default now()
);
create index if not exists idx_cards_group on public.cards(group_id);

alter table public.expenses
  add column if not exists source text not null default 'manual'
  check (source in ('manual', 'card_import'));
alter table public.expenses
  add column if not exists card_id uuid references public.cards(id) on delete set null;
create index if not exists idx_expenses_card_id on public.expenses(card_id);
create index if not exists idx_expenses_source on public.expenses(source);

alter table public.cards enable row level security;
drop policy if exists cards_all on public.cards;
create policy cards_all on public.cards
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

grant select, insert, update, delete on public.cards to authenticated;

-- Promociones publicas de bancos, guardadas por usuario para sugerirlas junto
-- a sus tarjetas. No almacena credenciales ni datos de homebanking.
create table if not exists public.bank_discounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_key       text not null,
  external_key     text not null,
  bank             text not null,
  title            text not null,
  merchant         text,
  category         text,
  discount_percent numeric(5,2) check (discount_percent is null or (discount_percent > 0 and discount_percent <= 100)),
  installments     integer check (installments is null or (installments > 0 and installments <= 60)),
  cap_amount       numeric(14,2),
  min_amount       numeric(14,2),
  valid_from       date,
  valid_to         date,
  weekdays         text[] not null default '{}',
  payment_method   text,
  card_brand       text,
  card_tier        text,
  province         text,
  terms_text       text not null default '',
  source_url       text not null,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (user_id, source_key, external_key)
);
create index if not exists idx_bank_discounts_user on public.bank_discounts(user_id);
create index if not exists idx_bank_discounts_bank on public.bank_discounts(user_id, bank);
create index if not exists idx_bank_discounts_valid_to on public.bank_discounts(user_id, valid_to);
alter table public.bank_discounts enable row level security;
drop policy if exists bank_discounts_own on public.bank_discounts;
create policy bank_discounts_own on public.bank_discounts
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant select, insert, update, delete on public.bank_discounts to authenticated;

-- ============================================================
-- Ingresos por miembro (ver migration_ingresos.sql)
-- ============================================================

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

-- ============================================================
-- Ahorros por miembro (ver migration_personal_cards_savings.sql)
-- ============================================================

create table if not exists public.savings (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  amount     numeric(14,2) not null check (amount > 0),
  date       date not null default current_date,
  note       text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_savings_group on public.savings(group_id);

alter table public.savings enable row level security;
drop policy if exists savings_all on public.savings;
create policy savings_all on public.savings
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

grant select, insert, update, delete on public.savings to authenticated;

-- ============================================================
-- Lista de compras del supermercado (ver migration_shopping_list.sql)
-- Lista única persistente por grupo compartido: se cargan productos a mano,
-- se marcan como comprados y se pueden limpiar con un botón. Sin precio /
-- búsqueda online por ahora (fase futura).
-- ============================================================

create table if not exists public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  text       text not null,
  checked    boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_shopping_items_group on public.shopping_items(group_id);

-- Categoría de supermercado (carnes, lácteos, frutas y verduras, etc. - ver
-- migration_shopping_categories.sql / lib/grocery-categories.ts).
alter table public.shopping_items
  add column if not exists category text not null default 'otros';

alter table public.shopping_items enable row level security;
drop policy if exists shopping_items_all on public.shopping_items;
create policy shopping_items_all on public.shopping_items
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

grant select, insert, update, delete on public.shopping_items to authenticated;

-- ============================================================
-- Creación de grupo atómica (F5, ver migration_phase2_security.sql)
-- Crea grupo + miembro creador + identidad en una sola transacción. Se define
-- acá (al final) porque usa members.alias / groups.is_personal, agregados arriba.
-- ============================================================

drop function if exists public.create_group(text, text, text, text, boolean);

create or replace function public.create_group(
  p_name          text,
  p_base_currency text default 'ARS',
  p_member_name   text default null,
  p_alias         text default null,
  p_is_personal   boolean default false,
  p_kind          text default 'convivencia'
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g   public.groups;
  mid uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'El nombre del grupo es obligatorio';
  end if;
  if p_kind not in ('convivencia', 'viaje') then
    raise exception 'Tipo de grupo invalido';
  end if;

  insert into public.groups (name, base_currency, owner_id, is_personal, kind)
  values (
    trim(p_name),
    coalesce(nullif(trim(p_base_currency), ''), 'ARS'),
    auth.uid(),
    coalesce(p_is_personal, false),
    p_kind
  )
  returning * into g;

  if coalesce(trim(p_member_name), '') <> '' then
    insert into public.members (group_id, name, alias)
    values (g.id, trim(p_member_name), nullif(trim(coalesce(p_alias, '')), ''))
    returning id into mid;

    update public.group_users
      set member_id = mid
      where group_id = g.id and user_id = auth.uid();
  end if;

  return g;
end;
$$;

grant execute on function public.create_group(text, text, text, text, boolean, text) to authenticated;

-- ============================================================
-- Realtime para sync entre dispositivos (F6, best-effort)
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array['expenses', 'expense_shares', 'payments', 'members', 'incomes', 'savings', 'shopping_items'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      null; -- ya publicada o publicación inexistente: ignorar
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
