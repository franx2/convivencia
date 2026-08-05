-- ============================================================
-- Metricas de uso de convivencia.
-- Ejecutar en Supabase Dashboard -> SQL Editor.
-- Registra aperturas de sesion y acciones creadas dentro de la app.
-- ============================================================

create table if not exists public.user_activity_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'app_opened',
    'expense_created',
    'income_created',
    'saving_created',
    'shopping_item_created',
    'card_created',
    'budget_created',
    'payment_registered'
  )),
  group_id   uuid references public.groups(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_events_user_created
  on public.user_activity_events(user_id, created_at desc);
create index if not exists idx_activity_events_type_created
  on public.user_activity_events(event_type, created_at desc);

alter table public.user_activity_events enable row level security;

-- Cada persona solo puede generar eventos para su propia cuenta. No hay
-- politica SELECT: el detalle queda reservado al administrador en SQL Editor.
drop policy if exists user_activity_events_insert_own on public.user_activity_events;
create policy user_activity_events_insert_own on public.user_activity_events
  for insert to authenticated
  with check (user_id = auth.uid());

grant insert on public.user_activity_events to authenticated;

create or replace function public.log_user_activity()
returns trigger
language plpgsql
as $$
begin
  -- Los procesos automaticos (por ejemplo, gastos recurrentes) no pertenecen
  -- a una persona conectada y no deben contarse como actividad de usuario.
  if auth.uid() is not null then
    insert into public.user_activity_events (user_id, event_type, group_id)
    values (auth.uid(), TG_ARGV[0], new.group_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activity_expense_created on public.expenses;
create trigger trg_activity_expense_created
  after insert on public.expenses
  for each row execute function public.log_user_activity('expense_created');

drop trigger if exists trg_activity_income_created on public.incomes;
create trigger trg_activity_income_created
  after insert on public.incomes
  for each row execute function public.log_user_activity('income_created');

drop trigger if exists trg_activity_saving_created on public.savings;
create trigger trg_activity_saving_created
  after insert on public.savings
  for each row execute function public.log_user_activity('saving_created');

drop trigger if exists trg_activity_shopping_item_created on public.shopping_items;
create trigger trg_activity_shopping_item_created
  after insert on public.shopping_items
  for each row execute function public.log_user_activity('shopping_item_created');

drop trigger if exists trg_activity_card_created on public.cards;
create trigger trg_activity_card_created
  after insert on public.cards
  for each row execute function public.log_user_activity('card_created');

drop trigger if exists trg_activity_budget_created on public.budgets;
create trigger trg_activity_budget_created
  after insert on public.budgets
  for each row execute function public.log_user_activity('budget_created');

drop trigger if exists trg_activity_payment_registered on public.payments;
create trigger trg_activity_payment_registered
  after insert on public.payments
  for each row execute function public.log_user_activity('payment_registered');

-- Reporte para SQL Editor: usuarios, acceso y acciones recientes.
-- La fecha de ultimo inicio de sesion viene de Supabase Auth. La actividad
-- real se calcula a partir de aperturas y acciones efectuadas en la app.
--
-- select
--   coalesce(
--     nullif(u.raw_user_meta_data->>'full_name', ''),
--     nullif(u.raw_user_meta_data->>'name', ''),
--     u.email
--   ) as nombre,
--   u.email,
--   u.created_at as fecha_registro,
--   u.last_sign_in_at as ultimo_inicio_sesion,
--   max(a.created_at) as ultima_actividad,
--   count(*) filter (
--     where a.event_type = 'app_opened'
--       and a.created_at >= now() - interval '30 days'
--   ) as aperturas_30_dias,
--   count(*) filter (
--     where a.event_type <> 'app_opened'
--       and a.created_at >= now() - interval '30 days'
--   ) as acciones_30_dias
-- from auth.users u
-- left join public.user_activity_events a on a.user_id = u.id
-- group by u.id, u.email, u.created_at, u.last_sign_in_at, u.raw_user_meta_data
-- order by ultima_actividad desc nulls last, u.created_at desc;

notify pgrst, 'reload schema';
