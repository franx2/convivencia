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

-- Instalaciones anteriores podian tener un CHECK sobre source_key con la lista
-- inicial de bancos. Las fuentes llegan unicamente del endpoint con lista
-- blanca, por lo que ese CHECK no aporta seguridad y bloquea bancos nuevos.
do $$
declare
  source_check text;
begin
  for source_check in
    select conname
    from pg_constraint
    where conrelid = 'public.bank_discounts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source_key%'
  loop
    execute format('alter table public.bank_discounts drop constraint if exists %I', source_check);
  end loop;
end $$;

create index if not exists idx_bank_discounts_user on public.bank_discounts(user_id);
create index if not exists idx_bank_discounts_bank on public.bank_discounts(user_id, bank);
create index if not exists idx_bank_discounts_valid_to on public.bank_discounts(user_id, valid_to);

alter table public.bank_discounts enable row level security;
drop policy if exists bank_discounts_own on public.bank_discounts;
create policy bank_discounts_own on public.bank_discounts
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.bank_discounts to authenticated;

notify pgrst, 'reload schema';
