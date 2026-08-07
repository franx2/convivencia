'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AmountCalculator } from '@/components/AmountCalculator'
import { Button, Card, ErrorText, IconButton, Input } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { type Group, type Income, type Member } from '@/lib/types'
import { HistoryList } from './shared'
import { todayISO } from '@/lib/dates'

export function PersonalIncomesTab({
  group,
  members,
  incomes,
  memberName,
  onChanged,
}: {
  group: Group
  members: Member[]
  incomes: Income[]
  memberName: (id: string) => string
  onChanged: () => void
}) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => todayISO())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const member = members[0]?.id ?? ''

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!member) return setError('Agregá un miembro primero.')
    if (!(amt > 0)) return setError('Ingresá un monto válido.')
    setBusy(true)
    setError(null)
    const { error: insertError } = await supabase.from('incomes').insert({
      group_id: group.id,
      member_id: member,
      amount: amt,
      date,
      note: note.trim() || null,
    })
    setBusy(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setAmount('')
    setNote('')
    setAdding(false)
    onChanged()
  }

  async function remove(id: string) {
    await supabase.from('incomes').delete().eq('id', id)
    onChanged()
  }

  return (
    <div className="space-y-4">
      {adding ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">Agregar ingreso</h2>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          </div>
          <form onSubmit={add} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <AmountCalculator value={amount} currency={group.base_currency} onChange={setAmount} autoOpen />
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (ej: Sueldo)" />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar ingreso'}
            </Button>
          </form>
        </Card>
      ) : (
        <Button onClick={() => setAdding(true)} className="w-full">
          + Agregar ingreso
        </Button>
      )}

      <HistoryList title="Ingresos previos">
        {incomes.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay ingresos cargados.</p>
        ) : (
          incomes.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
              <span className="min-w-0 truncate">
                <span className="font-medium">{i.note || 'Ingreso'}</span>
                <span className="text-slate-400"> · {i.date}</span>
                {members.length > 1 && <span className="text-slate-400"> · {memberName(i.member_id)}</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-emerald-600">{formatMoney(Number(i.amount), group.base_currency)}</span>
                <IconButton label="Quitar" onClick={() => remove(i.id)}>
                    ✕
                  </IconButton>
              </span>
            </div>
          ))
        )}
      </HistoryList>
    </div>
  )
}

