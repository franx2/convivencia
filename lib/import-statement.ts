import { suggestCategory } from './categories'

export type ParsedTx = {
  date: string // YYYY-MM-DD
  title: string
  amount: number
  category: string
}

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

const DATE_RE = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/
// montos formato AR (1.234,56) o simples (1234.56)
const MONEY_RE = /-?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}|-?\$?\s?\d+\.\d{2}/g

function parseMoney(s: string): number {
  let t = s.replace(/[$\s]/g, '')
  const neg = t.startsWith('-')
  t = t.replace(/^-/, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? (neg ? -n : n) : NaN
}

/**
 * Heurística best-effort: una transacción es una línea que arranca con fecha y
 * tiene al menos un monto. Toma el último monto de la línea como importe.
 * El usuario revisa/edita todo antes de guardar. `fallbackYear` para fechas
 * sin año.
 */
export function parseTransactions(lines: string[], fallbackYear: number): ParsedTx[] {
  const out: ParsedTx[] = []
  for (const line of lines) {
    const dm = line.match(DATE_RE)
    if (!dm) continue
    const amounts = line.match(MONEY_RE)
    if (!amounts || amounts.length === 0) continue
    const raw = amounts[amounts.length - 1]
    const amount = parseMoney(raw)
    if (!Number.isFinite(amount) || Math.abs(amount) === 0) continue

    const dd = dm[1].padStart(2, '0')
    const mm = dm[2].padStart(2, '0')
    let yy = dm[3] ? dm[3] : String(fallbackYear)
    if (yy.length === 2) yy = '20' + yy
    const monthNum = Number(mm)
    if (monthNum < 1 || monthNum > 12) continue
    const date = `${yy}-${mm}-${dd}`

    let title = line.slice(dm[0].length)
    const idx = title.lastIndexOf(raw)
    if (idx >= 0) title = title.slice(0, idx)
    title = title.replace(/\s+/g, ' ').replace(/[-–|]+\s*$/, '').trim()
    if (!title) title = 'Gasto'

    out.push({
      date,
      title,
      amount: Math.abs(amount),
      category: suggestCategory(title, []) ?? 'otros',
    })
  }
  return out
}
