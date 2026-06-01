-- ============================================================
-- Tanda 5a: espacio personal
-- Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

-- Un "espacio personal" es un grupo marcado como personal: gastos tuyos sin
-- repartir. Se crea con un único miembro ("Yo"). Reusa todo el modelo de grupos.
alter table public.groups
  add column if not exists is_personal boolean not null default false;
