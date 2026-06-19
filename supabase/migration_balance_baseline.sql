-- ============================================================
-- Saldo inicial / ajuste del balance acumulado del espacio personal.
-- Idempotente: se puede correr varias veces.
--
-- baseline_date NULL  -> el balance acumulado cuenta todos los movimientos.
-- baseline_date fecha -> el balance arranca en baseline_amount y solo suma
--                        ingresos/gastos con date >= baseline_date.
-- No borra historial: los movimientos previos siguen visibles en las listas,
-- solo dejan de afectar el balance acumulado.
-- ============================================================

alter table public.groups
  add column if not exists baseline_amount numeric not null default 0;
alter table public.groups
  add column if not exists baseline_date date;
