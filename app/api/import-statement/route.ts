import Anthropic from '@anthropic-ai/sdk'

// Parsear un resumen no necesita el modelo más caro. Si algún banco viene muy
// difícil, subir a 'claude-sonnet-4-6' o 'claude-opus-4-8'.
const MODEL = 'claude-haiku-4-5'

// Categorías válidas (deben coincidir con lib/categories.ts).
const CATEGORIES = [
  'supermercado',
  'alquiler',
  'servicios',
  'comida',
  'transporte',
  'hogar',
  'salud',
  'ocio',
  'otros',
] as const

export const runtime = 'nodejs'
export const maxDuration = 60

type Tx = { date: string; title: string; amount: number; category: string }

const SYSTEM = `Sos un asistente que extrae transacciones de un resumen de tarjeta de crédito argentino (en español).
Reglas:
- Extraé SOLO consumos/compras reales. Ignorá totales, subtotales, saldos, pagos, "su pago", impuestos de sellos, percepciones, intereses y líneas de encabezado.
- amount: importe POSITIVO en pesos. Convertí el formato argentino (1.234,56) a número decimal (1234.56). Si una línea está en dólares, convertila NO: usá el importe en pesos de la misma fila si existe; si no hay importe en pesos, omití la fila.
- date: formato YYYY-MM-DD. Inferí el año del período del resumen si la fila trae solo día/mes.
- title: el nombre del comercio o descripción, limpio.
- category: elegí la más adecuada entre las permitidas según el comercio.
Devolvé los resultados llamando a la herramienta registrar_transacciones.`

const TOOL: Anthropic.Tool = {
  name: 'registrar_transacciones',
  description: 'Registra las transacciones de consumo detectadas en el resumen.',
  input_schema: {
    type: 'object',
    properties: {
      transacciones: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
            title: { type: 'string', description: 'Comercio o descripción del consumo' },
            amount: { type: 'number', description: 'Importe positivo en pesos (ej: 1234.56)' },
            category: { type: 'string', enum: CATEGORIES as unknown as string[] },
          },
          required: ['date', 'title', 'amount', 'category'],
        },
      },
    },
    required: ['transacciones'],
  },
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'Falta ANTHROPIC_API_KEY en el servidor.' },
      { status: 500 }
    )
  }

  let pdf: string | undefined
  try {
    const body = (await req.json()) as { pdf?: string }
    pdf = body.pdf
  } catch {
    return Response.json({ error: 'Body inválido.' }, { status: 400 })
  }
  if (!pdf) {
    return Response.json({ error: 'Falta el PDF (base64).' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Prompt caching: system + tool quedan cacheados (prefijo estable).
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: [{ ...TOOL, cache_control: { type: 'ephemeral' } }],
      tool_choice: { type: 'tool', name: 'registrar_transacciones' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdf },
            },
            {
              type: 'text',
              text: 'Extraé todas las transacciones de consumo de este resumen.',
            },
          ],
        },
      ],
    })

    const block = msg.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') {
      return Response.json({ error: 'La IA no devolvió transacciones.' }, { status: 502 })
    }

    const raw = (block.input as { transacciones?: unknown }).transacciones
    const transactions = normalize(Array.isArray(raw) ? raw : [])
    return Response.json({ transactions })
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : 500
    const message = err instanceof Error ? err.message : 'Error llamando a la IA.'
    return Response.json({ error: message }, { status: status ?? 500 })
  }
}

// Saneamos lo que devuelve el modelo: categoría válida, monto positivo, fecha ISO.
function normalize(rows: unknown[]): Tx[] {
  const out: Tx[] = []
  for (const r of rows) {
    if (typeof r !== 'object' || r === null) continue
    const o = r as Record<string, unknown>
    const amount = Math.abs(Number(o.amount))
    if (!Number.isFinite(amount) || amount === 0) continue
    const date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : ''
    if (!date) continue
    const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'Gasto'
    const cat = typeof o.category === 'string' ? o.category : 'otros'
    const category = (CATEGORIES as readonly string[]).includes(cat) ? cat : 'otros'
    out.push({ date, title, amount, category })
  }
  return out
}
