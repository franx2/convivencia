-- Tanda 8: relacionar cada usuario logueado con su miembro dentro de cada grupo.
-- Permite que la app sepa "quien soy" y use ese miembro como pagador por defecto.

alter table public.group_users
  add column if not exists member_id uuid references public.members(id) on delete set null;

create index if not exists idx_group_users_member on public.group_users(member_id);

drop policy if exists group_users_update_self on public.group_users;
create policy group_users_update_self on public.group_users
  for update using (
    user_id = auth.uid()
    and public.is_group_member(group_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_group_member(group_id)
    and (
      member_id is null
      or exists (
        select 1
        from public.members m
        where m.id = member_id
          and m.group_id = group_users.group_id
      )
    )
  );

notify pgrst, 'reload schema';
