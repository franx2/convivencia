-- ============================================================
-- Lista de compras del supermercado
-- Idempotente. Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

create table if not exists public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  text       text not null,
  checked    boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_shopping_items_group on public.shopping_items(group_id);

alter table public.shopping_items enable row level security;
drop policy if exists shopping_items_all on public.shopping_items;
create policy shopping_items_all on public.shopping_items
  for all using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

grant select, insert, update, delete on public.shopping_items to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.shopping_items';
exception when others then
  null; -- ya publicada o publicación inexistente: ignorar
end $$;

notify pgrst, 'reload schema';
