-- ============================================================
-- Banco y tarjeta por gasto (para el import de resúmenes)
-- Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

alter table public.expenses
  add column if not exists bank text;
alter table public.expenses
  add column if not exists card text;

-- Refresca el schema cache de PostgREST/Supabase al toque.
notify pgrst, 'reload schema';
