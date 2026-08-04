-- ============================================================
-- Reemplazo atómico del reparto de un gasto (F9).
-- Antes el cliente hacía DELETE de expense_shares y después INSERT, sin
-- transacción: si el insert fallaba (red, cierre de app, RLS), el gasto
-- quedaba SIN participantes. Ese estado es justo el que rompía los balances
-- (bug F2: se acreditaba al pagador sin cobrarle a nadie).
-- Idempotente. Pegar y ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

-- p_shares: array de objetos {member_id uuid, weight numeric}
create or replace function public.replace_expense_shares(
  p_expense_id uuid,
  p_shares     jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  select group_id into gid from public.expenses where id = p_expense_id;
  if gid is null then
    raise exception 'Gasto inexistente';
  end if;
  -- SECURITY DEFINER evita RLS, así que validamos la pertenencia a mano.
  if not public.is_group_member(gid) then
    raise exception 'Sin acceso a este grupo';
  end if;
  if p_shares is null or jsonb_array_length(p_shares) = 0 then
    raise exception 'El gasto tiene que repartirse entre al menos una persona';
  end if;

  -- Todo dentro de la misma transacción: o queda el reparto nuevo completo,
  -- o no se toca nada y el gasto conserva el anterior.
  delete from public.expense_shares where expense_id = p_expense_id;

  insert into public.expense_shares (expense_id, member_id, weight)
  select
    p_expense_id,
    (item->>'member_id')::uuid,
    coalesce(nullif(item->>'weight', '')::numeric, 1)
  from jsonb_array_elements(p_shares) as item;
end;
$$;

grant execute on function public.replace_expense_shares(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
