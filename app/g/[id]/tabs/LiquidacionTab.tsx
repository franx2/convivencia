'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, EmptyState, ErrorText, IconButton, Input, Label, Select, useConfirm } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { computeBalances, settle } from '@/lib/balances'
import { type Expense, type ExpenseShare, type Group, type Member, type Payment } from '@/lib/types'
import { todayISO } from '@/lib/dates'

export function LiquidacionTab({
  group,
  members,
  expenses,
  shares,
  payments,
  memberName,
  onChanged,
}: {
  group: Group
  members: Member[]
  expenses: Expense[]
  shares: ExpenseShare[]
  payments: Payment[]
  memberName: (id: string) => string
  onChanged: () => void
}) {
  const transfers = useMemo(
    () => settle(computeBalances(members, expenses, shares, payments)),
    [members, expenses, shares, payments]
  )
  const fmt = (n: number) => formatMoney(n, group.base_currency)

  const [showForm, setShowForm] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const aliasOf = (id: string) => members.find((m) => m.id === id)?.alias ?? null

  async function copyAlias(key: string, toId: string) {
    const alias = aliasOf(toId)
    if (!alias) return
    try {
      await navigator.clipboard.writeText(alias)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    } catch {
      setError('No se pudo copiar al portapapeles.')
    }
  }

  async function pay(fromId: string, toId: string, amt: number, when?: string) {
    setBusy(true)
    setError(null)
    const { error: insErr } = await supabase.from('payments').insert({
      group_id: group.id,
      from_member: fromId,
      to_member: toId,
      amount: amt,
      date: when ?? todayISO(),
    })
    setBusy(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    onChanged()
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!from || !to) return setError('Elegí quién paga y quién cobra.')
    if (from === to) return setError('No puede pagarse a sí mismo.')
    if (!(amt > 0)) return setError('Ingresá un monto válido.')
    await pay(from, to, amt, date)
    setAmount('')
    setShowForm(false)
  }

  function undo(id: string) {
    confirm({
      title: '¿Deshacer este pago?',
      message: 'El saldo vuelve a quedar pendiente entre esas personas.',
      confirmLabel: 'Deshacer',
      tone: 'danger',
      onConfirm: async () => {
        await supabase.from('payments').delete().eq('id', id)
        onChanged()
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="px-1 text-xs font-medium uppercase tracking-wide text-slate-400">Para saldar</p>
        {transfers.length === 0 ? (
          <EmptyState>Todo saldado. Nadie le debe a nadie. 🎉</EmptyState>
        ) : (
          transfers.map((t, i) => (
            <Card key={i} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm">
                  <span className="font-medium text-red-600">{t.fromName}</span>
                  <span className="text-slate-400"> le paga a </span>
                  <span className="font-medium text-emerald-600">{t.toName}</span>
                  {aliasOf(t.toId) && (
                    <span className="mt-0.5 block text-xs text-slate-400">alias: {aliasOf(t.toId)}</span>
                  )}
                </span>
                <span className="font-semibold">{fmt(t.amount)}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={!aliasOf(t.toId)} onClick={() => copyAlias(`t${i}`, t.toId)}>
                  {copiedKey === `t${i}` ? '¡Copiado!' : aliasOf(t.toId) ? 'Copiar alias' : 'Sin alias'}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => pay(t.fromId, t.toId, t.amount)}>
                  Marcar pagado
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Card>
        {showForm ? (
          <form onSubmit={submitManual} className="space-y-3">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Registrar un pago</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Paga</Label>
                <Select value={from} onChange={(e) => setFrom(e.target.value)}>
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Cobra</Label>
                <Select value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monto ({group.base_currency})</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar pago'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowForm(true)
              setError(null)
            }}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            + Registrar un pago manualmente
          </button>
        )}
      </Card>

      {payments.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Pagos registrados
          </p>
          {payments.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">
                <span className="font-medium">{memberName(p.from_member)}</span>
                <span className="text-slate-400"> → </span>
                <span className="font-medium">{memberName(p.to_member)}</span>
                <span className="text-slate-400"> · {p.date}</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{fmt(Number(p.amount))}</span>
                <IconButton label="Deshacer" onClick={() => undo(p.id)}>
                    ✕
                  </IconButton>
              </div>
            </Card>
          ))}
        </div>
      )}
      {dialog}
    </div>
  )
}

