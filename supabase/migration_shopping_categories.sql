-- ============================================================
-- Categoría de supermercado en la lista de compras (carnes, lácteos,
-- frutas y verduras, etc. - ver lib/grocery-categories.ts). Se sugiere
-- sola al cargar el producto y se puede editar.
-- Idempotente. Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

alter table public.shopping_items
  add column if not exists category text not null default 'otros';

notify pgrst, 'reload schema';
