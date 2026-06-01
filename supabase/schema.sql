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

-- members
drop policy if exists members_all on public.members;
create policy members_all on public.members
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

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
