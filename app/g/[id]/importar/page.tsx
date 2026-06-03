'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { Header } from '@/components/Header'
import { Button, Card, Input, Select, Spinner } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { fetchDolarOficialVenta } from '@/lib/dolar'
import { mergeCategories, type CatMeta } from '@/lib/categories'
import {
  extractPdfLines,
  extractTotals,
  parseTransactions,
  type ParsedTx,
  type StatementTotals,
} from '@/lib/import-statement'
import type { Category, Group, Member } from '@/lib/types'

type AIProvider = 'claude' | 'chatgpt' | 'gemini'
const OPENAI_KEY_STORAGE = 'covivencia.openaiApiKey'
const LEGACY_OPENAI_KEY_STORAGE = 'convivencia.openaiApiKey'
const GEMINI_KEY_STORAGE = 'covivencia.geminiApiKey'

export default function ImportarPage() {
  const { user, loading } = useRequireAuth()
  const params = useParams<{ id: string }>()
  const groupId = params.id
  const router = useRouter()

  const [group, setGroup] = useState<Group | null>(null)
  const [memberId, setMemberId] = useState<string>('')
  const [cats, setCats] = useState<CatMeta[]>(() => mergeCategories([]))
  const [fetching, setFetching] = useState(true)
  const [missing, setMissing] = useState(false)

  const [file, setFile] = useState<File | null>(null)
  const [pdfText, setPdfText] = useState('')
  const [showText, setShowText] = useState(false)
  const [totals, setTotals] = useState<StatementTotals>({ ars: null, usd: null })
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [rows, setRows] = useState<ParsedTx[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState<AIProvider | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: g } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle()
    if (!g) {
      setMissing(true)
      setFetching(false)
      return
    }
    setGroup(g as Group)
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from('members').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('categories').select('*').eq('group_id', groupId).order('created_at'),
    ])
    setMemberId(((m ?? []) as Member[])[0]?.id ?? '')
    setCats(
      mergeCategories(
        ((c ?? []) as Category[]).map((x) => ({
          value: x.value,
          label: x.label,
          color: x.color,
          hex: x.hex,
        }))
      )
    )
    setFetching(false)
  }, [groupId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial async; setState ocurre tras el await
    if (user) load()
  }, [user, load])

  useEffect(() => {
    let cancelled = false
    const stored = localStorage.getItem(OPENAI_KEY_STORAGE) ?? localStorage.getItem(LEGACY_OPENAI_KEY_STORAGE) ?? ''
    if (stored) localStorage.setItem(OPENAI_KEY_STORAGE, stored)
    localStorage.removeItem(LEGACY_OPENAI_KEY_STORAGE)
    queueMicrotask(() => {
      if (!cancelled) setOpenaiApiKey(stored)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const stored = localStorage.getItem(GEMINI_KEY_STORAGE) ?? ''
    queueMicrotask(() => {
      if (!cancelled) setGeminiApiKey(stored)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setFileName(f.name)
    setParseError(null)
    setAiError(null)
    setRows([])
    setPdfText('')
    setTotals({ ars: null, usd: null })
    setParsing(true)
    try {
      const lines = await extractPdfLines(f)
      setPdfText(lines.join('\n'))
      setTotals(extractTotals(lines))
      const year = guessYear(f.name)
      const txs = parseTransactions(lines, year)
      if (txs.length === 0) {
        setParseError(
          'No detecté transacciones automáticamente. Probá “Mejorar con IA”.'
        )
      }
      setRows(txs)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'No se pudo leer el PDF.')
    } finally {
      setParsing(false)
    }
  }

  async function improveWithAI(provider: AIProvider) {
    if (!file) return
    const openaiKey = openaiApiKey.trim()
    const geminiKey = geminiApiKey.trim()
    if (provider === 'chatgpt' && !openaiKey) {
      setAiError('Pegá tu API key de ChatGPT antes de mejorar con IA.')
      return
    }
    if (provider === 'gemini' && !geminiKey) {
      setAiError('Pegá tu API key de Gemini antes de mejorar con IA.')
      return
    }
    setAiBusy(provider)
    setAiError(null)
    try {
      // Mandamos el TEXTO extraído (mucho más barato en tokens y evita el
      // límite de cuota gratis). Solo caemos al PDF si no se pudo extraer texto.
      const text = pdfText.trim()
      const pdf = text ? undefined : arrayBufferToBase64(await file.arrayBuffer())
      const res = await fetch('/api/import-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text || undefined,
          pdf,
          provider,
          openaiApiKey: provider === 'chatgpt' ? openaiKey : undefined,
          geminiApiKey: provider === 'gemini' ? geminiKey : undefined,
        }),
      })
      const data = (await res.json()) as { transactions?: ParsedTx[]; error?: string }
      if (!res.ok) throw new Error(data.error || `${providerName(provider)} no pudo procesar el resumen.`)
      setRows(data.transactions ?? [])
      if ((data.transactions ?? []).length === 0) {
        setAiError(`${providerName(provider)} no encontró transacciones en este PDF.`)
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error llamando a la IA.')
    } finally {
      setAiBusy(null)
    }
  }

  function updateRow(i: number, patch: Partial<ParsedTx>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  function itemCard(r: ParsedTx, i: number) {
    return (
      <Card key={i} className="space-y-2">
        <div className="flex gap-2">
          <Input
            type="date"
            value={r.date}
            onChange={(e) => updateRow(i, { date: e.target.value })}
            className="max-w-[150px]"
          />
          <Input
            type="number"
            step="0.01"
            min="0"
            value={r.amount}
            onChange={(e) => updateRow(i, { amount: Number(e.target.value) })}
            className="max-w-[120px] text-right"
          />
          <Select
            value={r.currency}
            onChange={(e) => updateRow(i, { currency: e.target.value === 'USD' ? 'USD' : 'ARS' })}
            className="max-w-[80px]"
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </Select>
          <button
            onClick={() => removeRow(i)}
            className="px-1 text-slate-300 hover:text-red-500"
            title="Quitar"
          >
            ✕
          </button>
        </div>
        <Input value={r.title} onChange={(e) => updateRow(i, { title: e.target.value })} />
        <Select value={r.category} onChange={(e) => updateRow(i, { category: e.target.value })}>
          {cats.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Input
            value={r.bank ?? ''}
            placeholder="Banco"
            onChange={(e) => updateRow(i, { bank: e.target.value.trim() || null })}
          />
          <Input
            value={r.card ?? ''}
            placeholder="Tarjeta"
            onChange={(e) => updateRow(i, { card: e.target.value.trim() || null })}
          />
        </div>
      </Card>
    )
  }

  function updateOpenaiApiKey(value: string) {
    setOpenaiApiKey(value)
    const next = value.trim()
    if (next) localStorage.setItem(OPENAI_KEY_STORAGE, next)
    else localStorage.removeItem(OPENAI_KEY_STORAGE)
  }

  function forgetOpenaiApiKey() {
    setOpenaiApiKey('')
    localStorage.removeItem(OPENAI_KEY_STORAGE)
  }

  function updateGeminiApiKey(value: string) {
    setGeminiApiKey(value)
    const next = value.trim()
    if (next) localStorage.setItem(GEMINI_KEY_STORAGE, next)
    else localStorage.removeItem(GEMINI_KEY_STORAGE)
  }

  function forgetGeminiApiKey() {
    setGeminiApiKey('')
    localStorage.removeItem(GEMINI_KEY_STORAGE)
  }

  async function save() {
    if (!group || !memberId) return
    const valid = rows.filter((r) => r.amount > 0 && r.date)
    if (valid.length === 0) return
    setBusy(true)
    setSaveError(null)

    // Consumos en USD: se guardan en USD con el dólar oficial (venta) como
    // tipo de cambio a la moneda base (pesos).
    let usdRate = 1
    if (valid.some((r) => r.currency === 'USD') && group.base_currency === 'ARS') {
      const d = await fetchDolarOficialVenta()
      if (!d) {
        setBusy(false)
        setSaveError('No se pudo traer el dólar oficial para los consumos en USD. Probá de nuevo.')
        return
      }
      usdRate = d.venta
    }

    const exps = valid.map((r) => {
      const isUsd = r.currency === 'USD'
      const e: {
        group_id: string
        title: string
        amount: number
        currency: string
        rate_to_base: number
        paid_by: string
        date: string
        category: string
        bank?: string
        card?: string
      } = {
        group_id: groupId,
        title: r.title.trim() || 'Gasto',
        amount: r.amount,
        currency: isUsd ? 'USD' : group.base_currency,
        rate_to_base: isUsd && group.base_currency === 'ARS' ? usdRate : 1,
        paid_by: memberId,
        date: r.date,
        category: r.category,
      }
      // migration-safe: solo mandamos banco/tarjeta cuando hay dato.
      if (r.bank) e.bank = r.bank
      if (r.card) e.card = r.card
      return e
    })
    const { data: inserted, error } = await supabase.from('expenses').insert(exps).select('id')
    if (error) {
      setBusy(false)
      setSaveError(
        /bank|card/.test(error.message)
          ? 'Falta correr la migración de banco/tarjeta en Supabase (supabase/migration_banco_tarjeta.sql).'
          : error.message
      )
      return
    }
    const shares = ((inserted ?? []) as { id: string }[]).map((e) => ({
      expense_id: e.id,
      member_id: memberId,
    }))
    if (shares.length) await supabase.from('expense_shares').insert(shares)
    setBusy(false)
    router.replace(`/g/${groupId}`)
  }

  if (loading || !user || fetching) return <Spinner />
  if (missing || !group)
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-10 text-center text-slate-500">Grupo no encontrado.</main>
      </>
    )

  const noMember = !memberId
  const groups = groupForPreview(rows)
  const detected = sumByCurrency(rows.map((r, i) => ({ r, i })))

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Link href={`/g/${groupId}`} className="text-sm text-slate-400 hover:text-slate-600">
          ← Volver al grupo
        </Link>
        <h1 className="mb-1 mt-1 text-xl font-semibold">Importar resumen</h1>
        <p className="mb-4 text-sm text-slate-500">
          Subí el PDF del resumen de tu tarjeta. Detecto las transacciones, las podés revisar y
          editar, y se cargan como gastos.
        </p>

        {noMember && (
          <Card className="mb-4 text-sm text-amber-600">
            Este grupo no tiene miembros. Agregá uno antes de importar.
          </Card>
        )}

        <Card className="mb-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Archivo PDF
            </span>
            <input
              type="file"
              accept="application/pdf"
              onChange={onFile}
              disabled={noMember}
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-700"
            />
          </label>
          {fileName && <p className="mt-2 text-xs text-slate-400">{fileName}</p>}
          {parsing && <p className="mt-2 text-sm text-slate-500">Leyendo el PDF…</p>}
          {parseError && <p className="mt-2 text-sm text-amber-600">{parseError}</p>}

          {file && (
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="mb-3 space-y-1.5">
                <span className="block text-sm font-medium text-slate-600 dark:text-slate-300">
                  API key de ChatGPT
                </span>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={openaiApiKey}
                    onChange={(e) => updateOpenaiApiKey(e.target.value)}
                    placeholder="sk-..."
                    autoComplete="off"
                    className="min-w-0"
                  />
                  {openaiApiKey && (
                    <Button type="button" variant="ghost" onClick={forgetOpenaiApiKey} className="shrink-0">
                      Olvidar
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-400">Se guarda solo en este dispositivo.</p>
              </div>

              <div className="mb-3 space-y-1.5">
                <span className="block text-sm font-medium text-slate-600 dark:text-slate-300">
                  API key de Gemini (Google, gratis)
                </span>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => updateGeminiApiKey(e.target.value)}
                    placeholder="AIza..."
                    autoComplete="off"
                    className="min-w-0"
                  />
                  {geminiApiKey && (
                    <Button type="button" variant="ghost" onClick={forgetGeminiApiKey} className="shrink-0">
                      Olvidar
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Gratis en{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 underline dark:text-emerald-400"
                  >
                    aistudio.google.com/apikey
                  </a>
                  . Se guarda solo en este dispositivo.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => improveWithAI('gemini')}
                  disabled={aiBusy !== null}
                >
                  {aiBusy === 'gemini' ? 'Procesando con Gemini…' : '✨ Mejorar con Gemini (gratis)'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => improveWithAI('chatgpt')}
                  disabled={aiBusy !== null}
                >
                  {aiBusy === 'chatgpt' ? 'Procesando con ChatGPT…' : 'Mejorar con ChatGPT'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => improveWithAI('claude')}
                  disabled={aiBusy !== null}
                >
                  {aiBusy === 'claude' ? 'Procesando con Claude…' : 'Mejorar con Claude'}
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Gemini y ChatGPT usan la API key que pegás acá (gratis la de Gemini). Claude usa la
                key configurada en el servidor.
              </p>
              {aiError && <p className="mt-1 text-sm text-red-600">{aiError}</p>}
            </div>
          )}
        </Card>

        {pdfText && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowText((v) => !v)}
              className="text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              {showText ? 'Ocultar texto extraído' : 'Ver texto extraído del PDF'}
            </button>
            {showText && (
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {pdfText}
              </pre>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <>
            {/* Control del total: resumen vs detectado */}
            <Card className="mb-3">
              <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                Control del total ({rows.length} transacciones)
              </p>
              <ReconRow label="Pesos" stmt={totals.ars} detected={detected.ars} currency="ARS" />
              {(totals.usd !== null || detected.usd > 0) && (
                <ReconRow label="Dólares" stmt={totals.usd} detected={detected.usd} currency="USD" />
              )}
              <p className="mt-1 text-xs text-slate-400">
                Si la diferencia no es 0, revisá filas faltantes o repetidas antes de guardar.
              </p>
            </Card>

            <div className="space-y-5">
              {groups.map((mg) => (
                <div key={mg.key} className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1 dark:border-slate-700">
                    <span className="text-sm font-semibold">{mg.label}</span>
                    <span className="text-xs text-slate-500">{curLabel(mg.totals)}</span>
                  </div>
                  {mg.banks.map((bg) => (
                    <div key={bg.bank} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                          🏦 {bg.bank}
                        </span>
                        <span className="text-xs text-slate-400">{curLabel(bg.totals)}</span>
                      </div>
                      {bg.cards.map((cg) => (
                        <div key={cg.card} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              💳 {cg.card}
                            </span>
                            <span className="text-xs text-slate-400">{curLabel(cg.totals)}</span>
                          </div>
                          <div className="space-y-2">{cg.items.map((it) => itemCard(it.r, it.i))}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {saveError && <p className="mt-3 text-sm text-red-600">{saveError}</p>}
            <div className="mt-4 flex gap-2">
              <Button onClick={save} disabled={busy} className="flex-1">
                {busy ? 'Guardando…' : `Guardar ${rows.filter((r) => r.amount > 0).length} gastos`}
              </Button>
            </div>
          </>
        )}
      </main>
    </>
  )
}

function guessYear(fileName: string): number {
  const m = fileName.match(/20\d{2}/)
  return m ? Number(m[0]) : new Date().getFullYear()
}

type Indexed = { r: ParsedTx; i: number }
type CurTotals = { ars: number; usd: number }
type CardGroup = { card: string; totals: CurTotals; items: Indexed[] }
type BankGroup = { bank: string; totals: CurTotals; cards: CardGroup[] }
type MonthGroup = { key: string; label: string; totals: CurTotals; banks: BankGroup[] }

function sumByCurrency(items: Indexed[]): CurTotals {
  let ars = 0
  let usd = 0
  for (const it of items) {
    const a = Number.isFinite(it.r.amount) ? it.r.amount : 0 // incluye reintegros (negativos)
    if (it.r.currency === 'USD') usd += a
    else ars += a
  }
  return { ars, usd }
}

function curLabel(t: CurTotals): string {
  const parts: string[] = []
  if (t.ars > 0) parts.push(formatMoney(t.ars, 'ARS'))
  if (t.usd > 0) parts.push(formatMoney(t.usd, 'USD'))
  return parts.join(' · ') || formatMoney(0, 'ARS')
}

function bucket(items: Indexed[], keyOf: (r: ParsedTx) => string): [string, Indexed[]][] {
  const m = new Map<string, Indexed[]>()
  for (const it of items) {
    const k = keyOf(it.r)
    const arr = m.get(k) ?? []
    arr.push(it)
    m.set(k, arr)
  }
  return [...m.entries()]
}

// Agrupa la vista previa Mes -> Banco -> Tarjeta, con subtotales por moneda.
function groupForPreview(rows: ParsedTx[]): MonthGroup[] {
  const indexed: Indexed[] = rows.map((r, i) => ({ r, i }))
  const byMonth = bucket(indexed, (r) => (/^\d{4}-\d{2}/.test(r.date) ? r.date.slice(0, 7) : 'sin-fecha'))
  byMonth.sort((a, b) =>
    a[0] === 'sin-fecha' ? 1 : b[0] === 'sin-fecha' ? -1 : b[0].localeCompare(a[0])
  )
  return byMonth.map(([mk, mItems]) => {
    const banks = bucket(mItems, (r) => r.bank?.trim() || 'Sin banco')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bk, bItems]) => {
        const cards = bucket(bItems, (r) => r.card?.trim() || 'Sin tarjeta')
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([ck, cItems]) => ({ card: ck, totals: sumByCurrency(cItems), items: cItems }))
        return { bank: bk, totals: sumByCurrency(bItems), cards }
      })
    return { key: mk, label: monthLabel(mk), totals: sumByCurrency(mItems), banks }
  })
}

function monthLabel(key: string): string {
  if (key === 'sin-fecha') return 'Sin fecha'
  const [y, m] = key.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function ReconRow({
  label,
  stmt,
  detected,
  currency,
}: {
  label: string
  stmt: number | null
  detected: number
  currency: string
}) {
  const diff = stmt === null ? null : detected - stmt
  const ok = diff !== null && Math.abs(diff) < 1
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 py-0.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-3">
        <span className="text-slate-400">
          {stmt === null ? 'resumen —' : `resumen ${formatMoney(stmt, currency)}`}
        </span>
        <span className="tabular-nums text-slate-600 dark:text-slate-300">
          detectado {formatMoney(detected, currency)}
        </span>
        {diff !== null && (
          <span className={`tabular-nums font-medium ${ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {ok ? '✓ cuadra' : `dif ${formatMoney(diff, currency)}`}
          </span>
        )}
      </span>
    </div>
  )
}

function providerName(provider: AIProvider): string {
  if (provider === 'chatgpt') return 'ChatGPT'
  if (provider === 'gemini') return 'Gemini'
  return 'Claude'
}

// Convierte el PDF a base64 sin reventar el stack (chunks de 32KB).
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
