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
