'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Input, Modal } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { type CatMeta } from '@/lib/categories'
import { spendByCategory } from '@/lib/balances'
import { type Budget, type Expense, type Group, type Income, type Saving } from '@/lib/types'
import { monthLabelEs } from './shared'
import { type PersonalTab } from '../tabs-types'

export function PersonalDashboard({
  group,
  expenses,
  incomes,
  savings,
  budgets,
  catMeta,
  onOpenTab,
  onChanged,
}: {
  group: Group
  expenses: Expense[]
  incomes: Income[]
  savings: Saving[]
  budgets: Budget[]
  catMeta: (v: string) => CatMeta
  onOpenTab: (tab: PersonalTab) => void
  onChanged: () => void
}) {
  const fmt = (n: number) => formatMoney(n, group.base_currency)
  const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('es-AR')
  const baseOf = (e: Expense) => Number(e.amount) * Number(e.rate_to_base)
  const today = new Date().toISOString().slice(0, 10)
  const currentMonth = today.slice(0, 7)
  const monthExpenses = expenses.filter((e) => String(e.date).slice(0, 7) === currentMonth)
  const monthIncomes = incomes.filter((i) => String(i.date).slice(0, 7) === currentMonth)
  const monthExpenseTotal = monthExpenses.reduce((sum, e) => sum + baseOf(e), 0)
  const monthIncomeTotal = monthIncomes.reduce((sum, i) => sum + Number(i.amount), 0)
  const monthSavings = savings
    .filter((s) => String(s.date).slice(0, 7) === currentMonth)
    .reduce((sum, s) => sum + Number(s.amount), 0)

  // Balance acumulado con saldo inicial / ajuste opcional (item 10): si hay
  // baseline_date, arranca en baseline_amount y solo cuenta movimientos con
  // date >= baseline_date. Sin baseline, cuenta todo. No borra historial.
  const baselineDate = group.baseline_date ?? null
  const baselineAmount = Number(group.baseline_amount ?? 0)
  const countedIncomes = baselineDate ? incomes.filter((i) => String(i.date) >= baselineDate) : incomes
  const countedExpenses = baselineDate ? expenses.filter((e) => String(e.date) >= baselineDate) : expenses
  const sumCountedIncomes = countedIncomes.reduce((sum, i) => sum + Number(i.amount), 0)
  const sumCountedExpenses = countedExpenses.reduce((sum, e) => sum + baseOf(e), 0)
  const balance = baselineAmount + sumCountedIncomes - sumCountedExpenses

  const [showBalance, setShowBalance] = useState(false)
  const [resetAmount, setResetAmount] = useState('')
  const [resetDate, setResetDate] = useState(today)
  const [savingReset, setSavingReset] = useState(false)

  function openBalanceInfo() {
    setResetAmount(String(Math.round(balance * 100) / 100))
    setResetDate(baselineDate ?? today)
    setShowBalance(true)
  }
  async function applyBaseline() {
    setSavingReset(true)
    const amt = Number(resetAmount.replace(',', '.')) || 0
    await supabase.from('groups').update({ baseline_amount: amt, baseline_date: resetDate }).eq('id', group.id)
    setSavingReset(false)
    setShowBalance(false)
    onChanged()
  }
  async function clearBaseline() {
    setSavingReset(true)
    await supabase.from('groups').update({ baseline_amount: 0, baseline_date: null }).eq('id', group.id)
    setSavingReset(false)
    setShowBalance(false)
    onChanged()
  }

  const topCategories = spendByCategory(monthExpenses).slice(0, 3)
  const monthByCat = new Map<string, number>()
  for (const e of monthExpenses) {
    const cat = e.category || 'otros'
    monthByCat.set(cat, (monthByCat.get(cat) ?? 0) + baseOf(e))
  }
  const budgetLimit = budgets.reduce((sum, b) => sum + Number(b.amount), 0)
  const budgetSpent = budgets.reduce((sum, b) => sum + (monthByCat.get(b.category) ?? 0), 0)
  const budgetPct = budgetLimit > 0 ? Math.min(100, Math.round((budgetSpent / budgetLimit) * 100)) : 0

  return (
    <section className="mb-5 overflow-hidden rounded-3xl bg-emerald-800 text-white shadow-sm dark:bg-emerald-950">
      <div className="flex items-center justify-between px-5 pb-8 pt-5">
        <div>
          <p className="text-sm font-semibold text-emerald-100">{monthLabelEs(currentMonth)}</p>
          <h2 className="mt-1 text-xl font-bold">Mis cuentas</h2>
        </div>
        <Link
          href={`/g/${group.id}/nuevo`}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-4xl leading-none text-emerald-700 shadow-sm"
          aria-label="Agregar gasto"
        >
          +
        </Link>
      </div>

      <div className="-mt-3 rounded-t-[2rem] bg-white px-4 pb-5 pt-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mb-5 flex rounded-full bg-slate-100 p-1 text-sm font-bold dark:bg-slate-900">
          <button
            type="button"
            onClick={() => onOpenTab('gastos')}
            className="flex-1 rounded-full bg-white py-2 text-center text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-300"
          >
            Mis gastos
          </button>
          <button
            type="button"
            onClick={() => onOpenTab('tarjetas')}
            className="flex-1 py-2 text-center text-slate-400"
          >
            Mis tarjetas
          </button>
        </div>

        <button type="button" onClick={openBalanceInfo} className="mb-5 block w-full text-left">
          <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-800 dark:text-emerald-300">
            Balance acumulado
            <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              i
            </span>
          </span>
          <span className={`mt-1 block text-5xl font-bold tracking-normal ${balance >= 0 ? 'text-emerald-700' : 'text-rose-500'}`}>
            {fmt(balance)}
          </span>
          {baselineDate && (
            <span className="mt-1 block text-xs text-slate-400">
              desde {fmtDate(baselineDate)} · saldo inicial {fmt(baselineAmount)}
            </span>
          )}
        </button>

        {showBalance && (
          <Modal title="Balance acumulado" onClose={() => setShowBalance(false)}>
              <div className="space-y-4 text-slate-900 dark:text-slate-100">
                <p className="text-sm text-slate-500">
                  Es lo que te queda sumando ingresos y restando gastos
                  {baselineDate ? ' desde el saldo inicial que fijaste.' : ' desde el principio.'}
                </p>
                <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-900">
                  {baselineDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Saldo inicial ({fmtDate(baselineDate)})</span>
                      <span className="font-semibold">{fmt(baselineAmount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Ingresos contados</span>
                    <span className="font-semibold text-emerald-600">+ {fmt(sumCountedIncomes)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Gastos contados</span>
                    <span className="font-semibold text-rose-500">− {fmt(sumCountedExpenses)}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Balance</span>
                      <span className={`text-lg font-bold ${balance >= 0 ? 'text-emerald-700' : 'text-rose-500'}`}>
                        {fmt(balance)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-sm font-bold">Fijar saldo inicial</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Poné cuánto tenés hoy. El balance arranca de ese número y suma/resta solo lo nuevo. No se borra nada del
                    historial.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">Monto</span>
                      <Input value={resetAmount} onChange={(e) => setResetAmount(e.target.value)} inputMode="decimal" placeholder="0" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">Desde</span>
                      <Input type="date" value={resetDate} onChange={(e) => setResetDate(e.target.value)} />
                    </label>
                  </div>
                  <Button onClick={applyBaseline} disabled={savingReset} className="mt-3 w-full">
                    {savingReset ? 'Guardando…' : 'Guardar saldo inicial'}
                  </Button>
                  {baselineDate && (
                    <button
                      type="button"
                      onClick={clearBaseline}
                      disabled={savingReset}
                      className="mt-2 w-full text-center text-sm text-slate-400 hover:text-slate-600"
                    >
                      Quitar ajuste y contar todo
                    </button>
                  )}
                </div>
              </div>
          </Modal>
        )}

        <div className="space-y-3">
          <DashboardRow
            icon="💵"
            title="Ingresos"
            value={fmt(monthIncomeTotal)}
            className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            onClick={() => onOpenTab('ingresos')}
          />
          <DashboardRow
            icon="↕"
            title="Gastos"
            value={fmt(monthExpenseTotal)}
            className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200"
            onClick={() => onOpenTab('gastos')}
          />
          <DashboardRow
            icon="💰"
            title="Ahorros"
            value={fmt(monthSavings)}
            className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200"
            onClick={() => onOpenTab('ahorros')}
          />
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">Mis presupuestos</p>
            <button type="button" onClick={() => onOpenTab('presupuestos')} className="text-sm font-bold text-emerald-700">
              ver más ›
            </button>
          </div>
          <button
            type="button"
            onClick={() => onOpenTab('presupuestos')}
            className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            {budgets.length === 0 ? (
              <span className="flex items-center justify-between text-lg font-bold text-emerald-700">
                Agregá un presupuesto <span className="text-4xl">+</span>
              </span>
            ) : (
              <span className="block">
                <span className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-500">
                  <span>{fmt(budgetSpent)}</span>
                  <span>{fmt(budgetLimit)}</span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${budgetPct}%` }} />
                </span>
              </span>
            )}
          </button>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => onOpenTab('resumen')}
            className="mb-3 flex w-full items-center justify-between text-left text-lg font-bold text-emerald-800 dark:text-emerald-300"
          >
            <span>Resumen mensual</span>
            <span className="text-2xl leading-none">›</span>
          </button>
          {topCategories.length === 0 ? (
            <button
              type="button"
              onClick={() => onOpenTab('resumen')}
              className="w-full rounded-2xl bg-slate-50 p-4 text-left text-sm text-slate-500 dark:bg-slate-900"
            >
              Todavía no hay gastos este mes.
            </button>
          ) : (
            <button type="button" onClick={() => onOpenTab('resumen')} className="w-full space-y-2 text-left">
              {topCategories.map((c) => (
                <div key={c.category} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {catMeta(c.category).symbol} {catMeta(c.category).label}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{fmt(c.total)}</span>
                </div>
              ))}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export function DashboardRow({
  icon,
  title,
  value,
  className,
  onClick,
}: {
  icon: string
  title: string
  value: string
  className: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left ${className}`}
    >
      <span className="flex items-center gap-4">
        <span className="text-3xl">{icon}</span>
        <span>
          <span className="block text-lg font-bold">{title}</span>
          <span className="mt-1 block text-2xl font-bold tracking-normal">{value}</span>
        </span>
      </span>
      <span className="text-4xl leading-none">›</span>
    </button>
  )
}

