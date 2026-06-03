import { suggestCategory } from './categories'

export type ParsedTx = {
  date: string // YYYY-MM-DD
  title: string
  amount: number
  category: string
  currency: 'ARS' | 'USD' // moneda del consumo (USD = consumo en dólares)
  bank: string | null // emisor del resumen
  card: string | null // tarjeta del consumo (red + últimos dígitos)
}

export type StatementTotals = { ars: number | null; usd: number | null }

const PDFJS_VERSION = '4.10.38'

/**
 * Extrae el texto de un PDF en el navegador con pdfjs, agrupando los items por
 * coordenada Y para reconstruir líneas (clave para parsear un resumen). El
 * worker se sirve desde CDN para evitar problemas de bundling con Next.
 */
export async function extractPdfLines(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`
  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const lines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const rows = new Map<number, { x: number; s: string }[]>()
    for (const it of content.items) {
      if (!('str' in it) || !it.str) continue
      const y = Math.round(it.transform[5])
      const arr = rows.get(y) ?? []
      arr.push({ x: it.transform[4], s: it.str })
      rows.set(y, arr)
    }
    const ys = [...rows.keys()].sort((a, b) => b - a) // arriba -> abajo
    for (const y of ys) {
      const arr = rows.get(y)!.sort((a, b) => a.x - b.x)
      const line = arr
        .map((a) => a.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (line) lines.push(line)
    }
  }
  return lines
}

const DATE_NUM_RE = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/
const MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
}
const DATE_MON_RE = /^(\d{1,2})[ /.\-]([a-zñ]{3})[a-zñ]*\.?(?:[ /.\-](\d{2,4}))?/i
// montos formato AR (1.234,56) o simples (1234.56)
const MONEY_RE = /-?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}|-?\$?\s?\d+\.\d{2}/g
// líneas que NO son consumos (pagos, impuestos, totales, intereses)
const IGNORE_LINE_RE =
  /\b(SU PAGO|PAGO MINIMO|PAGO MÍNIMO|SALDO ANTERIOR|SALDO ACTUAL|TOTAL A PAGAR|TOTAL CONSUMOS|TOTAL DE CONSUMOS|TOTAL CONSUMO|DEV\.?\s?IMP|DB\.?\s?RG|CR\.?\s?RG|IMPUESTO|PERCEPCION|PERCEPCIÓN|INTERES|\bIVA\b|REDONDEO|ANTICIPO|ADELANTO|VENCIMIENTO|LIMITE\s+DE\s+COMPRA)\b/i
// marca de moneda extranjera: el consumo se factura en USD (columna dólares)
const FOREIGN_MARK_RE = /\bCLP\b|\bBRL\b|\bEUR\b|\bUYU\b|\bGBP\b|U\$S|US\$|\bUSD\b|D[OÓ]LARES?|BUSD/i
const CURRENCY_BEFORE_RE = /(CLP|BRL|EUR|UYU|GBP|U\$S|US\$|USD|BUSD)\s*$/i
const TOTAL_RE = /total\s+(de\s+)?consumos?/i

const BANKS: [RegExp, string][] = [
  [/\bgalicia\b/i, 'Galicia'],
  [/\bsantander\b/i, 'Santander'],
  [/\bBBVA\b|\bfrances\b/i, 'BBVA'],
  [/banco\s+naci[oó]n|\bBNA\b/i, 'Nación'],
  [/\bmacro\b/i, 'Macro'],
  [/\bICBC\b/i, 'ICBC'],
  [/\bHSBC\b/i, 'HSBC'],
  [/supervielle/i, 'Supervielle'],
  [/patagonia/i, 'Patagonia'],
  [/\bcomafi\b/i, 'Comafi'],
  [/\bnaranja\b/i, 'Naranja'],
  [/brubank/i, 'Brubank'],
  [/ual[áa]\b/i, 'Ualá'],
  [/mercado\s*pago/i, 'Mercado Pago'],
]

function parseMoney(s: string): number {
  let t = s.replace(/[$\s]/g, '')
  const neg = t.startsWith('-')
  t = t.replace(/^-/, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? (neg ? -n : n) : NaN
}

function parseDate(line: string, fallbackYear: number): { date: string; rest: string } | null {
  const num = line.match(DATE_NUM_RE)
  if (num) {
    const dd = num[1].padStart(2, '0')
    const mm = num[2].padStart(2, '0')
    const monthNum = Number(mm)
    if (monthNum < 1 || monthNum > 12) return null
    let yy = num[3] ? num[3] : String(fallbackYear)
    if (yy.length === 2) yy = '20' + yy
    return { date: `${yy}-${mm}-${dd}`, rest: line.slice(num[0].length) }
  }
  const mon = line.match(DATE_MON_RE)
  if (mon) {
    const monthNum = MONTHS[mon[2].toLowerCase()]
    if (!monthNum) return null
    const dd = mon[1].padStart(2, '0')
    const mm = String(monthNum).padStart(2, '0')
    let yy = mon[3] ? mon[3] : String(fallbackYear)
    if (yy.length === 2) yy = '20' + yy
    return { date: `${yy}-${mm}-${dd}`, rest: line.slice(mon[0].length) }
  }
  return null
}

// En un consumo en el exterior, el importe FACTURADO en USD es el monto que NO
// está precedido por el código de moneda (ese es el monto original).
function billedUsdAmount(line: string): number | null {
  const re = /-?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}|-?\$?\s?\d+\.\d{2}/g
  let m: RegExpExecArray | null
  let billed: number | null = null
  while ((m = re.exec(line))) {
    const before = line.slice(Math.max(0, m.index - 7), m.index)
    if (CURRENCY_BEFORE_RE.test(before)) continue // monto original, no el facturado
    billed = parseMoney(m[0])
  }
  return billed
}

function lastAmount(line: string): number | null {
  const ms = line.match(MONEY_RE)
  return ms && ms.length ? parseMoney(ms[ms.length - 1]) : null
}

function cleanTitle(s: string): string {
  const t = s
    .replace(/^\s*[*K]\s+/i, '') // marca * / K
    .replace(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g, '') // montos sobrantes (original)
    .replace(/\b\d+\.\d{2}\b/g, '')
    .replace(/\bCLP\b|\bBRL\b|\bEUR\b|\bUYU\b|\bGBP\b|U\$S|US\$|\bUSD\b|BUSD|D[OÓ]LARES?/gi, '')
    .replace(/\b\d{2}\/\d{2}\b/g, '') // cuota 04/06
    .replace(/\b\d{5,}\b/g, '') // comprobante
    .replace(/\s+/g, ' ')
    .replace(/[\-|*]+\s*$/, '')
    .trim()
  return t || 'Gasto'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function detectBank(lines: string[]): string | null {
  const text = lines.join(' ')
  for (const [re, name] of BANKS) if (re.test(text)) return name
  const m = text.match(/banco\s+([A-Za-zÁÉÍÓÚÑñ]{3,})/i)
  return m ? capitalize(m[1]) : null
}

function detectCard(lines: string[]): string | null {
  const text = lines.join(' ')
  const net = (text.match(/\b(visa|mastercard|master|amex|cabal)\b/i)?.[1] ?? '').toUpperCase()
  const network = net === 'MASTER' ? 'MASTERCARD' : net
  const cards = [...text.matchAll(/tarjeta\s+(?:[a-zñ]+\s+)*\*?\s*(\d{3,6})\b/gi)].map((m) => m[1])
  const uniq = [...new Set(cards)]
  if (uniq.length === 1) return network ? `${network} ${uniq[0]}` : uniq[0]
  return network || null
}

/**
 * Parser best-effort de un resumen de tarjeta (formato AR, dos columnas
 * pesos/dólares como Galicia VISA). Detecta consumos en USD (marca de moneda
 * extranjera; el importe facturado va en la columna dólares y puede caer en la
 * línea siguiente), banco y tarjeta. El usuario revisa/edita antes de guardar.
 */
export function parseTransactions(lines: string[], fallbackYear: number): ParsedTx[] {
  const bank = detectBank(lines)
  const card = detectCard(lines)
  const out: ParsedTx[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (IGNORE_LINE_RE.test(line)) continue

    const d = parseDate(line, fallbackYear)
    if (!d) continue

    const foreign = FOREIGN_MARK_RE.test(line)
    let amount: number | null
    let currency: 'ARS' | 'USD'

    if (foreign) {
      currency = 'USD'
      amount = billedUsdAmount(line)
      if (amount === null) {
        // el importe en USD puede estar en la línea siguiente (fila partida)
        const next = lines[i + 1]
        if (next && !parseDate(next, fallbackYear) && /^[\d\s.,$\-]+$/.test(next.trim())) {
          amount = lastAmount(next)
          if (amount !== null) i++ // consumimos la continuación
        }
      }
    } else {
      currency = 'ARS'
      amount = lastAmount(line)
    }

    if (amount === null || !Number.isFinite(amount) || amount === 0) continue

    // título: lo que está antes del último monto de la línea
    let title = d.rest
    const ms = title.match(MONEY_RE)
    if (ms && ms.length) {
      const idx = title.lastIndexOf(ms[ms.length - 1])
      if (idx >= 0) title = title.slice(0, idx)
    }
    title = cleanTitle(title)

    out.push({
      date: d.date,
      title,
      amount,
      category: suggestCategory(title, []) ?? 'otros',
      currency,
      bank,
      card,
    })
  }
  return out
}

/**
 * Busca el "Total de consumos" del resumen (pesos y dólares) para controlar que
 * la suma de lo detectado cuadre. En el formato de dos columnas, la línea de
 * total trae el total en pesos y el total en USD. Suma todas las líneas de
 * "Total Consumos" (una por tarjeta). Best-effort.
 */
export function extractTotals(lines: string[]): StatementTotals {
  let ars: number | null = null
  let usd: number | null = null

  for (const line of lines) {
    if (!TOTAL_RE.test(line)) continue
    const ms = line.match(MONEY_RE)
    if (!ms || ms.length === 0) continue

    if (ms.length >= 2) {
      const a = parseMoney(ms[ms.length - 2])
      const u = parseMoney(ms[ms.length - 1])
      if (a > 0) ars = (ars ?? 0) + a
      if (u > 0) usd = (usd ?? 0) + u
    } else {
      const v = parseMoney(ms[0])
      if (!(v > 0)) continue
      if (FOREIGN_MARK_RE.test(line)) usd = (usd ?? 0) + v
      else ars = (ars ?? 0) + v
    }
  }
  return { ars, usd }
}
