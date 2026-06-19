-- Tanda 9: hojas personales de ahorro/tarjetas y origen de gastos.

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

alter table public.cards enable row level security;
drop policy if exists cards_all on public.cards;
create policy cards_all on public.cards
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

alter table public.savings enable row level security;
drop policy if exists savings_all on public.savings;
create policy savings_all on public.savings
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

grant select, insert, update, delete on
  public.cards,
  public.savings
to authenticated;

notify pgrst, 'reload schema';
