-- ============================================================
-- Gastos recurrentes (alquiler, expensas, servicios, suscripciones).
-- Sirven igual en el espacio personal y en grupos compartidos.
-- La generación corre sola con pg_cron (una vez por día); la función es
-- idempotente, así que correrla de más NO duplica gastos.
-- Idempotente. Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

create table if not exists public.recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  title         text not null,
  amount        numeric(14,2) not null check (amount > 0),
  currency      text not null default 'ARS',
  rate_to_base  numeric(18,8) not null default 1 check (rate_to_base > 0),
  -- Si borran al miembro que paga, el recurrente se va con él (si no, la
  -- generación fallaría para siempre por la FK de expenses.paid_by).
  paid_by       uuid not null references public.members(id) on delete cascade,
  category      text not null default 'otros',
  day_of_month  integer not null check (day_of_month between 1 and 31),
  active        boolean not null default true,
  -- Mes ya generado (siempre el día 1), para no duplicar.
  last_month    date,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_recurring_expenses_group on public.recurring_expenses(group_id);

-- Con quiénes se reparte (espeja expense_shares).
create table if not exists public.recurring_expense_shares (
  recurring_id uuid not null references public.recurring_expenses(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  weight       numeric(12,4) not null default 1 check (weight > 0),
  primary key (recurring_id, member_id)
);

-- Si al crearlo el día de este mes ya pasó, arranca el mes que viene: crear un
-- "Alquiler día 5" un día 20 no debe generar retroactivamente el del 5.
create or replace function public.recurring_expenses_set_start()
returns trigger
language plpgsql
as $$
begin
  if new.last_month is null and new.day_of_month < extract(day from current_date)::int then
    new.last_month := date_trunc('month', current_date)::date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recurring_expenses_set_start on public.recurring_expenses;
create trigger trg_recurring_expenses_set_start
  before insert on public.recurring_expenses
  for each row execute function public.recurring_expenses_set_start();

alter table public.recurring_expenses enable row level security;
drop policy if exists recurring_expenses_all on public.recurring_expenses;
create policy recurring_expenses_all on public.recurring_expenses
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

alter table public.recurring_expense_shares enable row level security;
drop policy if exists recurring_expense_shares_all on public.recurring_expense_shares;
create policy recurring_expense_shares_all on public.recurring_expense_shares
  for all using (
    exists (
      select 1 from public.recurring_expenses r
      where r.id = recurring_id and public.is_group_member(r.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.recurring_expenses r
      where r.id = recurring_id and public.is_group_member(r.group_id)
    )
  );

grant select, insert, update, delete on
  public.recurring_expenses,
  public.recurring_expense_shares
to authenticated;

-- ------------------------------------------------------------
-- Generación. Idempotente por (recurrente, mes) vía last_month.
-- Se pone al día: si estuvo sin correr varios meses, genera los que falten.
-- SECURITY DEFINER porque bajo cron no hay auth.uid() y RLS bloquearía todo.
-- ------------------------------------------------------------
create or replace function public.generate_recurring_expenses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r            record;
  target_month date;
  due_date     date;
  new_id       uuid;
  created      integer := 0;
begin
  for r in
    select * from public.recurring_expenses where active
  loop
    -- Arranca en el mes del último generado (o en el actual si es nuevo) y
    -- avanza mes a mes hasta hoy.
    target_month := coalesce(r.last_month + interval '1 month', date_trunc('month', current_date))::date;

    while target_month <= date_trunc('month', current_date)::date loop
      -- Día 31 en un mes de 30 (o febrero): se recorta al último día del mes.
      due_date := target_month
        + (least(
             r.day_of_month,
             extract(day from (target_month + interval '1 month' - interval '1 day'))::int
           ) - 1) * interval '1 day';

      -- Solo si esa fecha ya llegó (no adelantamos el alquiler del 10 el día 3).
      exit when due_date > current_date;

      insert into public.expenses (group_id, title, amount, currency, rate_to_base, paid_by, date, category)
      values (r.group_id, r.title, r.amount, r.currency, r.rate_to_base, r.paid_by, due_date, r.category)
      returning id into new_id;

      insert into public.expense_shares (expense_id, member_id, weight)
      select new_id, s.member_id, s.weight
      from public.recurring_expense_shares s
      where s.recurring_id = r.id;

      -- Sin reparto explícito, queda a cargo de quien lo paga: nunca dejamos
      -- un gasto sin participantes (eso rompía los balances, bug F2).
      if not found then
        insert into public.expense_shares (expense_id, member_id, weight)
        values (new_id, r.paid_by, 1);
      end if;

      update public.recurring_expenses set last_month = target_month where id = r.id;
      created := created + 1;
      target_month := (target_month + interval '1 month')::date;
    end loop;
  end loop;

  return created;
end;
$$;

-- Permite forzar la generación desde la app (además del cron diario).
grant execute on function public.generate_recurring_expenses() to authenticated;

-- ------------------------------------------------------------
-- Cron diario. Requiere la extensión pg_cron (Supabase: Database ->
-- Extensions -> pg_cron, o el create extension de acá abajo).
-- Si tu proyecto no la tiene habilitada, el bloque no rompe la migración:
-- la app igual puede llamar a generate_recurring_expenses() a mano.
-- ------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;

  -- Reprogramar limpio (unschedule falla si no existe, por eso el sub-bloque).
  begin
    perform cron.unschedule('generar-gastos-recurrentes');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'generar-gastos-recurrentes',
    '0 9 * * *', -- 09:00 UTC = 06:00 ART
    $cron$select public.generate_recurring_expenses()$cron$
  );
exception when others then
  raise notice 'pg_cron no disponible: habilitalo en Database -> Extensions y volvé a correr esta migración. Detalle: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
