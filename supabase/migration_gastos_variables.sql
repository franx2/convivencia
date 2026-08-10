-- ============================================================
-- Gastos fijos de monto variable (luz, gas: hay que pagarlos todos los
-- meses pero el monto cambia). Antes, "gastos fijos" siempre auto-generaba
-- el mismo monto guardado, mes tras mes, sin que nadie lo revise.
--
-- amount_fixed=true  (default, comportamiento actual): se auto-genera solo
--   con pg_cron usando "amount".
-- amount_fixed=false: NO se auto-genera. Es un recordatorio; se carga a
--   mano desde /g/[id]/nuevo con el monto real de la factura.
-- Idempotente. Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

alter table public.recurring_expenses
  add column if not exists amount_fixed boolean not null default true;

alter table public.recurring_expenses
  alter column amount drop not null;

alter table public.recurring_expenses
  drop constraint if exists recurring_expenses_amount_check;
alter table public.recurring_expenses
  add constraint recurring_expenses_amount_check check (amount is null or amount > 0);

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
    select * from public.recurring_expenses where active and amount_fixed
  loop
    target_month := coalesce(r.last_month + interval '1 month', date_trunc('month', current_date))::date;

    while target_month <= date_trunc('month', current_date)::date loop
      due_date := target_month
        + (least(
             r.day_of_month,
             extract(day from (target_month + interval '1 month' - interval '1 day'))::int
           ) - 1) * interval '1 day';

      exit when due_date > current_date;

      insert into public.expenses (group_id, title, amount, currency, rate_to_base, paid_by, date, category)
      values (r.group_id, r.title, r.amount, r.currency, r.rate_to_base, r.paid_by, due_date, r.category)
      returning id into new_id;

      insert into public.expense_shares (expense_id, member_id, weight)
      select new_id, s.member_id, s.weight
      from public.recurring_expense_shares s
      where s.recurring_id = r.id;

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
