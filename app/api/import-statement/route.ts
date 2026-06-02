import Anthropic from '@anthropic-ai/sdk'

// Parsear un resumen no necesita el modelo mas caro. Si algun banco viene muy
// dificil, subir a 'claude-sonnet-4-6' o 'claude-opus-4-8'.
const ANTHROPIC_MODEL = 'claude-haiku-4-5'
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5'
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'

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

type Tx = {
  date: string
  title: string
  amount: number
  category: string
  bank: string | null
  card: string | null
}
type AIProvider = 'claude' | 'chatgpt' | 'gemini'
type Source = { pdf?: string; text?: string }

const ASK = 'Extrae todas las transacciones de consumo de este resumen.'
const textPrompt = (text: string) =>
  `Extrae todas las transacciones de consumo del siguiente texto extraido de un resumen de tarjeta (las columnas pueden venir desordenadas):\n\n${text}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const SYSTEM_RULES = `Sos un asistente que extrae transacciones de un resumen de tarjeta de credito argentino (en espanol).
Reglas:
- Extrae SOLO consumos/compras reales. Ignora totales, subtotales, saldos, pagos, "su pago", impuestos de sellos, percepciones, intereses y lineas de encabezado.
- amount: importe POSITIVO en pesos. Converti el formato argentino (1.234,56) a numero decimal (1234.56). Si una linea esta en dolares, no la conviertas: usa el importe en pesos de la misma fila si existe; si no hay importe en pesos, omiti la fila.
- date: formato YYYY-MM-DD. Inferi el ano del periodo del resumen si la fila trae solo dia/mes.
- title: el nombre del comercio o descripcion, limpio.
- category: elegi la mas adecuada entre las permitidas segun el comercio.
- bank: el banco/emisor del resumen (ej: "Galicia", "Santander", "BBVA", "Naranja"). El mismo para todo el resumen si no se aclara otra cosa. Si no lo sabes, usa null.
- card: la tarjeta a la que pertenece el consumo dentro del resumen, lo mas identificable posible (ej: "Visa terminada en 1234", "Titular", "Adicional Juan", "Mastercard ****5678"). Si el resumen separa por tarjeta/titular/adicional, respetalo. Si no se puede distinguir, usa null.`

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
          bank: { type: ['string', 'null'], description: 'Banco/emisor del resumen, o null' },
          card: { type: ['string', 'null'], description: 'Tarjeta del consumo (ej: Visa ****1234, Titular, Adicional), o null' },
        },
        required: ['date', 'title', 'amount', 'category', 'bank', 'card'],
      },
    },
  },
  required: ['transacciones'],
}

const GEMINI_INSTRUCTIONS = `${SYSTEM_RULES}
Devolve solamente JSON que cumpla el schema solicitado.`

// Schema en el formato de Gemini (tipos en MAYUSCULAS, nullable).
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transacciones: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' },
          title: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          category: { type: 'STRING', enum: CATEGORIES as unknown as string[] },
          bank: { type: 'STRING', nullable: true },
          card: { type: 'STRING', nullable: true },
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
            bank: { type: 'string', description: 'Banco/emisor del resumen (vacio si no se sabe)' },
            card: { type: 'string', description: 'Tarjeta del consumo: ej "Visa ****1234", "Titular", "Adicional" (vacio si no se distingue)' },
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
  let text: string | undefined
  let provider: AIProvider = 'claude'
  let openaiApiKey: string | undefined
  let geminiApiKey: string | undefined

  try {
    const body = (await req.json()) as {
      pdf?: string
      text?: string
      provider?: string
      openaiApiKey?: string
      geminiApiKey?: string
    }
    pdf = body.pdf
    text = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : undefined
    openaiApiKey = body.openaiApiKey
    geminiApiKey = body.geminiApiKey
    if (body.provider === 'chatgpt' || body.provider === 'claude' || body.provider === 'gemini')
      provider = body.provider
    else if (body.provider) return Response.json({ error: 'Proveedor de IA invalido.' }, { status: 400 })
  } catch {
    return Response.json({ error: 'Body invalido.' }, { status: 400 })
  }

  // Preferimos el texto extraido (mucho mas barato en tokens que el PDF, y
  // evita el limite de cuota gratis). El PDF queda como fallback.
  if (!pdf && !text) {
    return Response.json({ error: 'Falta el resumen (texto o PDF).' }, { status: 400 })
  }
  const src: Source = { pdf, text }

  try {
    const transactions =
      provider === 'chatgpt'
        ? await extractWithOpenAI(src, openaiApiKey)
        : provider === 'gemini'
          ? await extractWithGemini(src, geminiApiKey)
          : await extractWithAnthropic(src)
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

async function extractWithAnthropic(src: Source): Promise<Tx[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new ProviderError('Falta ANTHROPIC_API_KEY en el servidor.', 500)

  const content: Anthropic.ContentBlockParam[] = src.text
    ? [{ type: 'text', text: textPrompt(src.text) }]
    : [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: src.pdf! } },
        { type: 'text', text: ASK },
      ]

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 16000,
    // Prompt caching: system + tool quedan cacheados (prefijo estable).
    system: [{ type: 'text', text: ANTHROPIC_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [{ ...TOOL, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'registrar_transacciones' },
    messages: [{ role: 'user', content }],
  })

  const block = msg.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') {
    throw new ProviderError('Claude no devolvio transacciones.', 502)
  }

  const raw = (block.input as { transacciones?: unknown }).transacciones
  return normalize(Array.isArray(raw) ? raw : [])
}

async function extractWithOpenAI(src: Source, userApiKey?: string): Promise<Tx[]> {
  const apiKey = userApiKey?.trim() || process.env.OPENAI_API_KEY
  if (!apiKey) throw new ProviderError('Pegá tu API key de ChatGPT antes de mejorar con IA.', 400)

  const content = src.text
    ? [{ type: 'input_text', text: textPrompt(src.text) }]
    : [
        { type: 'input_file', filename: 'resumen-tarjeta.pdf', file_data: `data:application/pdf;base64,${src.pdf}` },
        { type: 'input_text', text: ASK },
      ]

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
      input: [{ role: 'user', content }],
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

async function extractWithGemini(src: Source, userApiKey?: string): Promise<Tx[]> {
  const apiKey = userApiKey?.trim() || process.env.GEMINI_API_KEY
  if (!apiKey) throw new ProviderError('Pegá tu API key de Gemini antes de mejorar con IA.', 400)

  const parts = src.text
    ? [{ text: textPrompt(src.text) }]
    : [{ inline_data: { mime_type: 'application/pdf', data: src.pdf } }, { text: ASK }]

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: GEMINI_INSTRUCTIONS }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA },
  })
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
  const headers = { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' }

  // La cuota gratis es por minuto: ante 429, esperamos y reintentamos una vez.
  let res = await fetch(url, { method: 'POST', headers, body })
  if (res.status === 429) {
    await sleep(20000)
    res = await fetch(url, { method: 'POST', headers, body })
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new ProviderError(readGeminiError(data) ?? 'Gemini no pudo procesar el resumen.', res.status)
  }

  const text = extractGeminiText(data)
  if (!text) throw new ProviderError('Gemini no devolvio transacciones.', 502)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ProviderError('Gemini devolvio una respuesta invalida.', 502)
  }
  const raw = (parsed as { transacciones?: unknown }).transacciones
  return normalize(Array.isArray(raw) ? raw : [])
}

function readGeminiError(data: Record<string, unknown>): string | null {
  const error = data.error
  if (typeof error !== 'object' || error === null) return null
  const details = error as Record<string, unknown>
  const message = typeof details.message === 'string' ? details.message : ''
  const status = typeof details.status === 'string' ? details.status : ''
  if (status === 'RESOURCE_EXHAUSTED' || message.toLowerCase().includes('quota')) {
    return 'Tu API key de Gemini llegó al límite de la cuota gratis. Probá más tarde o con otra key.'
  }
  if (message.toLowerCase().includes('api key') || message.toLowerCase().includes('api_key')) {
    return 'La API key de Gemini no es válida.'
  }
  return message || null
}

function extractGeminiText(data: Record<string, unknown>): string {
  const candidates = Array.isArray(data.candidates) ? data.candidates : []
  const chunks: string[] = []
  for (const cand of candidates) {
    if (typeof cand !== 'object' || cand === null) continue
    const content = (cand as Record<string, unknown>).content
    if (typeof content !== 'object' || content === null) continue
    const parts = (content as Record<string, unknown>).parts
    if (!Array.isArray(parts)) continue
    for (const part of parts) {
      if (typeof part !== 'object' || part === null) continue
      const text = (part as Record<string, unknown>).text
      if (typeof text === 'string') chunks.push(text)
    }
  }
  return chunks.join('').trim()
}

class ProviderError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

function readOpenAIError(data: Record<string, unknown>): string | null {
  const error = data.error
  if (typeof error !== 'object' || error === null) return null
  const details = error as Record<string, unknown>
  const code = typeof details.code === 'string' ? details.code : ''
  const message = typeof details.message === 'string' ? details.message : ''
  if (code === 'insufficient_quota' || message.toLowerCase().includes('exceeded your current quota')) {
    return 'Tu API key de ChatGPT no tiene cupo disponible. Revisá billing/créditos o pegá otra key.'
  }
  return message || null
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
    const bank = typeof o.bank === 'string' && o.bank.trim() ? o.bank.trim() : null
    const card = typeof o.card === 'string' && o.card.trim() ? o.card.trim() : null
    out.push({ date, title, amount, category, bank, card })
  }
  return out
}
