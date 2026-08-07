'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  PiggyBank,
  Plus,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Input, Modal } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { type CatMeta } from '@/lib/categories'
import { spendByCategory } from '@/lib/balances'
import { type Budget, type Expense, type Group, type Income, type Saving } from '@/lib/types'
import { monthLabelEs } from './shared'
import { type PersonalTab } from '../tabs-types'
import { todayISO } from '@/lib/dates'

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
  const baseOf = (expense: Expense) => Number(expense.amount) * Number(expense.rate_to_base)
  const today = todayISO()
  const currentMonth = today.slice(0, 7)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const availableMonths = new Set<string>([currentMonth])
  for (const movement of [...expenses, ...incomes, ...savings]) {
    const date = String(movement.date)
    if (/^\d{4}-\d{2}/.test(date)) availableMonths.add(date.slice(0, 7))
  }
  const monthOptions = [...availableMonths].sort((a, b) => b.localeCompare(a))
  const monthExpenses = expenses.filter((expense) => String(expense.date).slice(0, 7) === selectedMonth)
  const monthIncomes = incomes.filter((income) => String(income.date).slice(0, 7) === selectedMonth)
  const monthExpenseTotal = monthExpenses.reduce((sum, expense) => sum + baseOf(expense), 0)
  const monthIncomeTotal = monthIncomes.reduce((sum, income) => sum + Number(income.amount), 0)
  const monthSavings = savings
    .filter((saving) => String(saving.date).slice(0, 7) === selectedMonth)
    .reduce((sum, saving) => sum + Number(saving.amount), 0)

  const baselineDate = group.baseline_date ?? null
  const baselineAmount = Number(group.baseline_amount ?? 0)
  const countedIncomes = baselineDate ? incomes.filter((income) => String(income.date) >= baselineDate) : incomes
  const countedExpenses = baselineDate ? expenses.filter((expense) => String(expense.date) >= baselineDate) : expenses
  const sumCountedIncomes = countedIncomes.reduce((sum, income) => sum + Number(income.amount), 0)
  const sumCountedExpenses = countedExpenses.reduce((sum, expense) => sum + baseOf(expense), 0)
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
    const amount = Number(resetAmount.replace(',', '.')) || 0
    await supabase.from('groups').update({ baseline_amount: amount, baseline_date: resetDate }).eq('id', group.id)
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
  const monthByCategory = new Map<string, number>()
  for (const expense of monthExpenses) {
    const category = expense.category || 'otros'
    monthByCategory.set(category, (monthByCategory.get(category) ?? 0) + baseOf(expense))
  }
  const budgetLimit = budgets.reduce((sum, budget) => sum + Number(budget.amount), 0)
  const budgetSpent = budgets.reduce((sum, budget) => sum + (monthByCategory.get(budget.category) ?? 0), 0)
  const budgetPct = budgetLimit > 0 ? Math.min(100, Math.round((budgetSpent / budgetLimit) * 100)) : 0

  return (
    <section className="mb-5 space-y-4">
      <header className="flex items-start justify-between gap-4 pt-1">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600 dark:text-[#4ee6b0]">Espacio personal</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950 dark:text-[#f4f7f6]">Mis cuentas</h1>
          <label className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-500 shadow-sm dark:border-[#26312d] dark:bg-[#131816] dark:text-[#94a19c]">
            <CalendarDays size={15} className="shrink-0 text-emerald-700 dark:text-[#4ee6b0]" />
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              aria-label="Mes del dashboard"
              className="min-w-0 bg-transparent font-semibold text-slate-700 outline-none dark:text-[#f4f7f6]"
            >
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {monthLabelEs(month)}
                </option>
              ))}
            </select>
            <span className="border-l border-slate-200 pl-2 text-xs font-medium dark:border-[#26312d]">{group.base_currency}</span>
          </label>
        </div>
        <Link
          href="/configuracion"
          aria-label="Configuración"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 dark:border-[#26312d] dark:bg-[#131816] dark:text-[#f4f7f6] dark:hover:border-[#4ee6b0] dark:hover:text-[#4ee6b0]"
        >
          <Settings size={20} strokeWidth={2.2} />
        </Link>
      </header>

      <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-800 p-5 text-white shadow-sm dark:border-[#26312d] dark:bg-[#18201d] dark:shadow-none">
        <div className="flex items-start justify-between gap-4">
          <button type="button" onClick={openBalanceInfo} className="min-w-0 text-left">
            <span className="flex items-center gap-1.5 text-sm text-emerald-100 dark:text-[#94a19c]">
              Balance acumulado <CircleHelp size={15} />
            </span>
            <span className={`mt-2 block truncate text-3xl font-bold tracking-normal sm:text-4xl ${balance < 0 ? 'text-rose-200' : ''}`}>
              {fmt(balance)}
            </span>
          </button>
          <Link
            href={`/g/${group.id}/nuevo`}
            aria-label="Agregar gasto"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-emerald-800 shadow-sm transition hover:brightness-95 dark:bg-[#4ee6b0] dark:text-[#062419]"
          >
            <Plus size={25} strokeWidth={2.7} />
          </Link>
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs text-emerald-100 dark:text-[#94a19c]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-200 dark:bg-[#4ee6b0]" />
          Disponible en todas tus cuentas
        </div>
      </div>

      <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-[#131816]">
        <button
          type="button"
          onClick={() => onOpenTab('gastos')}
          className="rounded-xl bg-white py-3 text-sm font-bold text-emerald-700 shadow-sm transition dark:bg-[#18201d] dark:text-[#4ee6b0]"
        >
          Mis gastos
        </button>
        <button
          type="button"
          onClick={() => onOpenTab('tarjetas')}
          className="rounded-xl py-3 text-sm font-semibold text-slate-500 transition hover:text-slate-800 dark:text-[#94a19c] dark:hover:text-[#f4f7f6]"
        >
          Mis tarjetas
        </button>
      </div>

      <div className="space-y-3">
        <DashboardRow
          Icon={ArrowDownLeft}
          title="Ingresos"
          value={fmt(monthIncomeTotal)}
          tone="income"
          onClick={() => onOpenTab('ingresos')}
        />
        <DashboardRow
          Icon={ArrowUpRight}
          title="Gastos"
          value={fmt(monthExpenseTotal)}
          tone="expense"
          onClick={() => onOpenTab('gastos')}
        />
        <DashboardRow
          Icon={PiggyBank}
          title="Ahorros"
          value={fmt(monthSavings)}
          tone="savings"
          onClick={() => onOpenTab('ahorros')}
        />
      </div>

      <section className="pt-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-[#f4f7f6]">Presupuestos</h2>
          <button type="button" onClick={() => onOpenTab('presupuestos')} className="text-sm font-bold text-emerald-700 dark:text-[#4ee6b0]">
            Ver todos
          </button>
        </div>
        <button
          type="button"
          onClick={() => onOpenTab('presupuestos')}
          className="w-full rounded-[1.35rem] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 dark:border-[#26312d] dark:bg-[#131816] dark:shadow-none dark:hover:border-[#4ee6b0]"
        >
          {budgets.length === 0 ? (
            <span className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm text-slate-500 dark:text-[#94a19c]">{monthLabelEs(selectedMonth)}</span>
                <span className="mt-1 block text-lg font-bold text-slate-900 dark:text-[#f4f7f6]">Agregá un presupuesto</span>
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-[#173e32] dark:text-[#4ee6b0]">
                <Plus size={22} strokeWidth={2.5} />
              </span>
            </span>
          ) : (
            <span className="block">
              <span className="flex items-end justify-between gap-3">
                <span>
                  <span className="block text-sm text-slate-500 dark:text-[#94a19c]">Presupuesto mensual</span>
                  <span className="mt-1 block text-xl font-bold text-slate-900 dark:text-[#f4f7f6]">{fmt(budgetLimit)}</span>
                </span>
                <span className="text-xs font-bold text-emerald-700 dark:text-[#4ee6b0]">{budgetPct}% utilizado</span>
              </span>
              <span className="mt-4 block h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-[#27312e]">
                <span className="block h-full rounded-full bg-emerald-500 dark:bg-[#4ee6b0]" style={{ width: `${budgetPct}%` }} />
              </span>
              <span className="mt-2 block text-xs text-slate-500 dark:text-[#94a19c]">Gastaste {fmt(budgetSpent)} en {monthLabelEs(selectedMonth)}</span>
            </span>
          )}
        </button>
      </section>

      <section className="pt-3">
        <button
          type="button"
          onClick={() => onOpenTab('resumen')}
          className="mb-3 flex w-full items-center justify-between text-left"
        >
          <h2 className="text-xl font-bold text-slate-900 dark:text-[#f4f7f6]">Resumen mensual</h2>
          <ChevronRight className="text-emerald-700 dark:text-[#4ee6b0]" size={21} />
        </button>
        {topCategories.length === 0 ? (
          <button
            type="button"
            onClick={() => onOpenTab('resumen')}
            className="w-full rounded-[1.35rem] border border-slate-200 bg-white p-4 text-left text-sm text-slate-500 shadow-sm dark:border-[#26312d] dark:bg-[#131816] dark:text-[#94a19c] dark:shadow-none"
          >
            Todavía no hay gastos en {monthLabelEs(selectedMonth)}.
          </button>
        ) : (
          <button type="button" onClick={() => onOpenTab('resumen')} className="w-full space-y-2 text-left">
            {topCategories.map((category) => (
              <div
                key={category.category}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm shadow-sm dark:border-[#26312d] dark:bg-[#131816] dark:shadow-none"
              >
                <span className="font-semibold text-slate-700 dark:text-[#e6e6e8]">
                  {catMeta(category.category).symbol} {catMeta(category.category).label}
                </span>
                <span className="font-bold text-slate-900 dark:text-[#f4f7f6]">{fmt(category.total)}</span>
              </div>
            ))}
          </button>
        )}
      </section>

      {showBalance && (
        <Modal title="Balance acumulado" onClose={() => setShowBalance(false)}>
          <div className="space-y-4 text-slate-900 dark:text-slate-100">
            <p className="text-sm text-slate-500">
              Es lo que te queda sumando ingresos y restando gastos
              {baselineDate ? ' desde el saldo inicial que fijaste.' : ' desde el principio.'}
            </p>
            <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-900">
              {baselineDate && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Saldo inicial ({fmtDate(baselineDate)})</span>
                  <span className="font-semibold">{fmt(baselineAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Ingresos contados</span>
                <span className="font-semibold text-emerald-600">+ {fmt(sumCountedIncomes)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Gastos contados</span>
                <span className="font-semibold text-rose-500">- {fmt(sumCountedExpenses)}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">Balance</span>
                  <span className={`text-lg font-bold ${balance >= 0 ? 'text-emerald-700' : 'text-rose-500'}`}>{fmt(balance)}</span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm font-bold">Fijar saldo inicial</p>
              <p className="mt-1 text-xs text-slate-500">
                Poné cuánto tenés hoy. El balance arranca de ese número y suma o resta solo lo nuevo, sin borrar historial.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Monto</span>
                  <Input value={resetAmount} onChange={(event) => setResetAmount(event.target.value)} inputMode="decimal" placeholder="0" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Desde</span>
                  <Input type="date" value={resetDate} onChange={(event) => setResetDate(event.target.value)} />
                </label>
              </div>
              <Button onClick={applyBaseline} disabled={savingReset} className="mt-3 w-full">
                {savingReset ? 'Guardando...' : 'Guardar saldo inicial'}
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
    </section>
  )
}

function DashboardRow({
  Icon,
  title,
  value,
  tone,
  onClick,
}: {
  Icon: LucideIcon
  title: string
  value: string
  tone: 'income' | 'expense' | 'savings'
  onClick: () => void
}) {
  const tones = {
    income: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-[#29614f] dark:bg-[#1d5d48] dark:text-[#b8ffe6]',
    expense: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-[#713344] dark:bg-[#54212c] dark:text-[#ffd0d9]',
    savings: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-[#665027] dark:bg-[#4a351d] dark:text-[#ffe0a8]',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-24 w-full items-center justify-between gap-3 rounded-[1.35rem] border px-4 py-4 text-left transition hover:brightness-[0.97] ${tones[tone]}`}
    >
      <span className="flex min-w-0 items-center gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/35 dark:bg-white/10">
          <Icon size={22} strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold">{title}</span>
          <span className="mt-1 block truncate text-xl font-bold tracking-normal text-slate-900 dark:text-[#f4f7f6]">{value}</span>
        </span>
      </span>
      <ChevronRight className="shrink-0" size={22} strokeWidth={2.3} />
    </button>
  )
}
