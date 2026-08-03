import { supabase } from './supabase'
import type { Group } from './types'

function isMissingFunctionError(error: { code?: string; message?: string }) {
  const msg = (error.message ?? '').toLowerCase()
  return error.code === 'PGRST202' || msg.includes('could not find the function')
}

/**
 * Crea grupo + miembro creador + identidad. Usa la RPC atómica create_group; si
 * la función aún no existe (migración sin correr en este entorno), cae al método
 * por pasos para no dejar la creación de grupos rota entre deploy y migración.
 */
export async function createGroupWithOwner(opts: {
  name: string
  baseCurrency: string
  memberName: string | null
  alias: string | null
  isPersonal: boolean
  userId: string
  kind?: 'convivencia' | 'viaje'
}): Promise<Group | null> {
  const { name, baseCurrency, memberName, alias, isPersonal, userId, kind = 'convivencia' } = opts
  const rpc = await supabase.rpc('create_group', {
    p_name: name,
    p_base_currency: baseCurrency,
    p_member_name: memberName,
    p_alias: alias,
    p_is_personal: isPersonal,
    p_kind: kind,
  })
  if (!rpc.error && rpc.data) return rpc.data as Group
  if (rpc.error && !isMissingFunctionError(rpc.error)) throw rpc.error
  if (kind === 'viaje') {
    throw new Error('Falta correr supabase/migration_group_kind.sql para crear grupos de viaje.')
  }

  // Fallback no atómico (RPC ausente). No manda `kind`: si la columna existe
  // toma su default ('convivencia'); si no existe tampoco, no rompe el insert.
  const { data: g, error } = await supabase
    .from('groups')
    .insert({ name, base_currency: baseCurrency, is_personal: isPersonal })
    .select()
    .single()
  if (error || !g) throw error ?? new Error('No se pudo crear el grupo.')
  const group = g as Group
  if (memberName) {
    const { data: member } = await supabase
      .from('members')
      .insert({ group_id: group.id, name: memberName, alias: alias || null })
      .select('id')
      .single()
    if (member) {
      await supabase
        .from('group_users')
        .update({ member_id: (member as { id: string }).id })
        .eq('group_id', group.id)
        .eq('user_id', userId)
    }
  }
  return group
}
