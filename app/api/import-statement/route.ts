import Anthropic from '@anthropic-ai/sdk'

// Parsear un resumen no necesita el modelo mas caro. Si algun banco viene muy
// dificil, subir a 'claude-sonnet-4-6' o 'claude-opus-4-8'.
const ANTHROPIC_MODEL = 'claude-haiku-4-5'
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5'

// Categorias validas (deben coincidir con lib/categories.ts).
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
type AIProvider = 'claude' | 'chatgpt'

const SYSTEM_RULES = `Sos un asistente que extrae transacciones de un resumen de tarjeta de credito argentino (en espanol).
Reglas:
- Extrae SOLO consumos/compras reales. Ignora totales, subtotales, saldos, pagos, "su pago", impuestos de sellos, percepciones, intereses y lineas de encabezado.
- amount: importe POSITIVO en pesos. Converti el formato argentino (1.234,56) a numero decimal (1234.56). Si una linea esta en dolares, no la conviertas: usa el importe en pesos de la misma fila si existe; si no hay importe en pesos, omiti la fila.
- date: formato YYYY-MM-DD. Inferi el ano del periodo del resumen si la fila trae solo dia/mes.
- title: el nombre del comercio o descripcion, limpio.
- category: elegi la mas adecuada entre las permitidas segun el comercio.`

const ANTHROPIC_SYSTEM = `${SYSTEM_RULES}
Devolve los resultados llamando a la herramienta registrar_transacciones.`

const OPENAI_INSTRUCTIONS = `${SYSTEM_RULES}
Devolve solamente JSON que cumpla el schema solicitado.`

const OPENAI_TRANSACTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    transacciones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
          title: { type: 'string', description: 'Comercio o descripcion del consumo' },
          amount: { type: 'number', description: 'Importe positivo en pesos (ej: 1234.56)' },
          category: { type: 'string', enum: CATEGORIES as unknown as string[] },
        },
        required: ['date', 'title', 'amount', 'category'],
      },
    },
  },
  required: ['transacciones'],
}

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
            title: { type: 'string', description: 'Comercio o descripcion del consumo' },
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
  let pdf: string | undefined
  let provider: AIProvider = 'claude'
  let openaiApiKey: string | undefined

  try {
    const body = (await req.json()) as {
      pdf?: string
      provider?: string
      openaiApiKey?: string
    }
    pdf = body.pdf
    openaiApiKey = body.openaiApiKey
    if (body.provider === 'chatgpt' || body.provider === 'claude') provider = body.provider
    else if (body.provider) return Response.json({ error: 'Proveedor de IA invalido.' }, { status: 400 })
  } catch {
    return Response.json({ error: 'Body invalido.' }, { status: 400 })
  }

  if (!pdf) {
    return Response.json({ error: 'Falta el PDF (base64).' }, { status: 400 })
  }

  try {
    const transactions =
      provider === 'chatgpt' ? await extractWithOpenAI(pdf, openaiApiKey) : await extractWithAnthropic(pdf)
    return Response.json({ transactions, provider })
  } catch (err) {
    const status =
      err instanceof ProviderError
        ? err.status
        : err instanceof Anthropic.APIError
          ? err.status
          : 500
    const message = err instanceof Error ? err.message : 'Error llamando a la IA.'
    return Response.json({ error: message }, { status: status ?? 500 })
  }
}

async function extractWithAnthropic(pdf: string): Promise<Tx[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new ProviderError('Falta ANTHROPIC_API_KEY en el servidor.', 500)

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 16000,
    // Prompt caching: system + tool quedan cacheados (prefijo estable).
    system: [{ type: 'text', text: ANTHROPIC_SYSTEM, cache_control: { type: 'ephemeral' } }],
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
            text: 'Extrae todas las transacciones de consumo de este resumen.',
          },
        ],
      },
    ],
  })

  const block = msg.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') {
    throw new ProviderError('Claude no devolvio transacciones.', 502)
  }

  const raw = (block.input as { transacciones?: unknown }).transacciones
  return normalize(Array.isArray(raw) ? raw : [])
}

async function extractWithOpenAI(pdf: string, userApiKey?: string): Promise<Tx[]> {
  const apiKey = userApiKey?.trim() || process.env.OPENAI_API_KEY
  if (!apiKey) throw new ProviderError('Pegá tu API key de ChatGPT antes de mejorar con IA.', 400)

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: OPENAI_INSTRUCTIONS,
      max_output_tokens: 16000,
      store: false,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: 'resumen-tarjeta.pdf',
              file_data: `data:application/pdf;base64,${pdf}`,
            },
            {
              type: 'input_text',
              text: 'Extrae todas las transacciones de consumo de este resumen.',
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'statement_transactions',
          strict: true,
          schema: OPENAI_TRANSACTIONS_SCHEMA,
        },
      },
    }),
  })

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new ProviderError(readOpenAIError(data) ?? 'ChatGPT no pudo procesar el resumen.', res.status)
  }

  const text = extractOutputText(data)
  if (!text) throw new ProviderError('ChatGPT no devolvio transacciones.', 502)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ProviderError('ChatGPT devolvio una respuesta invalida.', 502)
  }

  const raw = (parsed as { transacciones?: unknown }).transacciones
  return normalize(Array.isArray(raw) ? raw : [])
}

class ProviderError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

function readOpenAIError(data: Record<string, unknown>): string | null {
  const error = data.error
  if (typeof error !== 'object' || error === null) return null
  const message = (error as Record<string, unknown>).message
  return typeof message === 'string' ? message : null
}

function extractOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string') return data.output_text.trim()

  const chunks: string[] = []
  const output = Array.isArray(data.output) ? data.output : []
  for (const item of output) {
    if (typeof item !== 'object' || item === null) continue
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (typeof part !== 'object' || part === null) continue
      const text = (part as Record<string, unknown>).text
      if (typeof text === 'string') chunks.push(text)
    }
  }
  return chunks.join('').trim()
}

// Saneamos lo que devuelve el modelo: categoria valida, monto positivo, fecha ISO.
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
