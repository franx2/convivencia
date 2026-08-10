-- ============================================================
-- NIC / N° de cuenta en gastos fijos (para servicios como luz, gas,
-- internet): un lugar a mano para anotar el número de cliente.
-- Idempotente. Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

alter table public.recurring_expenses
  add column if not exists account_number text;
