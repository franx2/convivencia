'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Card, Disclosure, EmptyState, IconButton, Input, SectionTitle, Select, shortDate, TextButton, useConfirm } from '@/components/ui'
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
      <Card key={e.id} className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/g/${group.id}/editar/${e.id}`} className="min-w-0 flex-1 break-words font-medium leading-snug">
            {e.title}
          </Link>
          <div className="shrink-0 text-right">
            <p className="font-semibold tabular-nums">{formatMoney(Number(e.amount), e.currency)}</p>
            {e.currency !== group.base_currency && (
              <p className="text-xs tabular-nums text-muted">
                ≈ {formatMoney(Number(e.amount) * Number(e.rate_to_base), group.base_currency)}
              </p>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catMeta(e.category).color}`}>
              {catMeta(e.category).symbol} {catMeta(e.category).label}
            </span>
            <span>
              {group.is_personal ? '' : `Pagó ${memberName(e.paid_by)} · `}
              {shortDate(e.date)}
            </span>
          </p>
          <div className="flex shrink-0 items-center">
            <Link
              href={`/g/${group.id}/editar/${e.id}`}
              title="Editar"
              aria-label={`Editar ${e.title}`}
              className="-my-2 grid h-11 w-11 place-items-center rounded-full text-emerald-700 transition active:bg-emerald-50 dark:text-[#4ee6b0] dark:active:bg-[#173e32]"
            >
              <Pencil size={18} strokeWidth={2.2} aria-hidden="true" />
            </Link>
            <IconButton label="Borrar" onClick={() => remove(e.id)} />
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div id="section-gastos" className={`scroll-mt-24 space-y-3 ${hasMembers ? 'pb-16' : ''}`}>
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
            <TextButton tone="muted" onClick={() => setManagingTpl((v) => !v)}>
              {managingTpl ? 'Listo' : 'Editar'}
            </TextButton>
          </div>

          {templates.length === 0 && !managingTpl ? (
            <p className="text-xs text-muted">
              Creá atajos de un tap (Super, Delivery, Nafta) con “Editar”.
            </p>
          ) : (
            // Una sola fila que se desliza: envueltos, los atajos empujaban la lista hacia abajo.
            <div className={`-mx-4 flex gap-2 px-4 ${managingTpl ? 'flex-wrap' : 'no-scrollbar overflow-x-auto'}`}>
              {templates.map((t) => (
                <div key={t.id} className="flex shrink-0 items-center">
                  <Link
                    href={tplHref(t)}
                    className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium ${catMeta(t.category).color}`}
                  >
                    <span className="mr-1">{catMeta(t.category).symbol}</span>
                    {t.label}
                    {t.amount != null && (
                      <span className="ml-1 opacity-70">{formatMoney(Number(t.amount), group.base_currency)}</span>
                    )}
                  </Link>
                  {managingTpl && (
                    <IconButton label="Quitar plantilla" onClick={() => removeTemplate(t.id)} />
                  )}
                </div>
              ))}
            </div>
          )}

          {managingTpl && (
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
                <Input
                  value={tplLabel}
                  onChange={(e) => setTplLabel(e.target.value)}
                  placeholder="Nombre (ej: Super)"
                  enterKeyHint="next"
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tplAmount}
                  onChange={(e) => setTplAmount(e.target.value)}
                  placeholder="Monto"
                  aria-label="Monto (opcional)"
                />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
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

      {expenses.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filtrar por categoría"
              className={group.kind !== 'viaje' && availableMonths.length > 0 ? '' : 'col-span-2'}
            >
              <option value="all">Categorías</option>
              {usedCats.map((c) => (
                <option key={c} value={c}>
                  {catMeta(c).symbol} {catMeta(c).label}
                </option>
              ))}
            </Select>
            {group.kind !== 'viaje' && availableMonths.length > 0 && (
              <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Filtrar por mes">
                <option value="all">Meses</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {monthLabelEs(m)}
                  </option>
                ))}
              </Select>
            )}
          </div>
      )}
      {hasMembers ? (
        // Cargar un gasto es lo más frecuente de la app: queda siempre al alcance del pulgar.
        <Link
          href={`/g/${group.id}/nuevo`}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-emerald-700 pl-4 pr-5 font-semibold text-white shadow-[0_8px_24px_rgba(4,120,87,0.4)] transition active:scale-95 sm:right-[max(1rem,calc(50vw-23rem))] dark:bg-[#4ee6b0] dark:text-[#062419] dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        >
          <Plus size={22} strokeWidth={2.6} aria-hidden="true" />
          Agregar gasto
        </Link>
      ) : (
        <p className="text-sm text-amber-700 dark:text-amber-400">Agregá miembros antes de cargar gastos.</p>
      )}

      {group.is_personal && expenses.length > 0 && (
        <Disclosure summary={<span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Gráficos · {chartMonthLbl}</span>}>
        <div className="space-y-5">
          <div>
            <SectionTitle>Gastos por categoría</SectionTitle>
            {categoryChart.length > 0 ? (
              <Donut data={categoryChart} format={(n) => formatMoney(n, group.base_currency)} />
            ) : (
              <p className="text-sm text-muted">Sin gastos en {chartMonthLbl}.</p>
            )}
          </div>
          <div>
            <SectionTitle>Origen del gasto</SectionTitle>
            {manualTotal > 0 || cardTotal > 0 ? (
              <Donut data={sourceChart} format={(n) => formatMoney(n, group.base_currency)} />
            ) : (
              <p className="text-sm text-muted">Sin gastos en {chartMonthLbl}.</p>
            )}
          </div>
          <div>
            <SectionTitle>Gasto por mes (todos)</SectionTitle>
            <MonthlyBars data={byMonth} format={(n) => formatMoney(n, group.base_currency)} />
          </div>
        </div>
        </Disclosure>
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
              <div className="rounded-full bg-slate-100 px-3 py-1 text-center text-xs font-bold uppercase tracking-wide text-muted tabular-nums dark:bg-slate-800">
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
