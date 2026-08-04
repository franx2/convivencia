'use client'

import { useMemo, useState } from 'react'
import { Card, Select } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { type Expense, type Group, type Income, type Saving } from '@/lib/types'
import { MetricCard, monthLabelEs } from './shared'

export function PersonalSummaryTab({
  group,
  expenses,
  incomes,
  savings,
}: {
  group: Group
  expenses: Expense[]
  incomes: Income[]
  savings: Saving[]
}) {
  const fmt = (n: number) => formatMoney(n, group.base_currency)
  // Meses con datos (gastos + ingresos + ahorros) + el actual, desc (mismo criterio que Balances).
  const months = useMemo(() => {
    const set = new Set<string>()
    for (const e of expenses) if (/^\d{4}-\d{2}/.test(e.date)) set.add(String(e.date).slice(0, 7))
    for (const i of incomes) if (/^\d{4}-\d{2}/.test(i.date)) set.add(String(i.date).slice(0, 7))
    for (const s of savings) if (/^\d{4}-\d{2}/.test(s.date)) set.add(String(s.date).slice(0, 7))
    set.add(new Date().toISOString().slice(0, 7))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [expenses, incomes, savings])
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const baseOf = (e: Expense) => Number(e.amount) * Number(e.rate_to_base)
  const monthExpenses = expenses.filter((e) => String(e.date).slice(0, 7) === month)
  const monthIncomes = incomes.filter((i) => String(i.date).slice(0, 7) === month)
  const monthSavings = savings.filter((s) => String(s.date).slice(0, 7) === month)
  const expenseTotal = monthExpenses.reduce((sum, e) => sum + baseOf(e), 0)
  const incomeTotal = monthIncomes.reduce((sum, i) => sum + Number(i.amount), 0)
  const savingTotal = monthSavings.reduce((sum, s) => sum + Number(s.amount), 0)

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-2">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[180px]">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabelEs(m)}
            </option>
          ))}
        </Select>
      </Card>

      <div className="grid gap-2 sm:grid-cols-3">
        <MetricCard label="Ingresos" value={fmt(incomeTotal)} tone="text-emerald-600" />
        <MetricCard label="Gastos" value={fmt(expenseTotal)} tone="text-rose-600" />
        <MetricCard label="Ahorros" value={fmt(savingTotal)} tone="text-amber-600" />
      </div>
    </div>
  )
}

