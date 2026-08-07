'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, EmptyState, ErrorText, IconButton, Input, SectionTitle, Select } from '@/components/ui'
import { Donut, MonthlyBars } from '@/components/charts'
import { formatMoney } from '@/lib/currencies'
import { type CatMeta } from '@/lib/categories'
import { computeBalances, spendByCategory, spendByMonth } from '@/lib/balances'
import { type Budget, type Expense, type ExpenseShare, type Group, type Income, type Member, type Payment } from '@/lib/types'
import { monthLabelEs } from './shared'
import { currentMonth, todayISO } from '@/lib/dates'

export function BalancesTab({
  group,
  members,
  expenses,
  shares,
  payments,
  budgets,
  incomes,
  cats,
  catMeta,
  memberName,
  onChanged,
}: {
  group: Group
  members: Member[]
  expenses: Expense[]
  shares: ExpenseShare[]
  payments: Payment[]
  budgets: Budget[]
  incomes: Income[]
  cats: CatMeta[]
  catMeta: (v: string) => CatMeta
  memberName: (id: string) => string
  onChanged: () => void
}) {
  const fmt = (n: number) => formatMoney(n, group.base_currency)
  const baseOf = (e: Expense) => Number(e.amount) * Number(e.rate_to_base)
  const personal = group.is_personal
  // En un grupo "viaje" no separamos por mes: todo se ve como un total único.
  const isTrip = !personal && group.kind === 'viaje'

  // Meses con datos (gastos + ingresos) + el actual, desc.
  const months = useMemo(() => {
    const set = new Set<string>()
    for (const e of expenses) if (/^\d{4}-\d{2}/.test(e.date)) set.add(String(e.date).slice(0, 7))
    for (const i of incomes) if (/^\d{4}-\d{2}/.test(i.date)) set.add(String(i.date).slice(0, 7))
    set.add(currentMonth())
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [expenses, incomes])

  const [month, setMonth] = useState(() => currentMonth())
  const [who, setWho] = useState<string>('all') // 'all' | member_id

  const monthExpenses = expenses.filter(
    (e) => (isTrip || String(e.date).slice(0, 7) === month) && (who === 'all' || e.paid_by === who)
  )
  const monthIncomes = incomes.filter(
    (i) => (isTrip || String(i.date).slice(0, 7) === month) && (who === 'all' || i.member_id === who)
  )
  const gastosMes = monthExpenses.reduce((s, e) => s + baseOf(e), 0)
  const ingresosMes = monthIncomes.reduce((s, i) => s + Number(i.amount), 0)
  const balanceMes = ingresosMes - gastosMes

  const byCat = spendByCategory(monthExpenses)
  const donutData = byCat.map((c) => ({
    label: catMeta(c.category).label,
    value: c.total,
    color: catMeta(c.category).hex,
    symbol: catMeta(c.category).symbol,
  }))
  const byMonth = useMemo(() => spendByMonth(expenses, 6), [expenses])

  // Gasto del MES seleccionado por categoría (grupo entero, para el presupuesto).
  // En viaje, sin filtro de mes: es el total del viaje por categoría.
  const monthByCat = new Map<string, number>()
  for (const e of expenses) {
    if (!isTrip && String(e.date).slice(0, 7) !== month) continue
    monthByCat.set(e.category || 'otros', (monthByCat.get(e.category || 'otros') ?? 0) + baseOf(e))
  }

  const balances = useMemo(
    () => computeBalances(members, expenses, shares, payments),
    [members, expenses, shares, payments]
  )

  const [editingBudgets, setEditingBudgets] = useState(false)
  const [bCat, setBCat] = useState<string>('supermercado')
  const [bAmount, setBAmount] = useState('')
  const [bBusy, setBBusy] = useState(false)

  // Ingresos
  const [showIncForm, setShowIncForm] = useState(false)
  const [incMember, setIncMember] = useState('')
  const [incAmount, setIncAmount] = useState('')
  const [incDate, setIncDate] = useState(() => todayISO())
  const [incNote, setIncNote] = useState('')
  const [incBusy, setIncBusy] = useState(false)
  const [incError, setIncError] = useState<string | null>(null)

  async function saveBudget() {
    const amt = Number(bAmount)
    if (!(amt > 0)) return
    setBBusy(true)
    await supabase
      .from('budgets')
      .upsert({ group_id: group.id, category: bCat, amount: amt }, { onConflict: 'group_id,category' })
    setBAmount('')
    setBBusy(false)
    onChanged()
  }

  async function removeBudget(id: string) {
    await supabase.from('budgets').delete().eq('id', id)
    onChanged()
  }

  async function addIncome() {
    const amt = Number(incAmount)
    const member = incMember || members[0]?.id
    if (!member) return setIncError('Agregá un miembro primero.')
    if (!(amt > 0)) return setIncError('Ingresá un monto válido.')
    setIncBusy(true)
    setIncError(null)
    const { error } = await supabase.from('incomes').insert({
      group_id: group.id,
      member_id: member,
      amount: amt,
      date: incDate,
      note: incNote.trim() || null,
    })
    setIncBusy(false)
    if (error) {
      setIncError(/incomes/.test(error.message) ? 'Falta correr la migración de ingresos (migration_ingresos.sql).' : error.message)
      return
    }
    setIncAmount('')
    setIncNote('')
    setShowIncForm(false)
    onChanged()
  }

  async function removeIncome(id: string) {
    await supabase.from('incomes').delete().eq('id', id)
    onChanged()
  }

  const monthLbl = isTrip ? 'Todo el viaje' : monthLabelEs(month)
  const whoLbl = who === 'all' ? null : memberName(who)

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <Card className="flex flex-wrap items-center gap-2">
        {!isTrip && (
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[180px]">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabelEs(m)}
              </option>
            ))}
          </Select>
        )}
        {!personal && members.length > 1 && (
          <Select value={who} onChange={(e) => setWho(e.target.value)} className="max-w-[160px]">
            <option value="all">Todos</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        )}
      </Card>

      {/* Balance del mes */}
      <Card>
        <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          Balance · {monthLbl}
          {whoLbl ? ` · ${whoLbl}` : ''}
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-slate-400">Ingresos</p>
            <p className="font-semibold text-emerald-600">{fmt(ingresosMes)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Gastos</p>
            <p className="font-semibold text-slate-700 dark:text-slate-200">{fmt(gastosMes)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Balance</p>
            <p className={`font-semibold ${balanceMes >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {fmt(balanceMes)}
            </p>
          </div>
        </div>
      </Card>

      {/* Donut filtrado */}
      <div id="section-resumen" className="scroll-mt-24">
        {byCat.length > 0 ? (
          <Card>
          <SectionTitle>
            Gastos por categoría · {monthLbl}
            {whoLbl ? ` · ${whoLbl}` : ''}
          </SectionTitle>
          <Donut data={donutData} format={fmt} />
          </Card>
        ) : (
          <EmptyState>{isTrip ? 'Sin gastos en el viaje.' : `Sin gastos en ${monthLbl}.`}</EmptyState>
        )}
      </div>

      {/* Ingresos del mes */}
      <Card className="scroll-mt-24" id="section-ingresos">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Ingresos · {monthLbl}</p>
          <button
            type="button"
            onClick={() => {
              setShowIncForm((v) => !v)
              setIncError(null)
            }}
            className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            {showIncForm ? 'Cancelar' : '+ Agregar ingreso'}
          </button>
        </div>

        {showIncForm && (
          <div className="mb-3 space-y-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              {!personal && (
                <Select value={incMember || members[0]?.id || ''} onChange={(e) => setIncMember(e.target.value)}>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              )}
              <Input
                type="number"
                step="0.01"
                min="0"
                value={incAmount}
                onChange={(e) => setIncAmount(e.target.value)}
                placeholder={`Monto (${group.base_currency})`}
              />
              <Input type="date" value={incDate} onChange={(e) => setIncDate(e.target.value)} />
            </div>
            <Input value={incNote} onChange={(e) => setIncNote(e.target.value)} placeholder="Nota (ej: Sueldo)" />
            <ErrorText>{incError}</ErrorText>
            <Button type="button" onClick={addIncome} disabled={incBusy}>
              {incBusy ? 'Guardando…' : 'Guardar ingreso'}
            </Button>
          </div>
        )}

        {monthIncomes.length === 0 ? (
          <p className="text-xs text-slate-400">
            {isTrip ? 'No hay ingresos cargados en el viaje.' : `No hay ingresos cargados en ${monthLbl}.`}
          </p>
        ) : (
          <div className="space-y-1.5">
            {monthIncomes.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                  {!personal && <span className="font-medium">{memberName(i.member_id)} · </span>}
                  {i.note || 'Ingreso'}
                  <span className="text-slate-400"> · {i.date}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-emerald-600">{fmt(Number(i.amount))}</span>
                  <IconButton label="Quitar" onClick={() => removeIncome(i.id)}>
                    ✕
                  </IconButton>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tendencia (no aplica a un viaje: no separamos por mes) */}
      {!isTrip && (
        <Card>
          <SectionTitle>Gasto por mes (todos)</SectionTitle>
          <MonthlyBars data={byMonth} format={fmt} />
        </Card>
      )}

      <Card className="scroll-mt-24" id="section-presupuestos">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Presupuesto · {monthLbl}</p>
          <button
            type="button"
            onClick={() => setEditingBudgets((v) => !v)}
            className="text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            {editingBudgets ? 'Listo' : 'Editar'}
          </button>
        </div>

        {budgets.length === 0 && !editingBudgets ? (
          <p className="text-xs text-slate-400">
            Definí límites mensuales por categoría con “Editar” (ej: Super $80.000).
          </p>
        ) : (
          <div className="space-y-3">
            {budgets.map((b) => {
              const spent = monthByCat.get(b.category) ?? 0
              const limit = Number(b.amount)
              const ratio = limit > 0 ? spent / limit : 0
              const pct = Math.min(100, Math.round(ratio * 100))
              const barColor = ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'
              const txtColor = ratio >= 1 ? 'text-red-600' : ratio >= 0.8 ? 'text-amber-600' : 'text-slate-600'
              return (
                <div key={b.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catMeta(b.category).color}`}>
                      {catMeta(b.category).symbol} {catMeta(b.category).label}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={txtColor}>
                        {fmt(spent)} / {fmt(limit)}
                      </span>
                      {editingBudgets && (
                        <IconButton label="Quitar" onClick={() => removeBudget(b.id)}>
                    ✕
                  </IconButton>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  {ratio >= 1 ? (
                    <p className="mt-0.5 text-xs text-red-600">Te pasaste del presupuesto.</p>
                  ) : ratio >= 0.8 ? (
                    <p className="mt-0.5 text-xs text-amber-600">Vas {Math.round(ratio * 100)}% del presupuesto.</p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {editingBudgets && (
          <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
            <Select value={bCat} onChange={(e) => setBCat(e.target.value)}>
              {cats.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.symbol} {c.label}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={bAmount}
              onChange={(e) => setBAmount(e.target.value)}
              placeholder="Límite"
              className="max-w-[130px]"
            />
            <Button type="button" onClick={saveBudget} disabled={bBusy || !(Number(bAmount) > 0)}>
              Guardar
            </Button>
          </div>
        )}
      </Card>

      {!personal && (
        <>
          <p className="px-1 pt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Saldos (acumulado)
          </p>
          {balances.map((b) => (
            <Card key={b.memberId} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{b.name}</p>
                <p className="text-xs text-slate-400">
                  Puso {formatMoney(b.paid, group.base_currency)} · Le tocaba{' '}
                  {formatMoney(b.share, group.base_currency)}
                </p>
              </div>
              <span
                className={`font-semibold ${
                  b.net > 0.005 ? 'text-emerald-600' : b.net < -0.005 ? 'text-red-600' : 'text-slate-400'
                }`}
              >
                {b.net > 0 ? '+' : ''}
                {formatMoney(b.net, group.base_currency)}
              </span>
            </Card>
          ))}
          <p className="px-1 text-xs text-slate-400">
            Verde = le deben · Rojo = debe. Todo en {group.base_currency}.
          </p>
        </>
      )}
    </div>
  )
}

