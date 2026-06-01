'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { Header } from '@/components/Header'
import { Button, Card, Input, Select, Spinner } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { mergeCategories, type CatMeta } from '@/lib/categories'
import { extractPdfLines, parseTransactions, type ParsedTx } from '@/lib/import-statement'
import type { Category, Group, Member } from '@/lib/types'

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
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [rows, setRows] = useState<ParsedTx[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setFileName(f.name)
    setParseError(null)
    setAiError(null)
    setRows([])
    setParsing(true)
    try {
      const lines = await extractPdfLines(f)
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

  async function improveWithAI() {
    if (!file) return
    setAiBusy(true)
    setAiError(null)
    try {
      const base64 = arrayBufferToBase64(await file.arrayBuffer())
      const res = await fetch('/api/import-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf: base64 }),
      })
      const data = (await res.json()) as { transactions?: ParsedTx[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'La IA no pudo procesar el resumen.')
      setRows(data.transactions ?? [])
      if ((data.transactions ?? []).length === 0) {
        setAiError('La IA no encontró transacciones en este PDF.')
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error llamando a la IA.')
    } finally {
      setAiBusy(false)
    }
  }

  function updateRow(i: number, patch: Partial<ParsedTx>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!group || !memberId) return
    const valid = rows.filter((r) => r.amount > 0 && r.date)
    if (valid.length === 0) return
    setBusy(true)
    setSaveError(null)
    const exps = valid.map((r) => ({
      group_id: groupId,
      title: r.title.trim() || 'Gasto',
      amount: r.amount,
      currency: group.base_currency,
      rate_to_base: 1,
      paid_by: memberId,
      date: r.date,
      category: r.category,
    }))
    const { data: inserted, error } = await supabase.from('expenses').insert(exps).select('id')
    if (error) {
      setBusy(false)
      setSaveError(error.message)
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

  const total = rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0)
  const noMember = !memberId

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
              <Button type="button" variant="ghost" onClick={improveWithAI} disabled={aiBusy}>
                {aiBusy ? 'Procesando con IA…' : '✨ Mejorar con IA'}
              </Button>
              <p className="mt-1.5 text-xs text-slate-400">
                Manda el PDF a Claude para detectar y categorizar mejor (necesita configurar la API key).
              </p>
              {aiError && <p className="mt-1 text-sm text-red-600">{aiError}</p>}
            </div>
          )}
        </Card>

        {rows.length > 0 && (
          <>
            <div className="mb-2 flex items-center justify-between px-1 text-sm">
              <span className="text-slate-500">{rows.length} transacciones · {formatMoney(total, group.base_currency)}</span>
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => (
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
                      className="max-w-[130px] text-right"
                    />
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
                </Card>
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
