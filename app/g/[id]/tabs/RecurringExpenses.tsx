'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Checkbox, ErrorText, IconButton, Input, SectionTitle, Select, useConfirm } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { isServiceDue } from '@/lib/dates'
import { type CatMeta } from '@/lib/categories'
import { type Group, type Member, type RecurringExpense } from '@/lib/types'

/**
 * Gastos fijos (alquiler, expensas, servicios, suscripciones). El gasto real lo
 * crea la base una vez por mes con pg_cron; acá solo se define la plantilla.
 * Ver supabase/migration_recurring_expenses.sql.
 */
export function RecurringExpenses({
  group,
  members,
  recurring,
  cats,
  catMeta,
  memberName,
  defaultPaidBy,
  onChanged,
}: {
  group: Group
  members: Member[]
  recurring: RecurringExpense[]
  cats: CatMeta[]
  catMeta: (v: string) => CatMeta
  memberName: (id: string) => string
  defaultPaidBy: string
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('1')
  const [paidBy, setPaidBy] = useState('')
  const [category, setCategory] = useState('otros')
  const [accountNumber, setAccountNumber] = useState('')
  const [amountFixed, setAmountFixed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const missingTable = (msg: string) =>
    /amount_fixed/i.test(msg)
      ? 'Falta correr supabase/migration_gastos_variables.sql en Supabase.'
      : /account_number/i.test(msg)
        ? 'Falta correr supabase/migration_servicio_cuenta.sql en Supabase.'
        : /recurring_expenses/i.test(msg)
          ? 'Falta correr supabase/migration_recurring_expenses.sql en Supabase.'
          : msg

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    const d = Number(day)
    const payer = paidBy || defaultPaidBy || members[0]?.id
    if (!title.trim()) return setError('Poné un nombre (ej: Alquiler).')
    if (amountFixed && !(amt > 0)) return setError('Ingresá un monto válido.')
    if (!(d >= 1 && d <= 31)) return setError('El día tiene que estar entre 1 y 31.')
    if (!payer) return setError('Agregá un miembro antes de crear un gasto fijo.')

    setBusy(true)
    setError(null)
    const { data, error: insErr } = await supabase
      .from('recurring_expenses')
      .insert({
        group_id: group.id,
        title: title.trim(),
        amount: amt > 0 ? amt : null,
        amount_fixed: amountFixed,
        currency: group.base_currency,
        paid_by: payer,
        category,
        day_of_month: d,
        account_number: accountNumber.trim() || null,
      })
      .select('id')
      .single()

    if (insErr || !data) {
      setBusy(false)
      setError(missingTable(insErr?.message ?? 'No se pudo crear el gasto fijo.'))
      return
    }

    // Se reparte entre todos los miembros del grupo. En el espacio personal
    // hay uno solo, así que queda a cargo de esa persona.
    const shares = members.map((m) => ({ recurring_id: (data as { id: string }).id, member_id: m.id, weight: 1 }))
    if (shares.length) await supabase.from('recurring_expense_shares').insert(shares)

    setTitle('')
    setAmount('')
    setDay('1')
    setAccountNumber('')
    setAmountFixed(true)
    setBusy(false)
    setAdding(false)
    onChanged()
  }

  async function toggleActive(item: RecurringExpense) {
    await supabase.from('recurring_expenses').update({ active: !item.active }).eq('id', item.id)
    onChanged()
  }

  function remove(item: RecurringExpense) {
    confirm({
      title: `¿Borrar "${item.title}"?`,
      message: 'Deja de generarse todos los meses. Los gastos ya creados quedan como están.',
      confirmLabel: 'Borrar',
      tone: 'danger',
      onConfirm: async () => {
        await supabase.from('recurring_expenses').delete().eq('id', item.id)
        onChanged()
      },
    })
  }

  return (
    <Card>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v)
              setError(null)
            }}
            className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            {adding ? 'Cancelar' : '+ Agregar'}
          </button>
        }
      >
        Gastos fijos
      </SectionTitle>

      {recurring.length === 0 && !adding ? (
        <p className="text-xs text-slate-400">
          Alquiler, expensas, servicios: se cargan solos todos los meses el día que elijas.
        </p>
      ) : (
        <div className="space-y-2">
          {recurring.map((item) => {
            const pending = isPending(item)
            return (
              <div
                key={item.id}
                className={`rounded-lg border px-3 py-2 ${
                  pending
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                    : 'border-slate-100 dark:border-slate-800'
                } ${item.active ? '' : 'opacity-50'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {catMeta(item.category).symbol} {item.title}
                    </p>
                    <p className="text-xs text-slate-400">
                      Día {item.day_of_month} ·{' '}
                      {item.amount_fixed
                        ? formatMoney(Number(item.amount), item.currency)
                        : item.amount != null
                          ? `~${formatMoney(Number(item.amount), item.currency)} (variable)`
                          : 'monto variable'}
                      {members.length > 1 ? ` · paga ${memberName(item.paid_by)}` : ''}
                      {item.active ? '' : ' · en pausa'}
                    </p>
                    {item.account_number && (
                      <p className="truncate text-xs text-slate-400">NIC/cuenta: {item.account_number}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleActive(item)}
                      className="text-xs font-medium text-slate-400 hover:text-emerald-600"
                    >
                      {item.active ? 'Pausar' : 'Reanudar'}
                    </button>
                    <IconButton label="Borrar" onClick={() => remove(item)}>
                      ✕
                    </IconButton>
                  </div>
                </div>
                {pending && (
                  <Link
                    href={recurringHref(group.id, item)}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95"
                  >
                    Ya llegó el día — cargar {item.title} con el monto real →
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}

      {adding && (
        <form onSubmit={add} className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre (ej: Alquiler)" autoFocus />
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={amountFixed ? `Monto (${group.base_currency})` : 'Monto de referencia (opcional)'}
            />
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Checkbox checked={amountFixed} onChange={(e) => setAmountFixed(e.target.checked)} className="mt-0.5" />
            <span>
              Monto fijo: se carga solo todos los meses con este monto.
              <br />
              Desmarcá esto para servicios de monto variable (luz, gas): no se carga solo, te lo recuerdo el día
              elegido para que lo cargues vos con el monto real de la factura.
            </span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Día del mes</span>
              <Input type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Categoría</span>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {cats.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.symbol} {c.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <Input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="NIC / N° de cuenta (opcional)"
          />
          {members.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Lo paga</span>
              <Select value={paidBy || defaultPaidBy || members[0]?.id} onChange={(e) => setPaidBy(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <p className="text-xs text-slate-400">
            {members.length > 1
              ? 'Se reparte entre todos los miembros. Podés editar el gasto de cada mes después.'
              : 'Se genera automáticamente todos los meses.'}
          </p>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar gasto fijo'}
          </Button>
        </form>
      )}
      {dialog}
    </Card>
  )
}

// Recordatorio de monto variable: llegó el día y todavía no se cargó el gasto
// real de este mes (last_month solo se actualiza cuando se carga desde acá).
function isPending(item: RecurringExpense): boolean {
  if (!item.active || item.amount_fixed) return false
  return isServiceDue(item.day_of_month, item.last_month)
}

function recurringHref(groupId: string, item: RecurringExpense): string {
  const p = new URLSearchParams({ title: item.title, category: item.category, recurring: item.id })
  if (item.amount != null) p.set('amount', String(item.amount))
  return `/g/${groupId}/nuevo?${p.toString()}`
}
