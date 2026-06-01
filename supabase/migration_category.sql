-- Agrega categoria a los gastos. Pegar y ejecutar en Supabase -> SQL Editor.
alter table public.expenses
  add column if not exists category text not null default 'otros';
