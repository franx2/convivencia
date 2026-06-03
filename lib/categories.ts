// Categorias fijas pensadas para convivientes (parejas / familias).
// `color`: clases Tailwind para chips. `hex`: color sólido para gráficos SVG.
export const EXPENSE_CATEGORIES = [
  { value: 'supermercado', label: 'Supermercado', symbol: '🛒', color: 'bg-emerald-100 text-emerald-700', hex: '#10b981' },
  { value: 'alquiler', label: 'Alquiler', symbol: '🏠', color: 'bg-violet-100 text-violet-700', hex: '#8b5cf6' },
  { value: 'servicios', label: 'Servicios', symbol: '💡', color: 'bg-amber-100 text-amber-700', hex: '#f59e0b' },
  { value: 'comida', label: 'Comida / Delivery', symbol: '🍽️', color: 'bg-orange-100 text-orange-700', hex: '#f97316' },
  { value: 'transporte', label: 'Transporte', symbol: '🚕', color: 'bg-sky-100 text-sky-700', hex: '#0ea5e9' },
  { value: 'hogar', label: 'Hogar', symbol: '🧹', color: 'bg-teal-100 text-teal-700', hex: '#14b8a6' },
  { value: 'salud', label: 'Salud', symbol: '⚕️', color: 'bg-red-100 text-red-700', hex: '#ef4444' },
  { value: 'ocio', label: 'Ocio', symbol: '🎮', color: 'bg-indigo-100 text-indigo-700', hex: '#6366f1' },
  { value: 'indumentaria', label: 'Indumentaria', symbol: '👕', color: 'bg-pink-100 text-pink-700', hex: '#ec4899' },
  { value: 'educacion', label: 'Educación', symbol: '🎓', color: 'bg-blue-100 text-blue-700', hex: '#3b82f6' },
  { value: 'mascotas', label: 'Mascotas', symbol: '🐾', color: 'bg-lime-100 text-lime-700', hex: '#65a30d' },
  { value: 'viajes', label: 'Viajes', symbol: '✈️', color: 'bg-cyan-100 text-cyan-700', hex: '#06b6d4' },
  { value: 'impuestos', label: 'Impuestos', symbol: '🧾', color: 'bg-yellow-100 text-yellow-700', hex: '#eab308' },
  { value: 'seguros', label: 'Seguros', symbol: '🛡️', color: 'bg-slate-100 text-slate-700', hex: '#64748b' },
  { value: 'suscripciones', label: 'Suscripciones', symbol: '▶️', color: 'bg-fuchsia-100 text-fuchsia-700', hex: '#d946ef' },
  { value: 'tecnologia', label: 'Tecnología', symbol: '💻', color: 'bg-blue-100 text-blue-700', hex: '#2563eb' },
  { value: 'belleza', label: 'Belleza', symbol: '✨', color: 'bg-rose-100 text-rose-700', hex: '#f43f5e' },
  { value: 'regalos', label: 'Regalos', symbol: '🎁', color: 'bg-purple-100 text-purple-700', hex: '#a855f7' },
  { value: 'deportes', label: 'Deportes', symbol: '⚽', color: 'bg-green-100 text-green-700', hex: '#22c55e' },
  { value: 'bebes-ninos', label: 'Bebés / Niños', symbol: '🧸', color: 'bg-orange-100 text-orange-700', hex: '#fb923c' },
  { value: 'trabajo', label: 'Trabajo', symbol: '💼', color: 'bg-stone-100 text-stone-700', hex: '#78716c' },
  { value: 'banco-comisiones', label: 'Banco / Comisiones', symbol: '🏦', color: 'bg-zinc-100 text-zinc-700', hex: '#71717a' },
  { value: 'otros', label: 'Otros', symbol: '•', color: 'bg-slate-100 text-slate-600', hex: '#94a3b8' },
] as const

export type CategoryValue = (typeof EXPENSE_CATEGORIES)[number]['value']

export const DEFAULT_CATEGORY: CategoryValue = 'otros'

/** Forma minima de una categoria para render (preset o personalizada). */
export type CatMeta = { value: string; label: string; symbol: string; color: string; hex: string }
type CatMetaInput = Omit<CatMeta, 'symbol'> & { symbol?: string }

// Paleta para asignar color/hex a las categorias que crea el usuario.
export const CATEGORY_PALETTE: { color: string; hex: string }[] = [
  { color: 'bg-teal-100 text-teal-700', hex: '#14b8a6' },
  { color: 'bg-rose-100 text-rose-700', hex: '#f43f5e' },
  { color: 'bg-lime-100 text-lime-700', hex: '#65a30d' },
  { color: 'bg-cyan-100 text-cyan-700', hex: '#06b6d4' },
  { color: 'bg-violet-100 text-violet-700', hex: '#8b5cf6' },
  { color: 'bg-fuchsia-100 text-fuchsia-700', hex: '#d946ef' },
  { color: 'bg-yellow-100 text-yellow-700', hex: '#eab308' },
  { color: 'bg-blue-100 text-blue-700', hex: '#3b82f6' },
]

export function paletteAt(i: number) {
  return CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]
}

/** Slug ASCII a partir del nombre escrito por el usuario. */
export function slugifyCategory(label: string): string {
  const s = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return s || 'categoria'
}

const SYMBOL_RULES: { symbol: string; words: string[] }[] = [
  { symbol: '🛒', words: ['super', 'mercado', 'verduler', 'almacen', 'despensa'] },
  { symbol: '🏠', words: ['alquiler', 'renta', 'casa', 'depto', 'departamento'] },
  { symbol: '💡', words: ['luz', 'gas', 'agua', 'internet', 'servicio', 'telefono', 'expensa'] },
  { symbol: '🍽️', words: ['comida', 'delivery', 'restaurant', 'resto', 'bar', 'cafe', 'pizza', 'helado'] },
  { symbol: '🚕', words: ['transporte', 'uber', 'taxi', 'sube', 'nafta', 'peaje', 'auto'] },
  { symbol: '⚕️', words: ['salud', 'farmacia', 'medico', 'kinesio', 'dentista', 'prepaga'] },
  { symbol: '👕', words: ['ropa', 'indumentaria', 'zapatilla', 'zapato', 'moda'] },
  { symbol: '🎓', words: ['educacion', 'curso', 'clase', 'colegio', 'facultad', 'universidad'] },
  { symbol: '🐾', words: ['mascota', 'perro', 'gato', 'veterinaria', 'pet'] },
  { symbol: '✈️', words: ['viaje', 'hotel', 'vuelo', 'turismo', 'pasaje'] },
  { symbol: '🧾', words: ['impuesto', 'afip', 'arca', 'monotributo', 'rentas', 'patente'] },
  { symbol: '🛡️', words: ['seguro', 'aseguradora', 'poliza'] },
  { symbol: '▶️', words: ['suscripcion', 'netflix', 'spotify', 'prime', 'disney', 'hbo', 'youtube'] },
  { symbol: '💻', words: ['tecnologia', 'software', 'celular', 'notebook', 'computadora'] },
  { symbol: '✨', words: ['belleza', 'peluqueria', 'cosmetica', 'perfume', 'spa'] },
  { symbol: '🎁', words: ['regalo', 'cumple', 'floreria', 'juguete'] },
  { symbol: '⚽', words: ['deporte', 'gimnasio', 'gym', 'fitness', 'club'] },
  { symbol: '🧸', words: ['bebe', 'nino', 'niño', 'chico', 'jardin', 'pañal', 'panal'] },
  { symbol: '💼', words: ['trabajo', 'oficina', 'cowork', 'hosting', 'dominio'] },
  { symbol: '🏦', words: ['banco', 'comision', 'comisión', 'cajero', 'atm'] },
]

export function categorySymbol(value: string, label = value): string {
  const text = `${value} ${label}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

  const preset = EXPENSE_CATEGORIES.find((c) => c.value === value)
  if (preset) return preset.symbol

  const rule = SYMBOL_RULES.find((r) => r.words.some((w) => text.includes(w)))
  if (rule) return rule.symbol

  const first = label.trim().charAt(0).toUpperCase()
  return first || '•'
}

function withSymbol(c: CatMetaInput): CatMeta {
  return { ...c, symbol: c.symbol ?? categorySymbol(c.value, c.label) }
}

const FALLBACK_META = (value: string): CatMeta => ({
  value,
  label: value,
  symbol: categorySymbol(value),
  color: 'bg-slate-100 text-slate-600',
  hex: '#94a3b8',
})

export function categoryMeta(value: string): CatMeta {
  return EXPENSE_CATEGORIES.find((c) => c.value === value) ?? FALLBACK_META(value)
}

/** Presets + personalizadas del grupo (las custom se agregan al final). */
export function mergeCategories(custom: CatMetaInput[]): CatMeta[] {
  const presets: CatMeta[] = EXPENSE_CATEGORIES.map((c) => withSymbol(c))
  const seen = new Set(presets.map((c) => c.value))
  return [...presets, ...custom.filter((c) => !seen.has(c.value)).map((c) => withSymbol(c))]
}

/** Busca la meta de una categoria en una lista ya mergeada (con fallback). */
export function metaFrom(list: CatMeta[], value: string): CatMeta {
  return list.find((c) => c.value === value) ?? FALLBACK_META(value)
}

// Palabras clave -> categoria preset (orden = prioridad). Pensado para AR.
const CATEGORY_KEYWORDS: { cat: CategoryValue; words: string[] }[] = [
  { cat: 'supermercado', words: ['super', 'mercado', 'coto', 'carrefour', 'jumbo', 'dia ', 'walmart', 'changomas', 'hiper', 'chino', 'verduler', 'granja', 'almacen', 'despensa', 'compras'] },
  { cat: 'transporte', words: ['uber', 'cabify', 'didi', 'nafta', 'combustible', 'sube', 'colectivo', 'subte', 'tren', 'taxi', 'peaje', 'ypf', 'shell', 'estacion', 'auto'] },
  { cat: 'comida', words: ['delivery', 'rappi', 'pedidosya', 'pedidos ya', 'mcdonald', 'burger', 'pizza', 'resto', 'restaurant', 'fonda', 'bar', 'cafe', 'helado', 'panaderia', 'nostrano', 'sushi', 'empanada'] },
  { cat: 'servicios', words: ['luz', 'gas', 'agua', 'internet', 'edenor', 'edesur', 'metrogas', 'aysa', 'expensas', 'telefono', 'celular', 'cable', 'netflix', 'spotify', 'abono', 'wifi'] },
  { cat: 'alquiler', words: ['alquiler', 'renta'] },
  { cat: 'salud', words: ['farmacia', 'medico', 'remedio', 'dentista', 'hospital', 'obra social', 'prepaga'] },
  { cat: 'hogar', words: ['ferreteria', 'muebles', 'deco', 'sodimac', 'easy', 'limpieza', 'electrodomestico', 'pinturer', 'pinture'] },
  { cat: 'indumentaria', words: ['ropa', 'zapatilla', 'zapato', 'indumentaria', 'moda', 'tienda', 'showroom', 'nike', 'adidas', 'zara', 'jean', 'camisa'] },
  { cat: 'educacion', words: ['curso', 'facultad', 'universidad', 'colegio', 'escuela', 'clase', 'libro', 'udemy', 'coder', 'educacion', 'matricula'] },
  { cat: 'mascotas', words: ['veterinaria', 'veterinario', 'mascota', 'perro', 'gato', 'pet', 'forrajeria', 'alimento balanceado'] },
  { cat: 'viajes', words: ['hotel', 'airbnb', 'booking', 'vuelo', 'aerolineas', 'jetsmart', 'flybondi', 'micro', 'pasaje', 'turismo', 'viaje'] },
  { cat: 'impuestos', words: ['afip', 'arca', 'monotributo', 'rentas', 'abl', 'patente', 'impuesto', 'municipalidad'] },
  { cat: 'seguros', words: ['seguro', 'aseguradora', 'sancor seguros', 'zurich', 'mapfre', 'federacion patronal', 'poliza'] },
  { cat: 'suscripciones', words: ['suscripcion', 'subscription', 'prime', 'disney', 'hbo', 'max', 'youtube', 'openai', 'chatgpt', 'google', 'icloud'] },
  { cat: 'tecnologia', words: ['mercadolibre', 'mercado libre', 'garbarino', 'fravega', 'compumundo', 'apple', 'samsung', 'notebook', 'celular', 'software'] },
  { cat: 'belleza', words: ['peluqueria', 'barberia', 'cosmetica', 'perfume', 'maquillaje', 'estetica', 'spa', 'uñas', 'unas'] },
  { cat: 'regalos', words: ['regalo', 'floreria', 'jugueteria', 'cumple', 'gift'] },
  { cat: 'deportes', words: ['gimnasio', 'gym', 'sport', 'deporte', 'club', 'cancha', 'fitness', 'natacion'] },
  { cat: 'bebes-ninos', words: ['bebe', 'bebé', 'pañal', 'panal', 'jardin', 'jardín', 'niño', 'nino', 'chicos', 'juguete'] },
  { cat: 'trabajo', words: ['oficina', 'cowork', 'libreria', 'papeleria', 'insumo', 'honorario', 'hosting', 'dominio'] },
  { cat: 'banco-comisiones', words: ['comision', 'comisión', 'mantenimiento cuenta', 'interes', 'interés', 'banco', 'atm', 'cajero'] },
  { cat: 'ocio', words: ['cine', 'teatro', 'salida', 'regalo', 'viaje', 'finde', 'entrada', 'juego', 'gimnasio', 'gym', 'recital'] },
]

/**
 * Sugiere una categoria para un gasto segun su titulo: primero por historial
 * (titulos parecidos del grupo) y si no, por palabras clave. Devuelve el slug
 * o null si no hay pista. La eleccion final siempre la decide el usuario.
 */
export function suggestCategory(
  title: string,
  history: { title: string; category: string }[]
): string | null {
  const t = title.trim().toLowerCase()
  if (!t) return null

  const matches = history.filter((h) => {
    const ht = (h.title ?? '').trim().toLowerCase()
    if (!ht) return false
    if (ht === t) return true
    return t.length >= 3 && (ht.includes(t) || t.includes(ht))
  })
  if (matches.length) {
    const count = new Map<string, number>()
    for (const m of matches) count.set(m.category, (count.get(m.category) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }

  for (const k of CATEGORY_KEYWORDS) {
    if (k.words.some((w) => t.includes(w))) return k.cat
  }
  return null
}
