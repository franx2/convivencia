import { createClient } from '@supabase/supabase-js'

export type AuthedUser = { id: string; metadata: Record<string, unknown> }

// Valida el JWT de Supabase del header Authorization. Sin esto, cualquiera
// podía llamar a los endpoints server-side y quemar cuota/costo del servidor.
export async function requireUser(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get('authorization') ?? ''
  const token = /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, '').trim() : ''
  if (!token) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return null
    return { id: data.user.id, metadata: data.user.user_metadata ?? {} }
  } catch {
    return null
  }
}

// Best-effort: en serverless cada instancia tiene su propio mapa, pero igual
// corta los loops desde una misma instancia. Para límite duro usar un store
// externo (Upstash/Redis).
// ponytail: mapa en memoria por proceso, alcanza para cortar abuso obvio; subir
// a Redis si el tráfico cruza varias instancias y el límite deja de sentirse.
const rateHits = new Map<string, number[]>()

export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (rateHits.get(key) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  rateHits.set(key, recent)
  return recent.length > limit
}
