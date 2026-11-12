import type { User } from '@supabase/supabase-js'

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function userPaymentAlias(user: User | null | undefined): string {
  if (!user) return ''
  const metadata = user.user_metadata ?? {}
  return clean(metadata.payment_alias) || clean(metadata.alias)
}

export function userDisplayName(user: User | null | undefined): string {
  if (!user) return 'Yo'
  const metadata = user.user_metadata ?? {}
  const fromMetadata = clean(metadata.full_name) || clean(metadata.name)
  if (fromMetadata) return fromMetadata
  const emailName = user.email?.split('@')[0]?.trim()
  return emailName || 'Yo'
}

export function userPreferredStores(user: User | null | undefined): string[] {
  if (!user) return []
  const raw = user.user_metadata?.preferred_stores
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
}

// Módulos que cada usuario puede apagar. Gastos, Tarjetas y Config. van siempre.
export const MODULES = [
  { key: 'finanzas', title: 'Finanzas personales', desc: 'Ingresos, ahorro, presupuesto y resumen de tu espacio.' },
  { key: 'super', title: 'Lista del súper', desc: 'Lista de compras compartida y buscador de precios.' },
  { key: 'grupos', title: 'Grupos', desc: 'Convivencia y grupal: repartir gastos y saldar deudas.' },
] as const
export type ModuleKey = (typeof MODULES)[number]['key']
export const ALL_MODULES: ModuleKey[] = MODULES.map((m) => m.key)

/** null = nunca eligió (cuenta vieja): se le pregunta una vez y mientras tanto ve todo. */
export function userModulesChoice(user: User | null | undefined): ModuleKey[] | null {
  const raw = user?.user_metadata?.modules
  if (!Array.isArray(raw)) return null
  return ALL_MODULES.filter((k) => raw.includes(k))
}

export function userModules(user: User | null | undefined): ModuleKey[] {
  return userModulesChoice(user) ?? ALL_MODULES
}
