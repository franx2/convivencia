-- ============================================================
-- Fase 2 — seguridad y consistencia (F4 + F5 + F6)
-- Idempotente: se puede correr varias veces sin romper.
-- Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

-- Asegurar columnas que usan las políticas / la RPC (por si falta alguna migración).
alter table public.members add column if not exists alias text;
alter table public.groups  add column if not exists is_personal boolean not null default false;

-- ------------------------------------------------------------
-- F4 — Borrado de miembros solo para el dueño del grupo.
-- Antes `members_all` (FOR ALL) dejaba que CUALQUIER integrante borrara
-- miembros, y como members.* es ON DELETE CASCADE en shares/ingresos/ahorros/
-- pagos, eso permitía destruir historial y corromper balances.
-- Mantenemos select/insert/update colaborativos; solo el delete queda owner-only.
-- ------------------------------------------------------------
drop policy if exists members_all    on public.members;
drop policy if exists members_select on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;

create policy members_select on public.members
  for select using (public.is_group_member(group_id));

create policy members_insert on public.members
  for insert with check (public.is_group_member(group_id));

create policy members_update on public.members
  for update using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

create policy members_delete on public.members
  for delete using (
    exists (
      select 1 from public.groups g
      where g.id = members.group_id and g.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- F5 — Creación de grupo atómica.
-- Crea el grupo, agrega al creador como miembro y fija su identidad
-- (group_users.member_id) en una sola transacción. Reemplaza los 3 awaits
-- sueltos del cliente que podían dejar un grupo a medio crear.
-- SECURITY DEFINER: corre como dueño de la función (evita carreras de RLS),
-- pero fija owner_id = auth.uid() y solo toca el grupo recién creado.
-- ------------------------------------------------------------
create or replace function public.create_group(
  p_name          text,
  p_base_currency text default 'ARS',
  p_member_name   text default null,
  p_alias         text default null,
  p_is_personal   boolean default false
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g   public.groups;
  mid uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'El nombre del grupo es obligatorio';
  end if;

  insert into public.groups (name, base_currency, owner_id, is_personal)
  values (
    trim(p_name),
    coalesce(nullif(trim(p_base_currency), ''), 'ARS'),
    auth.uid(),
    coalesce(p_is_personal, false)
  )
  returning * into g;
  -- el trigger trg_add_owner_to_group ya sumó al dueño a group_users.

  if coalesce(trim(p_member_name), '') <> '' then
    insert into public.members (group_id, name, alias)
    values (g.id, trim(p_member_name), nullif(trim(coalesce(p_alias, '')), ''))
    returning id into mid;

    update public.group_users
      set member_id = mid
      where group_id = g.id and user_id = auth.uid();
  end if;

  return g;
end;
$$;

grant execute on function public.create_group(text, text, text, text, boolean) to authenticated;

-- ------------------------------------------------------------
-- F6 — Realtime para sync entre dispositivos (best-effort).
-- Publica las tablas clave en supabase_realtime. Tolerante: si la publicación
-- no existe o la tabla ya está publicada, no falla.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['expenses', 'expense_shares', 'payments', 'members', 'incomes', 'savings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      null; -- ya publicada o publicación inexistente: ignorar
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
