// Freno best-effort en el navegador para intentos de login/registro/reset:
// localStorage, así sobrevive a un refresh (a diferencia de un simple useState).
// No es el límite real (eso lo hace Supabase Auth del lado del servidor) — esto
// solo evita que alguien reviente el formulario a fuerza bruta desde la UI.
// ponytail: bypasseable borrando localStorage; subir a un endpoint propio con
// rateLimited() (lib/api-auth.ts) si esto deja de alcanzar.
export function clientRateLimited(key: string, limit: number, windowMs: number): boolean {
  if (typeof window === 'undefined') return false
  const storageKey = `rl:${key}`
  const now = Date.now()
  let hits: number[] = []
  try {
    hits = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
  } catch {
    hits = []
  }
  const recent = hits.filter((t) => now - t < windowMs)
  recent.push(now)
  window.localStorage.setItem(storageKey, JSON.stringify(recent))
  return recent.length > limit
}
