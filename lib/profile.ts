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
