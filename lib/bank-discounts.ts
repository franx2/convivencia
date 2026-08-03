export type BankDiscountSource = {
  id: string
  bank: string
  label: string
  url: string
  aliases: string[]
}

export type ScrapedBankDiscount = {
  source_key: string
  external_key: string
  bank: string
  title: string
  merchant: string | null
  category: string | null
  discount_percent: number | null
  installments: number | null
  cap_amount: number | null
  min_amount: number | null
  valid_from: string | null
  valid_to: string | null
  weekdays: string[]
  payment_method: string | null
  card_brand: string | null
  card_tier: string | null
  province: string | null
  terms_text: string
  source_url: string
  last_seen_at: string
}

export type BankDiscount = ScrapedBankDiscount & {
  id: string
  user_id: string
  created_at: string
}

// Fuentes publicas y acotadas. No se aceptan URLs enviadas por el cliente para
// evitar que este endpoint se convierta en un proxy hacia sitios internos.
export const BANK_DISCOUNT_SOURCES: BankDiscountSource[] = [
  {
    id: 'bbva',
    bank: 'BBVA',
    label: 'BBVA Beneficios',
    url: 'https://www.bbva.com.ar/beneficios/',
    aliases: ['bbva', 'banco bbva'],
  },
  {
    id: 'santander',
    bank: 'Santander',
    label: 'Santander Beneficios',
    url: 'https://www.santander.com.ar/personas/beneficios',
    aliases: ['santander', 'banco santander', 'rio'],
  },
  {
    id: 'bna',
    bank: 'Banco Nación',
    label: 'Semana Nación',
    // Sitio dedicado (Next.js) con datos estructurados propios: mucho más
    // confiable que el parser HTML genérico. Ver scrapeNacionSemanaNacion.
    url: 'https://semananacion.com.ar/semananacion',
    aliases: ['nacion', 'banco nacion', 'bna', 'nacion argentina'],
  },
  {
    id: 'macro',
    bank: 'Banco Macro',
    label: 'Macro Beneficios',
    url: 'https://www.macro.com.ar/beneficios/ahorros-y-cuotas',
    aliases: ['macro', 'banco macro'],
  },
  {
    id: 'provincia',
    bank: 'Banco Provincia',
    label: 'Banco Provincia Beneficios',
    url: 'https://www.bancoprovincia.com.ar/banca-personal/bazar_deco',
    aliases: ['provincia', 'banco provincia', 'bapro', 'banco de la provincia'],
  },
  {
    id: 'galicia',
    bank: 'Banco Galicia',
    label: 'Beneficios Galicia',
    url: 'https://beneficios.galicia.ar/',
    aliases: ['galicia', 'banco galicia', 'galicia mas'],
  },
  {
    id: 'patagonia',
    bank: 'Banco Patagonia',
    label: 'Patagonia Beneficios',
    url: 'https://www.bancopatagonia.com.ar/personas/beneficios-72hs.php',
    aliases: ['patagonia', 'banco patagonia', 'patagonia24', 'patagonia mas'],
  },
  {
    id: 'icbc',
    bank: 'ICBC',
    label: 'ICBC Beneficios',
    url: 'https://www.icbc.com.ar/personas/productos-servicios/tarjetas/',
    aliases: ['icbc', 'industrial and commercial bank of china'],
  },
  {
    id: 'supervielle',
    bank: 'Banco Supervielle',
    label: 'Supervielle Beneficios',
    url: 'https://static.supervielle.com.ar/personas/cuentas/liberte',
    aliases: ['supervielle', 'banco supervielle', 'iudu', 'cordial'],
  },
  {
    id: 'comafi',
    bank: 'Banco Comafi',
    label: 'Comafi Beneficios',
    url: 'https://www.comafi.com.ar/comafi-sueldo/',
    aliases: ['comafi', 'banco comafi', 'tevabien', 'te va bien'],
  },
]

export function sourceIdsForBanks(banks: Array<string | null | undefined>): string[] {
  const cleaned = banks.filter((bank): bank is string => Boolean(bank?.trim())).map(normalizeBankName)
  if (cleaned.length === 0) return []
  return BANK_DISCOUNT_SOURCES.filter((source) => {
    const sourceNames = [source.bank, ...source.aliases].map(normalizeBankName)
    return cleaned.some((bank) => sourceNames.some((sourceName) => namesMatch(bank, sourceName)))
  }).map((source) => source.id)
}

const MERCHANTS = [
  'Carrefour',
  'Coto',
  'Día',
  'Disco',
  'Jumbo',
  'La Anónima',
  'Changomás',
  'Vea',
  'Farmacity',
  'PedidosYa',
  'Shell',
  'YPF',
  'Axion',
  'Mercado Libre',
  'Tienda BNA+',
]

const CATEGORIES = [
  'supermercados',
  'mayoristas',
  'combustibles',
  'farmacias',
  'gastronomía',
  'indumentaria',
  'entretenimiento',
  'tecnología',
  'viajes',
  'hogar',
]

const WEEKDAYS = [
  ['lunes', 'lunes'],
  ['martes', 'martes'],
  ['miércoles', 'miercoles'],
  ['jueves', 'jueves'],
  ['viernes', 'viernes'],
  ['sábado', 'sabado'],
  ['domingo', 'domingo'],
] as const

export function parseBankDiscounts(source: BankDiscountSource, html: string, now = new Date()): ScrapedBankDiscount[] {
  const lines = htmlToLines(html)
  const candidates: ScrapedBankDiscount[] = []
  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!isPromotionLine(line)) continue

    const context = uniqueLines(lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 5)))
    const text = context.join(' ')
    if (isFinancialNoise(text)) continue

    const discountPercent = readPercent(text)
    const installments = readInstallments(text)
    if (discountPercent === null && installments === null) continue

    const merchant = findKnownValue(text, MERCHANTS)
    const category = findKnownValue(text, CATEGORIES)
    const { validFrom, validTo } = readDateRange(text)
    const title = buildTitle(line, merchant, category, discountPercent, installments, source.bank)
    const externalKey = slugify(
      [source.id, title, merchant ?? '', validFrom ?? '', validTo ?? ''].join('|')
    )
    if (seen.has(externalKey)) continue
    seen.add(externalKey)

    candidates.push({
      source_key: source.id,
      external_key: externalKey,
      bank: source.bank,
      title,
      merchant,
      category,
      discount_percent: discountPercent,
      installments,
      cap_amount: readAmountAfter(text, ['tope', 'límite', 'limite', 'máximo', 'maximo']),
      min_amount: readAmountAfter(text, ['mínimo', 'minimo', 'compra mínima', 'compra minima']),
      valid_from: validFrom,
      valid_to: validTo,
      weekdays: readWeekdays(text),
      payment_method: readPaymentMethod(text),
      card_brand: readCardBrand(text),
      card_tier: readCardTier(text),
      province: readProvince(text),
      terms_text: text.slice(0, 700),
      source_url: source.url,
      last_seen_at: now.toISOString(),
    })
  }

  return candidates.slice(0, 80)
}

function isPromotionLine(line: string): boolean {
  return /\b\d{1,3}\s*%|cuotas?\s+sin\s+inter[eé]s|reintegro|descuento|beneficio/i.test(line)
}

function isFinancialNoise(text: string): boolean {
  const isBenefit = /\b(?:descuento|reintegro|cuotas?|ahorr[aá]|beneficio)\b/i.test(text)
  return !isBenefit && /\b(?:tna|cft|pr[eé]stamo|préstamos|tasa de inter[eé]s|capital invertido)\b/i.test(text)
}

function htmlToLines(html: string): string[] {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  const withBreaks = withoutNoise.replace(/<\/(?:h[1-6]|p|li|div|section|article|a|br|tr|td)[^>]*>/gi, '\n')
  const plain = decodeEntities(withBreaks.replace(/<[^>]+>/g, ' '))
  return plain
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 3 && line.length <= 260)
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
}

function uniqueLines(lines: string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))]
}

function readPercent(text: string): number | null {
  const values = [...text.matchAll(/(?:hasta|descuento|reintegro|ahorr[aá]|beneficio)?\s*(\d{1,3})\s*%/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => value > 0 && value <= 100)
  return values[0] ?? null
}

function readInstallments(text: string): number | null {
  const match = text.match(/(\d{1,2})\s+cuotas?(?:\s+sin\s+inter[eé]s)?/i)
  return match ? validInstallments(Number(match[1])) : null
}

function validPercent(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100 ? value : null
}

function validInstallments(value: number): number | null {
  return Number.isInteger(value) && value > 0 && value <= 60 ? value : null
}

function readAmountAfter(text: string, markers: string[]): number | null {
  const marker = markers.join('|')
  const match = text.match(new RegExp(`(?:${marker})[^$]{0,50}\\$\\s*([\\d.]+(?:,\\d{1,2})?)`, 'i'))
  if (!match) return null
  const normalized = match[1].replace(/\./g, '').replace(',', '.')
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 ? value : null
}

function readDateRange(text: string): { validFrom: string | null; validTo: string | null } {
  const match = text.match(
    /(?:del|desde)\s+(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\s+(?:al|hasta)\s+(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})/i
  )
  if (match) {
    return {
      validFrom: isoDate(Number(match[3]), Number(match[2]), Number(match[1])),
      validTo: isoDate(Number(match[6]), Number(match[5]), Number(match[4])),
    }
  }

  const words = text.match(
    /(?:del|desde)\s+(?:el\s+)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(20\d{2}))?\s+(?:al|hasta)\s+(?:el\s+)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(20\d{2})/i
  )
  if (!words) return { validFrom: null, validTo: null }
  const endYear = Number(words[6])
  const fromMonth = monthNumber(words[2])
  const toMonth = monthNumber(words[5])
  if (!fromMonth || !toMonth) return { validFrom: null, validTo: null }
  const startYear = words[3] ? Number(words[3]) : endYear
  return {
    validFrom: isoDate(startYear, fromMonth, Number(words[1])),
    validTo: isoDate(endYear, toMonth, Number(words[4])),
  }
}

function monthNumber(value: string): number | null {
  const months: Record<string, number> = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  }
  return months[normalize(value)] ?? null
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null
}

function readWeekdays(text: string): string[] {
  const normalized = normalize(text)
  if (normalized.includes('todos los dias') || normalized.includes('cada dia')) {
    return WEEKDAYS.map(([, value]) => value)
  }
  return WEEKDAYS.filter(([label]) => normalized.includes(normalize(label))).map(([, value]) => value)
}

function readPaymentMethod(text: string): string | null {
  const match = text.match(/(?:pagando exclusivamente con|abonando con|pagar exclusivamente con|pagar con)\s+(.{3,100})/i)
  return match ? match[1].replace(/[.;].*$/, '').trim() : null
}

function readCardBrand(text: string): string | null {
  const match = text.match(/\b(Visa|Mastercard|American Express|Amex)\b/i)
  return match ? match[1] : null
}

function readCardTier(text: string): string | null {
  const match = text.match(/\b(Black|Platinum|Signature|Gold|Classic|Internacional)\b/i)
  return match ? match[1] : null
}

function readProvince(text: string): string | null {
  const provinces = ['CABA', 'Buenos Aires', 'Córdoba', 'Mendoza', 'Santa Fe', 'Neuquén', 'San Luis']
  return findKnownValue(text, provinces)
}

function findKnownValue(text: string, values: string[]): string | null {
  const normalized = normalize(text)
  return values.find((value) => normalized.includes(normalize(value))) ?? null
}

function buildTitle(
  line: string,
  merchant: string | null,
  category: string | null,
  percent: number | null,
  installments: number | null,
  bank: string
): string {
  const compact = line.replace(/[.;:]+$/, '').trim()
  if (compact.length >= 6 && !/^\d[\d\s%$.,-]*$/.test(compact)) return compact.slice(0, 120)
  const place = merchant ?? category ?? 'comercios adheridos'
  const benefit = percent ? `${percent}% de descuento` : `${installments} cuotas sin interés`
  return `${benefit} en ${place} · ${bank}`
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%$]+/g, ' ')
    .trim()
}

function normalizeBankName(value: string): string {
  return normalize(value).replace(/\b(?:banco|tarjeta|visa|mastercard|amex|americanexpress)\b/g, '').replace(/\s+/g, '')
}

function namesMatch(a: string, b: string): boolean {
  return Boolean(a && b) && (a === b || a.includes(b) || b.includes(a))
}

function slugify(value: string): string {
  return normalize(value).replace(/[%$]/g, '').replace(/\s+/g, '-').slice(0, 180) || 'promo'
}

// ---------------------------------------------------------------------------
// Banco Nación (fuente estructurada): semananacion.com.ar es un sitio Next.js
// dedicado que expone sus propios datos de promos vía su endpoint interno
// _next/data/<buildId>/semananacion.json. Es mucho más confiable que el
// parser de texto genérico de arriba (campos exactos: día, categoría, %,
// cuotas, fechas). El buildId cambia con cada deploy de ellos, así que se
// saca en cada corrida parseando el HTML de la página, no se hardcodea.
// ---------------------------------------------------------------------------

const NACION_DAY_ES: Record<string, string> = {
  MO: 'lunes',
  TU: 'martes',
  WE: 'miercoles',
  TH: 'jueves',
  FR: 'viernes',
  SA: 'sabado',
  SU: 'domingo',
}

type NacionPromotion = {
  name?: string
  promotionTitle?: string
  categories?: { label?: string }[]
  activeDays?: string[]
  startDate?: string
  endDate?: string
  incentive?: {
    discount?: { value?: number }
    installment?: { value?: number[] }
  }
  promotionProducts?: string[]
  url?: string
}

export async function scrapeNacionSemanaNacion(
  source: BankDiscountSource,
  fetchImpl: typeof fetch,
  now = new Date()
): Promise<ScrapedBankDiscount[]> {
  const pageRes = await fetchImpl(source.url, { cache: 'no-store' })
  if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`)
  const html = await pageRes.text()
  const buildId = html.match(/"buildId":"([^"]+)"/)?.[1]
  if (!buildId) throw new Error('No se encontró buildId de semananacion.com.ar')

  const dataRes = await fetchImpl(
    `https://semananacion.com.ar/_next/data/${buildId}/semananacion.json?parameters=semananacion`,
    { cache: 'no-store' }
  )
  if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status} (data)`)
  const json: unknown = await dataRes.json()

  const promotions = collectNacionPromotions(json)
  const seen = new Set<string>()
  const out: ScrapedBankDiscount[] = []
  for (const p of promotions) {
    const key = p.name || p.promotionTitle
    if (!key || seen.has(key)) continue
    seen.add(key)

    const days = (p.activeDays ?? []).map((d) => NACION_DAY_ES[d]).filter((d): d is string => Boolean(d))
    const installVals = (p.incentive?.installment?.value ?? [])
      .map(validInstallments)
      .filter((value): value is number => value !== null)
    const url = p.url && /^https?:\/\//.test(p.url) ? p.url : source.url

    out.push({
      source_key: source.id,
      external_key: key,
      bank: source.bank,
      title: p.promotionTitle ?? 'Promoción',
      merchant: null,
      category: p.categories?.[0]?.label ?? null,
      discount_percent: validPercent(p.incentive?.discount?.value),
      installments: installVals.length ? Math.max(...installVals) : null,
      cap_amount: null,
      min_amount: null,
      valid_from: p.startDate ? p.startDate.slice(0, 10) : null,
      valid_to: p.endDate ? p.endDate.slice(0, 10) : null,
      // días completos: igual convención que readWeekdays() (7 valores, no vacío)
      weekdays: days.length === 7 ? WEEKDAYS.map(([, v]) => v) : days,
      payment_method: (p.promotionProducts ?? []).includes('modo') ? 'MODO' : null,
      card_brand: nacionCardBrand(p.promotionProducts ?? []),
      card_tier: null,
      province: null,
      terms_text: [p.promotionTitle, p.categories?.[0]?.label].filter(Boolean).join(' · '),
      source_url: url,
      last_seen_at: now.toISOString(),
    })
  }
  return out.slice(0, 80)
}

function collectNacionPromotions(node: unknown, acc: NacionPromotion[] = []): NacionPromotion[] {
  if (Array.isArray(node)) {
    const first = node[0]
    if (first && typeof first === 'object' && 'promotionTitle' in first) {
      acc.push(...(node as NacionPromotion[]))
    }
    for (const item of node) collectNacionPromotions(item, acc)
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectNacionPromotions(value, acc)
  }
  return acc
}

function nacionCardBrand(products: string[]): string | null {
  const brands: string[] = []
  if (products.some((p) => p.startsWith('visa'))) brands.push('Visa')
  if (products.some((p) => p.startsWith('mc-'))) brands.push('Mastercard')
  if (products.some((p) => p.startsWith('amex'))) brands.push('Amex')
  return brands.length ? brands.join('/') : null
}
