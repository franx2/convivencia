'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { AmountCalculator } from '@/components/AmountCalculator'
import { BottomNav } from '@/components/BottomNav'
import { Header } from '@/components/Header'
import { Button, Card, Input, Label, Select, Spinner } from '@/components/ui'
import { CURRENCIES } from '@/lib/currencies'
import { fetchDolarOficialVenta } from '@/lib/dolar'
import {
  DEFAULT_CATEGORY,
  EXPENSE_CATEGORIES,
  categorySymbol,
  mergeCategories,
  paletteAt,
  slugifyCategory,
  suggestCategory,
  type CatMeta,
} from '@/lib/categories'
import type { Category, Expense, ExpenseShare, Group, Member } from '@/lib/types'

/**
 * Form de gasto compartido entre crear (/nuevo) y editar (/editar/[eid]).
 * Si llega `expenseId`, carga el gasto y sus shares y hace UPDATE; si no, INSERT.
 */
export function ExpenseForm({ groupId, expenseId }: { groupId: string; expenseId?: string }) {
  const router = useRouter()
  const { user } = useAuth()
  const userId = user?.id
  const isEdit = Boolean(expenseId)

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [fetching, setFetching] = useState(true)
  const [missing, setMissing] = useState(false)

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('ARS')
  const [rate, setRate] = useState('1')
  const [rateLoading, setRateLoading] = useState(false)
  const [rateInfo, setRateInfo] = useState<string | null>(null)
  const [paidBy, setPaidBy] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY)
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [history, setHistory] = useState<{ title: string; category: string }[]>([])
  const [cats, setCats] = useState<CatMeta[]>(() => mergeCategories([]))
  const [adding, setAdding] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [proportional, setProportional] = useState(false)
  const [weights, setWeights] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: g } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle()
    const { data: m } = await supabase
      .from('members')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at')
    if (!g) {
      setMissing(true)
      setFetching(false)
      return
    }
    setGroup(g as Group)
    const mm = (m ?? []) as Member[]
    setMembers(mm)
    let defaultPaidBy = (g as Group).is_personal ? (mm[0]?.id ?? '') : ''
    if (userId) {
      const { data: link, error: linkError } = await supabase
        .from('group_users')
        .select('member_id')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle()
      const linked = !linkError ? ((link ?? {}) as { member_id?: string | null }).member_id : null
      if (linked && mm.some((member) => member.id === linked)) defaultPaidBy = linked
    }

    const { data: c } = await supabase
      .from('categories')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at')
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

    // Historial para sugerir categoría según títulos previos.
    const { data: hist } = await supabase
      .from('expenses')
      .select('title, category')
      .eq('group_id', groupId)
    setHistory((hist ?? []) as { title: string; category: string }[])

    // Pesos por defecto: el del miembro (1 = parte normal).
    const wBase: Record<string, string> = Object.fromEntries(
      mm.map((x) => [x.id, String(x.weight ?? 1)])
    )

    if (isEdit && expenseId) {
      const { data: exp } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', expenseId)
        .maybeSingle()
      if (!exp) {
        setMissing(true)
        setFetching(false)
        return
      }
      const e = exp as Expense
      setTitle(e.title)
      setAmount(String(e.amount))
      setCurrency(e.currency)
      setRate(String(e.rate_to_base))
      setPaidBy(e.paid_by)
      setDate(e.date)
      setCategory(e.category || DEFAULT_CATEGORY)
      setCategoryTouched(true) // no auto-sugerir al editar
      const { data: sh } = await supabase
        .from('expense_shares')
        .select('member_id, weight')
        .eq('expense_id', expenseId)
      const rows = (sh ?? []) as Pick<ExpenseShare, 'member_id' | 'weight'>[]
      setSelected(new Set(rows.map((x) => x.member_id)))
      let anyDiff = false
      for (const r of rows) {
        wBase[r.member_id] = String(r.weight)
        if (Number(r.weight) !== 1) anyDiff = true
      }
      setProportional(anyDiff)
      setWeights(wBase)
    } else {
      setCurrency((g as Group).base_currency)
      setPaidBy(defaultPaidBy)
      setSelected(new Set(mm.map((x) => x.id)))
      setWeights(wBase)
      // Prefill desde una plantilla (gasto típico) via query params.
      if (typeof window !== 'undefined') {
        const sp = new URLSearchParams(window.location.search)
        const t = sp.get('title')
        const cat = sp.get('category')
        const amt = sp.get('amount')
        if (t) setTitle(t)
        if (cat) {
          setCategory(cat)
          setCategoryTouched(true) // la plantilla ya fijó la categoría
        }
        if (amt) setAmount(amt)
      }
    }
    setFetching(false)
  }, [groupId, expenseId, isEdit, userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial async; setState ocurre tras el await
    load()
  }, [load])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setWeight(id: string, val: string) {
    setWeights((prev) => ({ ...prev, [id]: val }))
  }

  function shareWeight(id: string): number {
    if (!proportional) return 1
    const w = Number(weights[id])
    return w > 0 ? w : 1
  }

  // Solo incluye `weight` cuando el reparto es proporcional, para que el caso
  // normal no dependa de la columna (migration-safe: usa el default de la DB).
  function shareRow(eid: string, member_id: string) {
    const row: { expense_id: string; member_id: string; weight?: number } = {
      expense_id: eid,
      member_id,
    }
    if (proportional) row.weight = shareWeight(member_id)
    return row
  }

  // Trae el dólar oficial (venta) y lo usa como tipo de cambio. Solo aplica
  // cuando el gasto es en USD y la moneda base del grupo es ARS.
  async function traerDolar() {
    setRateLoading(true)
    setRateInfo(null)
    const d = await fetchDolarOficialVenta()
    setRateLoading(false)
    if (d) {
      setRate(String(d.venta))
      setRateInfo(d.fecha ? `Oficial venta · ${new Date(d.fecha).toLocaleDateString('es-AR')}` : 'Oficial venta')
    } else {
      setRateInfo('No se pudo traer la cotización; cargala a mano.')
    }
  }

  function onCurrencyChange(value: string) {
    setCurrency(value)
    setRateInfo(null)
    // Autocompletar el dólar oficial al elegir USD en un grupo en pesos.
    if (value === 'USD' && group?.base_currency === 'ARS') traerDolar()
  }

  async function addCategory() {
    const name = newCat.trim()
    if (!name) return
    const value = slugifyCategory(name)
    const existing = cats.find((c) => c.value === value)
    if (existing) {
      setCategory(existing.value)
      setCategoryTouched(true)
      setNewCat('')
      setAdding(false)
      return
    }
    const customCount = Math.max(0, cats.length - EXPENSE_CATEGORIES.length)
    const { color, hex } = paletteAt(customCount)
    const { error: insErr } = await supabase
      .from('categories')
      .insert({ group_id: groupId, value, label: name, color, hex })
    if (insErr) {
      setError(insErr.message)
      return
    }
    setCats((prev) => [...prev, { value, label: name, symbol: categorySymbol(value, name), color, hex }])
    setCategory(value)
    setCategoryTouched(true)
    setNewCat('')
    setAdding(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amt = Number(amount)
    const rt = currency === group?.base_currency ? 1 : Number(rate)
    if (!(amt > 0)) return setError('Ingresá un monto válido.')
    if (!(rt > 0)) return setError('El tipo de cambio debe ser mayor a 0.')
    if (!paidBy) return setError('Elegí quién pagó.')
    if (selected.size === 0) return setError('Elegí entre quiénes se reparte.')

    setBusy(true)
    const fields = {
      title: title.trim(),
      amount: amt,
      currency,
      rate_to_base: rt,
      paid_by: paidBy,
      date,
      category,
    }

    if (isEdit && expenseId) {
      const { error: upErr } = await supabase.from('expenses').update(fields).eq('id', expenseId)
      if (upErr) {
        setBusy(false)
        setError(upErr.message)
        return
      }
      // Reemplazar el reparto: borrar los shares actuales e insertar la nueva selección.
      await supabase.from('expense_shares').delete().eq('expense_id', expenseId)
      const rows = [...selected].map((member_id) => shareRow(expenseId, member_id))
      const { error: shErr } = await supabase.from('expense_shares').insert(rows)
      setBusy(false)
      if (shErr) {
        setError(shErr.message)
        return
      }
    } else {
      const { data: exp, error: expErr } = await supabase
        .from('expenses')
        .insert({ group_id: groupId, ...fields })
        .select()
        .single()
      if (expErr || !exp) {
        setBusy(false)
        setError(expErr?.message ?? 'No se pudo guardar.')
        return
      }
      const rows = [...selected].map((member_id) => shareRow(exp.id, member_id))
      const { error: shErr } = await supabase.from('expense_shares').insert(rows)
      setBusy(false)
      if (shErr) {
        setError(shErr.message)
        return
      }
    }
    router.replace(`/g/${groupId}`)
  }

  if (fetching) return <Spinner />
  if (missing || !group)
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-10 text-center text-slate-500">
          {isEdit ? 'Gasto no encontrado.' : 'Grupo no encontrado.'}
        </main>
      </>
    )

  const isBase = currency === group.base_currency

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-6">
        <Link href={`/g/${groupId}`} className="text-sm text-slate-400 hover:text-slate-600">
          ← Volver al grupo
        </Link>
        <h1 className="mb-4 mt-1 text-xl font-semibold">{isEdit ? 'Editar gasto' : 'Nuevo gasto'}</h1>

        <Card>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input
                value={title}
                onChange={(e) => {
                  const v = e.target.value
                  setTitle(v)
                  if (!categoryTouched && !isEdit) {
                    const s = suggestCategory(v, history)
                    if (s) setCategory(s)
                  }
                }}
                placeholder="Cena, nafta, super…"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monto</Label>
                <AmountCalculator value={amount} currency={currency} onChange={setAmount} autoOpen={!isEdit} />
              </div>
              <div>
                <Label>Moneda</Label>
                <Select value={currency} onChange={(e) => onCurrencyChange(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {!isBase && (
              <div>
                <Label>
                  Tipo de cambio (1 {currency} = ? {group.base_currency})
                </Label>
                <Input
                  type="number"
                  step="0.00000001"
                  min="0"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
                {currency === 'USD' && group.base_currency === 'ARS' && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={traerDolar}
                      disabled={rateLoading}
                      className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400"
                    >
                      {rateLoading ? 'Trayendo…' : '↻ Traer dólar oficial (venta)'}
                    </button>
                    {rateInfo && <span className="text-xs text-slate-400">{rateInfo}</span>}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pagó</Label>
                <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                  <option value="">Elegí</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Categoría</Label>
              <Select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value)
                  setCategoryTouched(true)
                }}
              >
                {cats.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.symbol} {c.label}
                  </option>
                ))}
              </Select>
              {adding ? (
                <div className="mt-2 flex gap-2">
                  <Input
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    placeholder="Nombre de la categoría"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCategory()
                      }
                    }}
                  />
                  <Button type="button" variant="ghost" onClick={addCategory}>
                    Agregar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAdding(false)
                      setNewCat('')
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="mt-1.5 text-sm font-medium text-emerald-700 hover:underline"
                >
                  + Nueva categoría
                </button>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>Se reparte entre</Label>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={proportional}
                    onChange={(e) => setProportional(e.target.checked)}
                  />
                  Reparto proporcional
                </label>
              </div>
              {proportional ? (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        selected.has(m.id) ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'
                      }`}
                    >
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                      <span className="flex-1">{m.name}</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={weights[m.id] ?? '1'}
                        onChange={(e) => setWeight(m.id, e.target.value)}
                        disabled={!selected.has(m.id)}
                        className="w-20 text-right"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-slate-400">
                    El monto se reparte proporcional al peso (ej: pesos 2 y 1 = 66% y 33%).
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {members.map((m) => (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        selected.has(m.id) ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'
                      }`}
                    >
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                      {m.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar gasto'}
            </Button>
          </form>
        </Card>
      </main>
      <BottomNav active={group.is_personal ? 'personal' : 'shared'} personalHref={group.is_personal ? `/g/${group.id}` : null} />
    </>
  )
}
