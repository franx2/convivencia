import { rateLimited, requireUser } from '@/lib/api-auth'

// Vea y Changomas corren sobre VTEX y exponen la API de catálogo pública que
// usa su propio buscador (sin auth, sin scraping/browser headless: es la misma
// data que ve cualquier visitante en la búsqueda del sitio).
export const runtime = 'nodejs'
export const maxDuration = 15

const RATE_LIMIT = 20 // requests por ventana y por usuario
const RATE_WINDOW_MS = 60_000
const FETCH_TIMEOUT_MS = 7000
const RESULTS_PER_STORE = 5

const STORES: { store: string; host: string }[] = [
  { store: 'Vea', host: 'www.vea.com.ar' },
  { store: 'Changomas', host: 'www.masonline.com.ar' },
  { store: 'Carrefour', host: 'www.carrefour.com.ar' },
]

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

type PriceResult = {
  store: string
  name: string
  price: number | null
  image: string | null
  url: string
}

type VtexOffer = { Price?: number; IsAvailable?: boolean }
type VtexItem = { images?: { imageUrl?: string }[]; sellers?: { commertialOffer?: VtexOffer }[] }
type VtexProduct = { productName?: string; linkText?: string; items?: VtexItem[] }

export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return Response.json({ error: 'Iniciá sesión para buscar precios.' }, { status: 401 })
  if (rateLimited(`price:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return Response.json({ error: 'Demasiadas búsquedas. Esperá un minuto.' }, { status: 429 })
  }

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80)
  if (!q) return Response.json({ error: 'Falta el término de búsqueda.' }, { status: 400 })

  // Si el usuario eligió supermercados preferidos (onboarding/Configuración),
  // buscamos solo ahí; sin preferencia guardada, buscamos en todos.
  const preferred = user.metadata.preferred_stores
  const activeStores =
    Array.isArray(preferred) && preferred.length > 0
      ? STORES.filter((s) => preferred.includes(s.store))
      : STORES

  const settled = await Promise.allSettled(activeStores.map((s) => searchStore(s, q)))
  const results = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  results.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
  return Response.json({ results })
}

async function searchStore({ store, host }: { store: string; host: string }, q: string): Promise<PriceResult[]> {
  const url = `https://${host}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(q)}&_from=0&_to=${RESULTS_PER_STORE - 1}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA },
    })
    if (!res.ok) return []
    const data = (await res.json()) as unknown
    if (!Array.isArray(data)) return []
    return (data as VtexProduct[]).map((p) => normalize(store, host, p))
  } catch {
    return [] // sitio caído/lento/bloqueó el request: no rompe la búsqueda del otro súper
  } finally {
    clearTimeout(timer)
  }
}

function normalize(store: string, host: string, p: VtexProduct): PriceResult {
  const item = p.items?.[0]
  const offer =
    item?.sellers?.find((s) => s.commertialOffer?.IsAvailable)?.commertialOffer ?? item?.sellers?.[0]?.commertialOffer
  const price = typeof offer?.Price === 'number' && offer.Price > 0 ? offer.Price : null
  return {
    store,
    name: p.productName ?? 'Producto',
    price,
    image: item?.images?.[0]?.imageUrl ?? null,
    url: p.linkText ? `https://${host}/${p.linkText}/p` : `https://${host}`,
  }
}
