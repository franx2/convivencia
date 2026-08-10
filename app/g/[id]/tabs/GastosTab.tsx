'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, EmptyState, IconButton, Input, SectionTitle, Select, useConfirm } from '@/components/ui'
import { Donut, MonthlyBars } from '@/components/charts'
import { formatMoney } from '@/lib/currencies'
import { type CatMeta } from '@/lib/categories'
import { spendByCategory, spendByMonth } from '@/lib/balances'
import { type Expense, type Group, type Member, type RecurringExpense, type Template } from '@/lib/types'
import { monthLabelEs } from './shared'
import { RecurringExpenses } from './RecurringExpenses'

export function GastosTab({
  group,
  expenses,
  templates,
  recurring,
  members,
  myMemberId,
  cats,
  memberName,
  catMeta,
  hasMembers,
  onChanged,
}: {
  group: Group
  expenses: Expense[]
  templates: Template[]
  recurring: RecurringExpense[]
  members: Member[]
  myMemberId: string | null
  cats: CatMeta[]
  memberName: (id: string) => string
  catMeta: (v: string) => CatMeta
  hasMembers: boolean
  onChanged: () => void
}) {
  const [filter, setFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [managingTpl, setManagingTpl] = useState(false)
  const [tplLabel, setTplLabel] = useState('')
  const [tplCat, setTplCat] = useState<string>('otros')
  const [tplAmount, setTplAmount] = useState('')
  const [tplBusy, setTplBusy] = useState(false)
  const { confirm, dialog } = useConfirm()

  function remove(id: string) {
    confirm({
      title: '¿Borrar este gasto?',
      message: 'No se puede deshacer.',
      confirmLabel: 'Borrar',
      tone: 'danger',
      onConfirm: async () => {
        await supabase.from('expenses').delete().eq('id', id)
        onChanged()
      },
    })
  }

  async function addTemplate() {
    const label = tplLabel.trim()
    if (!label) return
    setTplBusy(true)
    const amt = Number(tplAmount)
    await supabase.from('templates').insert({
      group_id: group.id,
      label,
      category: tplCat,
      amount: amt > 0 ? amt : null,
    })
    setTplLabel('')
    setTplAmount('')
    setTplBusy(false)
    onChanged()
  }

  async function removeTemplate(id: string) {
    await supabase.from('templates').delete().eq('id', id)
    onChanged()
  }

  function tplHref(t: Template) {
    const p = new URLSearchParams({ title: t.label, category: t.category })
    if (t.amount != null) p.set('amount', String(t.amount))
    return `/g/${group.id}/nuevo?${p.toString()}`
  }

  const usedCats = Array.from(new Set(expenses.map((e) => e.category || 'otros')))
  // Meses con gastos, desc, para el filtro (no aplica a "viaje": ahí no se separa por mes).
  const availableMonths = Array.from(
    new Set(expenses.filter((e) => /^\d{4}-\d{2}/.test(e.date)).map((e) => e.date.slice(0, 7)))
  ).sort((a, b) => b.localeCompare(a))
  const byCategory = filter === 'all' ? expenses : expenses.filter((e) => (e.category || 'otros') === filter)
  const shown =
    monthFilter === 'all' ? byCategory : byCategory.filter((e) => e.date.slice(0, 7) === monthFilter)
  const baseOf = (e: Expense) => Number(e.amount) * Number(e.rate_to_base)

  // Gráficos (espacio personal): respetan el filtro de mes pero no el de categoría,
  // para que la torta de categorías siga siendo útil aunque estés filtrando la lista.
  const monthOnlyExpenses =
    monthFilter === 'all' ? expenses : expenses.filter((e) => e.date.slice(0, 7) === monthFilter)
  const byCat = spendByCategory(monthOnlyExpenses)
  const categoryChart = byCat.map((c) => ({
    label: catMeta(c.category).label,
    value: c.total,
    color: catMeta(c.category).hex,
    symbol: catMeta(c.category).symbol,
  }))
  const manualTotal = monthOnlyExpenses
    .filter((e) => (e.source ?? 'manual') !== 'card_import')
    .reduce((sum, e) => sum + baseOf(e), 0)
  const cardTotal = monthOnlyExpenses
    .filter((e) => (e.source ?? 'manual') === 'card_import')
    .reduce((sum, e) => sum + baseOf(e), 0)
  const sourceChart = [
    { label: 'Manual', value: manualTotal, color: '#10b981', symbol: '✍️' },
    { label: 'Tarjeta', value: cardTotal, color: '#f43f5e', symbol: '💳' },
  ]
  const byMonth = useMemo(() => spendByMonth(expenses, 6), [expenses])
  const chartMonthLbl = monthFilter === 'all' ? 'todos los meses' : monthLabelEs(monthFilter)
  // En un grupo "viaje" no interesa separar por mes: un solo bloque con el total.
  const grouped =
    group.kind === 'viaje'
      ? shown.length
        ? [{ key: 'viaje', label: 'Total del viaje', total: shown.reduce((s, e) => s + baseOf(e), 0), items: shown }]
        : []
      : groupExpensesByMonth(shown, baseOf)

  function expenseCard(e: Expense) {
    return (
      <Card key={e.id} className="flex items-center justify-between">
        <div>
          <p className="font-medium">{e.title}</p>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-slate-500">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catMeta(e.category).color}`}>
              {catMeta(e.category).symbol} {catMeta(e.category).label}
            </span>
            Pagó {memberName(e.paid_by)} · {e.date}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold">{formatMoney(Number(e.amount), e.currency)}</p>
            {e.currency !== group.base_currency && (
              <p className="text-xs text-slate-400">
                ≈ {formatMoney(Number(e.amount) * Number(e.rate_to_base), group.base_currency)}
              </p>
            )}
          </div>
          <Link
            href={`/g/${group.id}/editar/${e.id}`}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
            title="Editar"
            aria-label={`Editar ${e.title}`}
          >
            <span aria-hidden="true">✎</span>
            Editar
          </Link>
          <IconButton label="Borrar" onClick={() => remove(e.id)}>
                    ✕
                  </IconButton>
        </div>
      </Card>
    )
  }

  return (
    <div id="section-gastos" className="scroll-mt-24 space-y-3">
      {hasMembers && group.kind !== 'viaje' && (
        <RecurringExpenses
          group={group}
          members={members}
          recurring={recurring}
          cats={cats}
          catMeta={catMeta}
          memberName={memberName}
          defaultPaidBy={myMemberId ?? ''}
          onChanged={onChanged}
        />
      )}

      {hasMembers && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Gastos típicos</p>
            <button
              type="button"
              onClick={() => setManagingTpl((v) => !v)}
              className="text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              {managingTpl ? 'Listo' : 'Editar'}
            </button>
          </div>

          {templates.length === 0 && !managingTpl ? (
            <p className="text-xs text-slate-400">
              Creá atajos de un tap (Super, Delivery, Nafta) con “Editar”.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center">
                  <Link
                    href={tplHref(t)}
                    className={`rounded-full px-3 py-1 text-sm font-medium ${catMeta(t.category).color}`}
                  >
                    <span className="mr-1">{catMeta(t.category).symbol}</span>
                    {t.label}
                    {t.amount != null && (
                      <span className="ml-1 opacity-70">{formatMoney(Number(t.amount), group.base_currency)}</span>
                    )}
                  </Link>
                  {managingTpl && (
                    <IconButton label="Quitar plantilla" onClick={() => removeTemplate(t.id)} className="ml-1">
                    ✕
                  </IconButton>
                  )}
                </div>
              ))}
            </div>
          )}

          {managingTpl && (
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <div className="flex gap-2">
                <Input
                  value={tplLabel}
                  onChange={(e) => setTplLabel(e.target.value)}
                  placeholder="Nombre (ej: Super)"
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tplAmount}
                  onChange={(e) => setTplAmount(e.target.value)}
                  placeholder="Monto (opc.)"
                  className="max-w-[130px]"
                />
              </div>
              <div className="flex gap-2">
                <Select value={tplCat} onChange={(e) => setTplCat(e.target.value)}>
                  {cats.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.symbol} {c.label}
                    </option>
                  ))}
                </Select>
                <Button type="button" onClick={addTemplate} disabled={tplBusy || !tplLabel.trim()}>
                  Agregar
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        {expenses.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-[200px]">
              <option value="all">Todas las categorías</option>
              {usedCats.map((c) => (
                <option key={c} value={c}>
                  {catMeta(c).symbol} {catMeta(c).label}
                </option>
              ))}
            </Select>
            {group.kind !== 'viaje' && availableMonths.length > 0 && (
              <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="max-w-[180px]">
                <option value="all">Todos los meses</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {monthLabelEs(m)}
                  </option>
                ))}
              </Select>
            )}
          </div>
        ) : (
          <span />
        )}
        {hasMembers ? (
          <div className="flex gap-2">
            <Link href={`/g/${group.id}/nuevo`}>
              <Button>+ Agregar gasto</Button>
            </Link>
          </div>
        ) : (
          <p className="text-sm text-amber-600">Agregá miembros antes de cargar gastos.</p>
        )}
      </div>

      {group.is_personal && expenses.length > 0 && (
        <div className="space-y-3">
          <Card>
            <SectionTitle>Gastos por categoría · {chartMonthLbl}</SectionTitle>
            {categoryChart.length > 0 ? (
              <Donut data={categoryChart} format={(n) => formatMoney(n, group.base_currency)} />
            ) : (
              <p className="text-sm text-slate-500">Sin gastos en {chartMonthLbl}.</p>
            )}
          </Card>
          <Card>
            <SectionTitle>Origen del gasto · {chartMonthLbl}</SectionTitle>
            {manualTotal > 0 || cardTotal > 0 ? (
              <Donut data={sourceChart} format={(n) => formatMoney(n, group.base_currency)} />
            ) : (
              <p className="text-sm text-slate-500">Sin gastos en {chartMonthLbl}.</p>
            )}
          </Card>
          <Card>
            <SectionTitle>Gasto por mes (todos)</SectionTitle>
            <MonthlyBars data={byMonth} format={(n) => formatMoney(n, group.base_currency)} />
          </Card>
        </div>
      )}

      {expenses.length === 0 ? (
        <EmptyState>Todavía no hay gastos.</EmptyState>
      ) : grouped.length === 0 ? (
        <EmptyState>No hay gastos para este filtro.</EmptyState>
      ) : (
        grouped.map((month) => (
          <section key={month.key} className="space-y-2">
            <div className="flex items-center gap-3 px-1 pt-2">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {month.label} · {formatMoney(month.total, group.base_currency)}
              </div>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
            {month.items.map(expenseCard)}
          </section>
        ))
      )}
      {dialog}
    </div>
  )
}

export function groupExpensesByMonth(expenses: Expense[], baseOf: (expense: Expense) => number) {
  const map = new Map<string, { key: string; label: string; total: number; items: Expense[] }>()
  for (const expense of expenses) {
    const key = /^\d{4}-\d{2}/.test(expense.date) ? expense.date.slice(0, 7) : 'sin-fecha'
    const label = key === 'sin-fecha' ? 'Sin fecha' : monthLabelEs(key)
    const current = map.get(key) ?? { key, label, total: 0, items: [] }
    current.total += baseOf(expense)
    current.items.push(expense)
    map.set(key, current)
  }
  return [...map.values()]
}
