-- ============================================================
-- Tipo de grupo: convivencia (por defecto) o viaje.
-- En un grupo tipo "viaje", la app no separa gastos/balances por mes (se
-- ve como un total unico). Fijo al crear el grupo, no editable despues.
-- Idempotente. Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

alter table public.groups
  add column if not exists kind text not null default 'convivencia'
  check (kind in ('convivencia', 'viaje'));

-- create_group ahora acepta p_kind (default 'convivencia' para no romper
-- llamadas viejas mientras se actualiza el cliente). Agregar un parametro
-- crea un OVERLOAD nuevo en vez de reemplazar la funcion vieja de 5
-- argumentos: la borramos primero para no dejar dos versiones dando vueltas.
drop function if exists public.create_group(text, text, text, text, boolean);

create or replace function public.create_group(
  p_name          text,
  p_base_currency text default 'ARS',
  p_member_name   text default null,
  p_alias         text default null,
  p_is_personal   boolean default false,
  p_kind          text default 'convivencia'
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
  if p_kind not in ('convivencia', 'viaje') then
    raise exception 'Tipo de grupo invalido';
  end if;

  insert into public.groups (name, base_currency, owner_id, is_personal, kind)
  values (
    trim(p_name),
    coalesce(nullif(trim(p_base_currency), ''), 'ARS'),
    auth.uid(),
    coalesce(p_is_personal, false),
    p_kind
  )
  returning * into g;

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

grant execute on function public.create_group(text, text, text, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
