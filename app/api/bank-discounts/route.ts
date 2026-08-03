import { rateLimited, requireUser } from '@/lib/api-auth'
import {
  BANK_DISCOUNT_SOURCES,
  parseBankDiscounts,
  scrapeNacionSemanaNacion,
  type BankDiscountSource,
} from '@/lib/bank-discounts'

export const runtime = 'nodejs'
export const maxDuration = 30

const RATE_LIMIT = 4
const RATE_WINDOW_MS = 10 * 60_000
const FETCH_TIMEOUT_MS = 9000
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

type SyncBody = { sources?: unknown }

export async function POST(req: Request) {
  const user = await requireUser(req)
  if (!user) return Response.json({ error: 'Iniciá sesión para actualizar descuentos.' }, { status: 401 })
  if (rateLimited(`bank-discounts:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return Response.json({ error: 'Demasiadas actualizaciones. Esperá unos minutos.' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as SyncBody
  const sources = selectSources(body.sources)
  const results = await Promise.all(sources.map((source) => scrapeSource(source)))
  const discounts = results.flatMap((result) => result.discounts)

  return Response.json({
    discounts,
    syncedAt: new Date().toISOString(),
    sources: results.map(({ source, count, ok, error }) => ({
      id: source.id,
      bank: source.bank,
      label: source.label,
      url: source.url,
      count,
      ok,
      ...(error ? { error } : {}),
    })),
  })
}

function selectSources(value: unknown): BankDiscountSource[] {
  if (!Array.isArray(value) || value.length === 0) return BANK_DISCOUNT_SOURCES
  const ids = new Set(value.filter((item): item is string => typeof item === 'string'))
  const selected = BANK_DISCOUNT_SOURCES.filter((source) => ids.has(source.id))
  return selected.length > 0 ? selected : BANK_DISCOUNT_SOURCES
}

async function scrapeSource(source: BankDiscountSource) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const fetchWithHeaders: typeof fetch = (url, init) =>
    fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml,application/json', 'User-Agent': BROWSER_UA, ...init?.headers },
    })
  try {
    // Nación tiene datos estructurados propios (ver lib/bank-discounts.ts):
    // mucho más confiables que el parser de texto genérico de abajo.
    if (source.id === 'bna') {
      const discounts = await scrapeNacionSemanaNacion(source, fetchWithHeaders)
      return { source, discounts, count: discounts.length, ok: true }
    }
    const response = await fetchWithHeaders(source.url, { cache: 'no-store' })
    if (!response.ok) {
      return { source, discounts: [], count: 0, ok: false, error: `HTTP ${response.status}` }
    }
    const html = await response.text()
    const discounts = parseBankDiscounts(source, html)
    return { source, discounts, count: discounts.length, ok: true }
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'Tiempo de espera agotado' : 'No se pudo consultar'
    return { source, discounts: [], count: 0, ok: false, error: message }
  } finally {
    clearTimeout(timer)
  }
}
