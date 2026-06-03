import { suggestCategory } from './categories'

export type ParsedTx = {
  date: string // YYYY-MM-DD
  title: string
  amount: number
  category: string
  currency: 'ARS' | 'USD' // moneda del consumo (USD = consumo en dólares)
  bank: string | null // emisor del resumen (lo completa la IA; el parser local lo deja null)
  card: string | null // tarjeta del consumo (titular/adicional, ****1234)
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
// líneas que NO son consumos
const IGNORE_LINE_RE =
  /\b(SU PAGO|PAGO MINIMO|PAGO MÍNIMO|SALDO ANTERIOR|SALDO ACTUAL|TOTAL A PAGAR|TOTAL CONSUMOS|TOTAL DE CONSUMOS|DEV\.?\s?IMP|DB\.?\s?RG|IMPUESTO|PERCEPCION|PERCEPCIÓN|INTERESES?|IVA|SALDO\s+PENDIENTE|VENCIMIENTO|LIMITE\s+DE\s+COMPRA)\b/i
const USD_RE = /\b(U\$S|US\$|USD|D[OÓ]LARES?)\b|BUSD/i
const NON_USD_FOREIGN_RE = /\b(EUR|EUROS?|BRL|REALES?|CLP)\b/i
// encabezados de sección
const USD_SECTION_RE = /(consumos?|movimientos?).{0,30}(d[oó]lar|u\$s|usd)|\b(en\s+d[oó]lares|en\s+u\$s)\b/i
const ARS_SECTION_RE = /(consumos?|movimientos?).{0,30}pesos|\ben\s+pesos\b/i
const TOTAL_RE = /total\s+(de\s+)?consumos/i

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

/**
 * Heurística best-effort: una transacción es una línea que arranca con fecha y
 * tiene al menos un monto. Toma el último monto de la línea como importe.
 * Detecta consumos en USD (sección "dólares" o marca U$S en la línea) y los
 * marca currency='USD'. El usuario revisa/edita todo antes de guardar.
 */
export function parseTransactions(lines: string[], fallbackYear: number): ParsedTx[] {
  const out: ParsedTx[] = []
  let section: 'ARS' | 'USD' = 'ARS'

  for (const line of lines) {
    // seguimiento de sección (pesos vs dólares)
    if (USD_SECTION_RE.test(line)) section = 'USD'
    else if (ARS_SECTION_RE.test(line)) section = 'ARS'

    if (IGNORE_LINE_RE.test(line)) continue
    if (NON_USD_FOREIGN_RE.test(line)) continue // EUR/BRL/etc: no los manejamos

    const d = parseDate(line, fallbackYear)
    if (!d) continue
    const amounts = line.match(MONEY_RE)
    if (!amounts || amounts.length === 0) continue
    const raw = amounts[amounts.length - 1]
    const amount = parseMoney(raw)
    if (!Number.isFinite(amount) || amount <= 0) continue

    const currency: 'ARS' | 'USD' = USD_RE.test(line) || section === 'USD' ? 'USD' : 'ARS'

    let title = d.rest
    const idx = title.lastIndexOf(raw)
    if (idx >= 0) title = title.slice(0, idx)
    title = title
      .replace(/^\s*(K|\*)\s+/, '')
      .replace(/\s+\d{6,}\s*$/, '') // códigos largos al final
      .replace(/\s+\d{2}\/\d{2}\s*$/, '') // cuotas tipo 01/12
      .replace(/\s*c\.?\s?\d{1,2}\/\d{1,2}\s*$/i, '') // "C.01/06"
      .replace(/\b(U\$S|US\$|USD)\b/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/[-–|*]+\s*$/, '')
      .trim()
    if (!title) title = 'Gasto'

    out.push({
      date: d.date,
      title,
      amount,
      category: suggestCategory(title, []) ?? 'otros',
      currency,
      bank: null,
      card: null,
    })
  }
  return out
}

/**
 * Busca el "Total de consumos" del resumen (pesos y/o dólares) para poder
 * controlar que la suma de lo detectado cuadre. Best-effort.
 */
export function extractTotals(lines: string[]): StatementTotals {
  let ars: number | null = null
  let usd: number | null = null
  let section: 'ARS' | 'USD' = 'ARS'

  for (const line of lines) {
    if (USD_SECTION_RE.test(line)) section = 'USD'
    else if (ARS_SECTION_RE.test(line)) section = 'ARS'
    if (!TOTAL_RE.test(line)) continue

    const amounts = line.match(MONEY_RE)
    if (!amounts || amounts.length === 0) continue
    const val = parseMoney(amounts[amounts.length - 1])
    if (!(val > 0)) continue

    const isUSD = USD_RE.test(line) || section === 'USD'
    if (isUSD) {
      if (usd === null) usd = val
    } else if (ars === null) {
      ars = val
    }
  }
  return { ars, usd }
}
