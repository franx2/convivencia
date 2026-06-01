'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Header } from '@/components/Header'
import { Button, Card, Input, Label, Select, Spinner } from '@/components/ui'
import { CURRENCIES } from '@/lib/currencies'
import { EXPENSE_CATEGORIES, DEFAULT_CATEGORY } from '@/lib/categories'
import type { Expense, ExpenseShare, Group, Member } from '@/lib/types'

/**
 * Form de gasto compartido entre crear (/nuevo) y editar (/editar/[eid]).
 * Si llega `expenseId`, carga el gasto y sus shares y hace UPDATE; si no, INSERT.
 */
export function ExpenseForm({ groupId, expenseId }: { groupId: string; expenseId?: string }) {
  const router = useRouter()
  const isEdit = Boolean(expenseId)

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [fetching, setFetching] = useState(true)
  const [missing, setMissing] = useState(false)

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('ARS')
  const [rate, setRate] = useState('1')
  const [paidBy, setPaidBy] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY)
  const [selected, setSelected] = useState<Set<string>>(new Set())
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
      const { data: sh } = await supabase
        .from('expense_shares')
        .select('member_id')
        .eq('expense_id', expenseId)
      setSelected(new Set(((sh ?? []) as Pick<ExpenseShare, 'member_id'>[]).map((x) => x.member_id)))
    } else {
      setCurrency((g as Group).base_currency)
      setPaidBy(mm[0]?.id ?? '')
      setSelected(new Set(mm.map((x) => x.id)))
    }
    setFetching(false)
  }, [groupId, expenseId, isEdit])

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
      const rows = [...selected].map((member_id) => ({ expense_id: expenseId, member_id }))
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
      const rows = [...selected].map((member_id) => ({ expense_id: exp.id, member_id }))
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
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
        <Link href={`/g/${groupId}`} className="text-sm text-slate-400 hover:text-slate-600">
          ← Volver al grupo
        </Link>
        <h1 className="mb-4 mt-1 text-xl font-semibold">{isEdit ? 'Editar gasto' : 'Nuevo gasto'}</h1>

        <Card>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cena, nafta, super…" required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monto</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <Label>Moneda</Label>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
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
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pagó</Label>
                <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
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
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Se reparte entre</Label>
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
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar gasto'}
            </Button>
          </form>
        </Card>
      </main>
    </>
  )
}
