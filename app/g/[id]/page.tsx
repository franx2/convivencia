'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { AmountCalculator } from '@/components/AmountCalculator'
import { BottomNav } from '@/components/BottomNav'
import { Header } from '@/components/Header'
import { Button, Card, Input, Label, Select, Spinner } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { mergeCategories, metaFrom, type CatMeta } from '@/lib/categories'
import { computeBalances, settle, spendByCategory, spendByMonth } from '@/lib/balances'
import { correctGroceryTerm } from '@/lib/grocery-glossary'
import { userDisplayName, userPaymentAlias } from '@/lib/profile'
import { Donut, MonthlyBars } from '@/components/charts'
import type {
  Budget,
  Category,
  CreditCard,
  Expense,
  ExpenseShare,
  Group,
  Income,
  Member,
  Payment,
  Saving,
  ShoppingItem,
  Template,
} from '@/lib/types'

type SharedTab = 'gastos' | 'lista' | 'balances' | 'liquidacion' | 'miembros'
type PersonalTab = 'inicio' | 'ingresos' | 'gastos' | 'ahorros' | 'presupuestos' | 'tarjetas' | 'resumen'
type Tab = SharedTab | PersonalTab

export default function GroupPage() {
  const { user, loading } = useRequireAuth()
  const params = useParams<{ id: string }>()
  const groupId = params.id

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [shares, setShares] = useState<ExpenseShare[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [savings, setSavings] = useState<Saving[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([])
  const [myMemberId, setMyMemberId] = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>('inicio')

  const load = useCallback(async () => {
    const { data: g } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle()
    if (!g) {
      setNotFound(true)
      setFetching(false)
      return
    }
    setGroup(g as Group)
    let linkedMemberId: string | null = null
    if (user) {
      const { data: link, error: linkError } = await supabase
        .from('group_users')
        .select('member_id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!linkError) linkedMemberId = ((link ?? {}) as { member_id?: string | null }).member_id ?? null
    }
    const [
      { data: m },
      { data: e },
      { data: c },
      { data: p },
      { data: tpl },
      { data: bud },
      { data: inc },
      { data: sav },
      { data: crd },
      { data: shop },
    ] = await Promise.all([
      supabase.from('members').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('expenses').select('*').eq('group_id', groupId).order('date', { ascending: false }),
      supabase.from('categories').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('payments').select('*').eq('group_id', groupId).order('date', { ascending: false }),
      supabase.from('templates').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('budgets').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('incomes').select('*').eq('group_id', groupId).order('date', { ascending: false }),
      supabase.from('savings').select('*').eq('group_id', groupId).order('date', { ascending: false }),
      supabase.from('cards').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
      supabase.from('shopping_items').select('*').eq('group_id', groupId).order('created_at'),
    ])
    setMembers((m ?? []) as Member[])
    setMyMemberId(linkedMemberId)
    setCategories((c ?? []) as Category[])
    setPayments((p ?? []) as Payment[])
    setTemplates((tpl ?? []) as Template[])
    setBudgets((bud ?? []) as Budget[])
    setIncomes((inc ?? []) as Income[])
    setSavings((sav ?? []) as Saving[])
    setCards((crd ?? []) as CreditCard[])
    setShoppingItems((shop ?? []) as ShoppingItem[])
    const exp = (e ?? []) as Expense[]
    setExpenses(exp)
    if (exp.length) {
      const { data: s } = await supabase
        .from('expense_shares')
        .select('*')
        .in('expense_id', exp.map((x) => x.id))
      setShares((s ?? []) as ExpenseShare[])
    } else {
      setShares([])
    }
    setFetching(false)
  }, [groupId, user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial async; setState ocurre tras el await
    if (user) load()
  }, [user, load])

  // F6 — mantener los datos al día entre dispositivos: refetch al volver el
  // foco/visibilidad, poll liviano mientras la pestaña está visible y, si la
  // publicación realtime está habilitada en Supabase, refetch ante cambios.
  useEffect(() => {
    if (!user) return
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      load()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const interval = window.setInterval(refresh, 25000)

    // Realtime best-effort: si la tabla no está publicada, simplemente no llegan
    // eventos (no rompe nada). El poll/foco son el respaldo confiable.
    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${groupId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `group_id=eq.${groupId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `group_id=eq.${groupId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes', filter: `group_id=eq.${groupId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings', filter: `group_id=eq.${groupId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `group_id=eq.${groupId}` }, refresh)
      .subscribe()

    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [groupId, user, load])

  // Desplaza la pestaña activa a la vista al cambiar (la barra es scrolleable en mobile).
  const tabsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tab])

  const memberName = useMemo(() => {
    const map = new Map<string, string>()
    members.forEach((m) => map.set(m.id, m.name))
    return (id: string) => map.get(id) ?? '—'
  }, [members])

  const cats = useMemo(
    () =>
      mergeCategories(
        categories.map((c) => ({ value: c.value, label: c.label, color: c.color, hex: c.hex }))
      ),
    [categories]
  )
  const catMeta = useMemo(() => (v: string) => metaFrom(cats, v), [cats])

  // Para destacar Lista/Gastos en el visual del grupo compartido (hero + badge de tab).
  const pendingShopping = useMemo(() => shoppingItems.filter((i) => !i.checked).length, [shoppingItems])
  const monthExpenseTotal = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7)
    return expenses
      .filter((e) => String(e.date).slice(0, 7) === currentMonth)
      .reduce((sum, e) => sum + Number(e.amount) * Number(e.rate_to_base), 0)
  }, [expenses])

  if (loading || !user || fetching) return <Spinner />
  if (notFound || !group)
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-10 text-center text-slate-500">
          No encontramos este grupo (o no tenés acceso).{' '}
          <Link href="/" className="text-emerald-700 underline">
            Volver
          </Link>
        </main>
      </>
    )

  const tabs: { key: Tab; label: string }[] = group.is_personal
    ? [
        { key: 'inicio', label: 'Inicio' },
        { key: 'ingresos', label: 'Ingresos' },
        { key: 'gastos', label: 'Gastos' },
        { key: 'ahorros', label: 'Ahorro' },
        { key: 'presupuestos', label: 'Presupuesto' },
        { key: 'tarjetas', label: 'Tarjetas' },
        { key: 'resumen', label: 'Resumen' },
      ]
    : [
        { key: 'gastos', label: 'Gastos' },
        { key: 'lista', label: pendingShopping > 0 ? `Lista (${pendingShopping})` : 'Lista' },
        { key: 'balances', label: 'Balances' },
        { key: 'liquidacion', label: 'Liquidación' },
        { key: 'miembros', label: 'Miembros' },
      ]
  const activeTab: Tab = group.is_personal
    ? (isPersonalTab(tab) ? tab : 'inicio')
    : (isSharedTab(tab) ? tab : 'gastos')

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-36 pt-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              {group.name}
              {group.is_personal && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  personal
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500">
              {group.is_personal ? 'Espacio personal · ' : ''}Moneda base: {group.base_currency}
            </p>
          </div>
          {group.is_personal && (
            <Link
              href="/configuracion"
              aria-label="Configuración"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              ⚙️
            </Link>
          )}
        </div>

        {!group.is_personal && (
          <div className="mb-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTab('lista')}
              className="rounded-2xl bg-amber-500 p-4 text-left text-white shadow-sm transition hover:brightness-95 dark:bg-amber-600"
            >
              <span className="text-3xl">🛒</span>
              <span className="mt-2 block text-sm font-semibold text-amber-50">Lista de compras</span>
              <span className="mt-0.5 block text-xl font-bold">
                {pendingShopping > 0 ? `${pendingShopping} pendiente${pendingShopping === 1 ? '' : 's'}` : 'Todo listo ✓'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('gastos')}
              className="rounded-2xl bg-emerald-700 p-4 text-left text-white shadow-sm transition hover:brightness-95 dark:bg-emerald-800"
            >
              <span className="text-3xl">💸</span>
              <span className="mt-2 block text-sm font-semibold text-emerald-50">Gastos del mes</span>
              <span className="mt-0.5 block text-xl font-bold">{formatMoney(monthExpenseTotal, group.base_currency)}</span>
            </button>
          </div>
        )}

        {group.is_personal && activeTab === 'inicio' && (
          <PersonalDashboard
            group={group}
            expenses={expenses}
            incomes={incomes}
            savings={savings}
            budgets={budgets}
            catMeta={catMeta}
            onOpenTab={(next) => setTab(next)}
            onChanged={load}
          />
        )}

        {!group.is_personal && members.length > 0 && !members.some((m) => m.id === myMemberId) && (
          <IdentityPrompt
            group={group}
            members={members}
            user={user}
            onSaved={(id) => {
              setMyMemberId(id)
              load()
            }}
          />
        )}

        <div ref={tabsRef} className="mb-5 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
          {tabs.map((t) => (
            <button
              key={t.key}
              data-active={activeTab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${
                activeTab === t.key
                  ? 'bg-white shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'gastos' && (
          <GastosTab
            group={group}
            expenses={expenses}
            templates={templates}
            cats={cats}
            memberName={memberName}
            catMeta={catMeta}
            hasMembers={members.length > 0}
            onChanged={load}
          />
        )}
        {group.is_personal && activeTab === 'ingresos' && (
          <PersonalIncomesTab
            group={group}
            members={members}
            incomes={incomes}
            memberName={memberName}
            onChanged={load}
          />
        )}
        {group.is_personal && activeTab === 'ahorros' && (
          <SavingsTab
            group={group}
            members={members}
            savings={savings}
            memberName={memberName}
            onChanged={load}
          />
        )}
        {group.is_personal && activeTab === 'presupuestos' && (
          <PersonalBudgetsTab
            group={group}
            expenses={expenses}
            budgets={budgets}
            cats={cats}
            catMeta={catMeta}
            onChanged={load}
          />
        )}
        {group.is_personal && activeTab === 'tarjetas' && (
          <CardsTab group={group} cards={cards} expenses={expenses} onChanged={load} />
        )}
        {group.is_personal && activeTab === 'resumen' && (
          <PersonalSummaryTab
            group={group}
            expenses={expenses}
            incomes={incomes}
            savings={savings}
            catMeta={catMeta}
          />
        )}
        {!group.is_personal && activeTab === 'balances' && (
          <BalancesTab
            group={group}
            members={members}
            expenses={expenses}
            shares={shares}
            payments={payments}
            budgets={budgets}
            incomes={incomes}
            cats={cats}
            catMeta={catMeta}
            memberName={memberName}
            onChanged={load}
          />
        )}
        {!group.is_personal && activeTab === 'liquidacion' && (
          <LiquidacionTab
            group={group}
            members={members}
            expenses={expenses}
            shares={shares}
            payments={payments}
            memberName={memberName}
            onChanged={load}
          />
        )}
        {!group.is_personal && activeTab === 'lista' && (
          <ListaComprasTab groupId={group.id} items={shoppingItems} onChanged={load} />
        )}
        {!group.is_personal && activeTab === 'miembros' && (
          <MiembrosTab group={group} members={members} expenses={expenses} onChanged={load} />
        )}
      </main>
      <BottomNav active={group.is_personal ? 'personal' : 'shared'} personalHref={group.is_personal ? `/g/${group.id}` : null} />
    </>
  )
}

function isPersonalTab(value: Tab): value is PersonalTab {
  return ['inicio', 'ingresos', 'gastos', 'ahorros', 'presupuestos', 'tarjetas', 'resumen'].includes(value)
}

function isSharedTab(value: Tab): value is SharedTab {
  return ['gastos', 'lista', 'balances', 'liquidacion', 'miembros'].includes(value)
}

function PersonalDashboard({
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
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 px-0 text-slate-900 sm:items-center sm:px-4 dark:text-slate-100">
            <div className="w-full max-w-md overflow-hidden rounded-t-[28px] bg-white shadow-2xl dark:bg-slate-950 sm:rounded-[28px]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h3 className="text-lg font-bold">Balance acumulado</h3>
                <button
                  type="button"
                  onClick={() => setShowBalance(false)}
                  className="text-2xl leading-none text-slate-400"
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5">
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
            </div>
          </div>
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

function DashboardRow({
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

function IdentityPrompt({
  group,
  members,
  user,
  onSaved,
}: {
  group: Group
  members: Member[]
  user: User
  onSaved: (memberId: string) => void
}) {
  const [selected, setSelected] = useState(members[0]?.id ?? '')
  const [newName, setNewName] = useState(userDisplayName(user))
  const [alias, setAlias] = useState(members[0]?.alias ?? userPaymentAlias(user))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creating = selected === '__new__'

  function changeSelected(value: string) {
    setSelected(value)
    if (value === '__new__') {
      setAlias(userPaymentAlias(user))
      return
    }
    const member = members.find((m) => m.id === value)
    setAlias(member?.alias ?? userPaymentAlias(user))
  }

  async function saveIdentity() {
    setBusy(true)
    setError(null)
    let memberId = selected
    try {
      const cleanAlias = alias.trim()
      if (creating) {
        const name = newName.trim()
        if (!name) throw new Error('Ingresá tu nombre.')
        const { data, error: memberError } = await supabase
          .from('members')
          .insert({ group_id: group.id, name, alias: cleanAlias || null })
          .select('id')
          .single()
        if (memberError) throw memberError
        memberId = (data as { id: string }).id
      }

      if (!memberId) throw new Error('Elegí quién sos en este grupo.')
      if (cleanAlias) {
        await supabase.from('members').update({ alias: cleanAlias }).eq('id', memberId)
        await supabase.auth.updateUser({ data: { payment_alias: cleanAlias } })
      }
      const { error: linkError } = await supabase
        .from('group_users')
        .update({ member_id: memberId })
        .eq('group_id', group.id)
        .eq('user_id', user.id)
      if (linkError) {
        throw new Error(
          /member_id|group_users/.test(linkError.message)
            ? 'Falta correr la migración de identidad de usuarios en Supabase.'
            : linkError.message
        )
      }
      onSaved(memberId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar tu identidad.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-5 border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="mb-3">
        <p className="text-base font-bold text-emerald-800 dark:text-emerald-200">¿Quién sos en este grupo?</p>
        <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-300/80">
          Así los nuevos gastos quedan pagados por vos automáticamente.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <Select value={selected} onChange={(e) => changeSelected(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="__new__">No estoy en la lista</option>
          </Select>
          {creating && (
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tu nombre" />
          )}
          <Input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Alias para cobrar (opcional)"
          />
        </div>
        <Button type="button" onClick={saveIdentity} disabled={busy || (!selected && !creating)} className="sm:self-start">
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-emerald-700/80 dark:text-emerald-300/80">
        Lo guardo para sugerirlo en otros grupos y para copiarlo rapido al liquidar.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  )
}

function GastosTab({
  group,
  expenses,
  templates,
  cats,
  memberName,
  catMeta,
  hasMembers,
  onChanged,
}: {
  group: Group
  expenses: Expense[]
  templates: Template[]
  cats: CatMeta[]
  memberName: (id: string) => string
  catMeta: (v: string) => CatMeta
  hasMembers: boolean
  onChanged: () => void
}) {
  const [filter, setFilter] = useState<string>('all')
  const [managingTpl, setManagingTpl] = useState(false)
  const [tplLabel, setTplLabel] = useState('')
  const [tplCat, setTplCat] = useState<string>('otros')
  const [tplAmount, setTplAmount] = useState('')
  const [tplBusy, setTplBusy] = useState(false)

  async function remove(id: string) {
    if (!confirm('¿Borrar este gasto?')) return
    await supabase.from('expenses').delete().eq('id', id)
    onChanged()
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
  const shown = filter === 'all' ? expenses : expenses.filter((e) => (e.category || 'otros') === filter)
  const grouped = groupExpensesByMonth(shown, (e) => Number(e.amount) * Number(e.rate_to_base))

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
            className="text-slate-300 hover:text-emerald-600"
            title="Editar"
          >
            ✎
          </Link>
          <button
            onClick={() => remove(e.id)}
            className="text-slate-300 hover:text-red-500"
            title="Borrar"
          >
            ✕
          </button>
        </div>
      </Card>
    )
  }

  return (
    <div id="section-gastos" className="scroll-mt-24 space-y-3">
      {hasMembers && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-600">Gastos típicos</p>
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
                    <button
                      onClick={() => removeTemplate(t.id)}
                      className="ml-1 text-slate-300 hover:text-red-500"
                      title="Quitar plantilla"
                    >
                      ✕
                    </button>
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
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-[200px]">
            <option value="all">Todas las categorías</option>
            {usedCats.map((c) => (
              <option key={c} value={c}>
                {catMeta(c).symbol} {catMeta(c).label}
              </option>
            ))}
          </Select>
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

      {expenses.length === 0 ? (
        <Card className="text-center text-slate-500">Todavía no hay gastos.</Card>
      ) : grouped.length === 0 ? (
        <Card className="text-center text-slate-500">No hay gastos para este filtro.</Card>
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
    </div>
  )
}

function groupExpensesByMonth(expenses: Expense[], baseOf: (expense: Expense) => number) {
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

function PersonalIncomesTab({
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
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
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
            {error && <p className="text-sm text-red-600">{error}</p>}
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
                <button onClick={() => remove(i.id)} className="text-slate-300 hover:text-red-500" title="Quitar">
                  ✕
                </button>
              </span>
            </div>
          ))
        )}
      </HistoryList>
    </div>
  )
}

function SavingsTab({
  group,
  members,
  savings,
  memberName,
  onChanged,
}: {
  group: Group
  members: Member[]
  savings: Saving[]
  memberName: (id: string) => string
  onChanged: () => void
}) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
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
    const { error: insertError } = await supabase.from('savings').insert({
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
    await supabase.from('savings').delete().eq('id', id)
    onChanged()
  }

  return (
    <div className="space-y-4">
      {adding ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-amber-700 dark:text-amber-300">Agregar ahorro</h2>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          </div>
          <form onSubmit={add} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <AmountCalculator value={amount} currency={group.base_currency} onChange={setAmount} autoOpen />
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (ej: Fondo emergencia)" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar ahorro'}
            </Button>
          </form>
        </Card>
      ) : (
        <Button onClick={() => setAdding(true)} className="w-full">
          + Agregar ahorro
        </Button>
      )}

      <HistoryList title="Ahorros previos">
        {savings.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay ahorros cargados.</p>
        ) : (
          savings.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
              <span className="min-w-0 truncate">
                <span className="font-medium">{s.note || 'Ahorro'}</span>
                <span className="text-slate-400"> · {s.date}</span>
                {members.length > 1 && <span className="text-slate-400"> · {memberName(s.member_id)}</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-amber-600">{formatMoney(Number(s.amount), group.base_currency)}</span>
                <button onClick={() => remove(s.id)} className="text-slate-300 hover:text-red-500" title="Quitar">
                  ✕
                </button>
              </span>
            </div>
          ))
        )}
      </HistoryList>
    </div>
  )
}

function PersonalBudgetsTab({
  group,
  expenses,
  budgets,
  cats,
  catMeta,
  onChanged,
}: {
  group: Group
  expenses: Expense[]
  budgets: Budget[]
  cats: CatMeta[]
  catMeta: (v: string) => CatMeta
  onChanged: () => void
}) {
  const [category, setCategory] = useState('supermercado')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const month = new Date().toISOString().slice(0, 7)
  const spentByCat = new Map<string, number>()
  for (const e of expenses) {
    if (String(e.date).slice(0, 7) !== month) continue
    const cat = e.category || 'otros'
    spentByCat.set(cat, (spentByCat.get(cat) ?? 0) + Number(e.amount) * Number(e.rate_to_base))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!(amt > 0)) return
    setBusy(true)
    await supabase
      .from('budgets')
      .upsert({ group_id: group.id, category, amount: amt }, { onConflict: 'group_id,category' })
    setAmount('')
    setBusy(false)
    onChanged()
  }

  async function remove(id: string) {
    await supabase.from('budgets').delete().eq('id', id)
    onChanged()
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-lg font-semibold text-emerald-800 dark:text-emerald-300">Agregar presupuesto</h2>
        <form onSubmit={save} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Límite"
          />
          <Button type="submit" disabled={busy || !(Number(amount) > 0)}>
            Guardar
          </Button>
        </form>
      </Card>

      <HistoryList title="Presupuestos">
        {budgets.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay presupuestos cargados.</p>
        ) : (
          <div className="space-y-3">
            {budgets.map((b) => {
              const spent = spentByCat.get(b.category) ?? 0
              const limit = Number(b.amount)
              const ratio = limit > 0 ? spent / limit : 0
              const pct = Math.min(100, Math.round(ratio * 100))
              const bar = ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'
              return (
                <div key={b.id}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catMeta(b.category).color}`}>
                      {catMeta(b.category).symbol} {catMeta(b.category).label}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-500">
                        {formatMoney(spent, group.base_currency)} / {formatMoney(limit, group.base_currency)}
                      </span>
                      <button onClick={() => remove(b.id)} className="text-slate-300 hover:text-red-500" title="Quitar">
                        ✕
                      </button>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </HistoryList>
    </div>
  )
}

function CardsTab({
  group,
  cards,
  expenses,
  onChanged,
}: {
  group: Group
  cards: CreditCard[]
  expenses: Expense[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [bank, setBank] = useState('')
  const [last4, setLast4] = useState('')
  const [closingDay, setClosingDay] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const month = new Date().toISOString().slice(0, 7)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    await supabase.from('cards').insert({
      group_id: group.id,
      name: name.trim(),
      bank: bank.trim() || null,
      last4: last4.trim() || null,
      closing_day: Number(closingDay) || null,
      due_day: Number(dueDay) || null,
    })
    setName('')
    setBank('')
    setLast4('')
    setClosingDay('')
    setDueDay('')
    setBusy(false)
    setAdding(false)
    onChanged()
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar esta tarjeta? Los gastos importados quedan guardados.')) return
    await supabase.from('cards').delete().eq('id', id)
    onChanged()
  }

  return (
    <div className="space-y-4">
      {adding ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">Crear tarjeta</h2>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          </div>
          <form onSubmit={add} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: Visa Galicia)" autoFocus />
              <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Banco" />
              <Input value={last4} onChange={(e) => setLast4(e.target.value)} placeholder="Últimos 4" maxLength={4} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" min="1" max="31" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} placeholder="Cierre" />
                <Input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="Vto." />
              </div>
            </div>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Guardando…' : 'Guardar tarjeta'}
            </Button>
          </form>
        </Card>
      ) : (
        <Button onClick={() => setAdding(true)} className="w-full">
          + Nueva tarjeta
        </Button>
      )}

      <HistoryList title="Mis tarjetas">
        {cards.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Todavía no hay tarjetas creadas.</p>
            <Link href={`/g/${group.id}/importar`}>
              <Button variant="ghost">Importar resumen sin tarjeta</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => {
              const cardExpenses = expenses.filter((e) => e.card_id === card.id && String(e.date).slice(0, 7) === month)
              const total = cardExpenses.reduce((sum, e) => sum + Number(e.amount) * Number(e.rate_to_base), 0)
              return (
                <div key={card.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{card.name}</p>
                      <p className="text-xs text-slate-400">
                        {[card.bank, card.last4 ? `•••• ${card.last4}` : null].filter(Boolean).join(' · ') || 'Sin datos extra'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Este mes: {formatMoney(total, group.base_currency)}</p>
                    </div>
                    <button onClick={() => remove(card.id)} className="text-slate-300 hover:text-red-500" title="Borrar">
                      ✕
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/g/${group.id}/importar?cardId=${card.id}`}>
                      <Button variant="ghost">Importar resumen</Button>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </HistoryList>
    </div>
  )
}

function PersonalSummaryTab({
  group,
  expenses,
  incomes,
  savings,
  catMeta,
}: {
  group: Group
  expenses: Expense[]
  incomes: Income[]
  savings: Saving[]
  catMeta: (v: string) => CatMeta
}) {
  const fmt = (n: number) => formatMoney(n, group.base_currency)
  const month = new Date().toISOString().slice(0, 7)
  const baseOf = (e: Expense) => Number(e.amount) * Number(e.rate_to_base)
  const monthExpenses = expenses.filter((e) => String(e.date).slice(0, 7) === month)
  const monthIncomes = incomes.filter((i) => String(i.date).slice(0, 7) === month)
  const monthSavings = savings.filter((s) => String(s.date).slice(0, 7) === month)
  const expenseTotal = monthExpenses.reduce((sum, e) => sum + baseOf(e), 0)
  const incomeTotal = monthIncomes.reduce((sum, i) => sum + Number(i.amount), 0)
  const savingTotal = monthSavings.reduce((sum, s) => sum + Number(s.amount), 0)
  const byCat = spendByCategory(monthExpenses)
  const categoryChart = byCat.map((c) => ({
    label: catMeta(c.category).label,
    value: c.total,
    color: catMeta(c.category).hex,
    symbol: catMeta(c.category).symbol,
  }))
  const manualTotal = monthExpenses
    .filter((e) => (e.source ?? 'manual') !== 'card_import')
    .reduce((sum, e) => sum + baseOf(e), 0)
  const cardTotal = monthExpenses
    .filter((e) => (e.source ?? 'manual') === 'card_import')
    .reduce((sum, e) => sum + baseOf(e), 0)
  const sourceChart = [
    { label: 'Manual', value: manualTotal, color: '#10b981', symbol: '✍️' },
    { label: 'Tarjeta', value: cardTotal, color: '#f43f5e', symbol: '💳' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <MetricCard label="Ingresos" value={fmt(incomeTotal)} tone="text-emerald-600" />
        <MetricCard label="Gastos" value={fmt(expenseTotal)} tone="text-rose-600" />
        <MetricCard label="Ahorros" value={fmt(savingTotal)} tone="text-amber-600" />
      </div>

      <Card>
        <p className="mb-4 text-sm font-medium text-slate-600">Gastos por categoría · {monthLabelEs(month)}</p>
        {categoryChart.length > 0 ? (
          <Donut data={categoryChart} format={fmt} />
        ) : (
          <p className="text-sm text-slate-500">Sin gastos este mes.</p>
        )}
      </Card>

      <Card>
        <p className="mb-4 text-sm font-medium text-slate-600">Origen del gasto · {monthLabelEs(month)}</p>
        {manualTotal > 0 || cardTotal > 0 ? (
          <Donut data={sourceChart} format={fmt} />
        ) : (
          <p className="text-sm text-slate-500">Sin gastos este mes.</p>
        )}
      </Card>
    </div>
  )
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </Card>
  )
}

function HistoryList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</h3>
      {children}
    </Card>
  )
}

function BalancesTab({
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

  // Meses con datos (gastos + ingresos) + el actual, desc.
  const months = useMemo(() => {
    const set = new Set<string>()
    for (const e of expenses) if (/^\d{4}-\d{2}/.test(e.date)) set.add(String(e.date).slice(0, 7))
    for (const i of incomes) if (/^\d{4}-\d{2}/.test(i.date)) set.add(String(i.date).slice(0, 7))
    set.add(new Date().toISOString().slice(0, 7))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [expenses, incomes])

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [who, setWho] = useState<string>('all') // 'all' | member_id

  const monthExpenses = expenses.filter(
    (e) => String(e.date).slice(0, 7) === month && (who === 'all' || e.paid_by === who)
  )
  const monthIncomes = incomes.filter(
    (i) => String(i.date).slice(0, 7) === month && (who === 'all' || i.member_id === who)
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
  const monthByCat = new Map<string, number>()
  for (const e of expenses) {
    if (String(e.date).slice(0, 7) !== month) continue
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
  const [incDate, setIncDate] = useState(() => new Date().toISOString().slice(0, 10))
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

  const monthLbl = monthLabelEs(month)
  const whoLbl = who === 'all' ? null : memberName(who)

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <Card className="flex flex-wrap items-center gap-2">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[180px]">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabelEs(m)}
            </option>
          ))}
        </Select>
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
        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
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
          <p className="mb-4 text-sm font-medium text-slate-600">
            Gastos por categoría · {monthLbl}
            {whoLbl ? ` · ${whoLbl}` : ''}
          </p>
          <Donut data={donutData} format={fmt} />
          </Card>
        ) : (
          <Card className="text-center text-sm text-slate-500">Sin gastos en {monthLbl}.</Card>
        )}
      </div>

      {/* Ingresos del mes */}
      <Card className="scroll-mt-24" id="section-ingresos">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Ingresos · {monthLbl}</p>
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
            {incError && <p className="text-sm text-red-600">{incError}</p>}
            <Button type="button" onClick={addIncome} disabled={incBusy}>
              {incBusy ? 'Guardando…' : 'Guardar ingreso'}
            </Button>
          </div>
        )}

        {monthIncomes.length === 0 ? (
          <p className="text-xs text-slate-400">No hay ingresos cargados en {monthLbl}.</p>
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
                  <button
                    onClick={() => removeIncome(i.id)}
                    className="text-slate-300 hover:text-red-500"
                    title="Quitar"
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tendencia */}
      <Card>
        <p className="mb-4 text-sm font-medium text-slate-600">Gasto por mes (todos)</p>
        <MonthlyBars data={byMonth} format={fmt} />
      </Card>

      <Card className="scroll-mt-24" id="section-presupuestos">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600">Presupuesto · {monthLbl}</p>
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
                        <button
                          onClick={() => removeBudget(b.id)}
                          className="text-slate-300 hover:text-red-500"
                          title="Quitar"
                        >
                          ✕
                        </button>
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

function monthLabelEs(key: string): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function LiquidacionTab({
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
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

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
      date: when ?? new Date().toISOString().slice(0, 10),
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

  async function undo(id: string) {
    if (!confirm('¿Deshacer este pago?')) return
    await supabase.from('payments').delete().eq('id', id)
    onChanged()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="px-1 text-xs font-medium uppercase tracking-wide text-slate-400">Para saldar</p>
        {transfers.length === 0 ? (
          <Card className="text-center text-slate-500">Todo saldado. Nadie le debe a nadie. 🎉</Card>
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
            <p className="text-sm font-medium text-slate-600">Registrar un pago</p>
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
            {error && <p className="text-sm text-red-600">{error}</p>}
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
                <button
                  onClick={() => undo(p.id)}
                  className="text-slate-300 hover:text-red-500"
                  title="Deshacer"
                >
                  ✕
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ListaComprasTab({
  groupId,
  items,
  onChanged,
}: {
  groupId: string
  items: ShoppingItem[]
  onChanged: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [searchFor, setSearchFor] = useState<ShoppingItem | null>(null)

  const pending = items.filter((i) => !i.checked)
  const bought = items.filter((i) => i.checked)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    await supabase.from('shopping_items').insert({ group_id: groupId, text: text.trim() })
    setText('')
    setBusy(false)
    onChanged()
  }

  async function toggle(item: ShoppingItem) {
    await supabase.from('shopping_items').update({ checked: !item.checked }).eq('id', item.id)
    onChanged()
  }

  async function remove(id: string) {
    await supabase.from('shopping_items').delete().eq('id', id)
    onChanged()
  }

  async function clearBought() {
    await supabase.from('shopping_items').delete().eq('group_id', groupId).eq('checked', true)
    onChanged()
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Leche, pan, detergente…"
            autoFocus
          />
          <Button type="submit" disabled={busy || !text.trim()}>
            Agregar
          </Button>
        </form>
      </Card>

      {items.length === 0 ? (
        <Card className="text-center text-slate-500">Todavía no hay nada en la lista.</Card>
      ) : (
        <>
          <div className="space-y-2">
            {pending.map((item) => (
              <Card key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input type="checkbox" checked={false} onChange={() => toggle(item)} className="h-5 w-5 shrink-0" />
                  <span className="truncate">{item.text}</span>
                </label>
                <button
                  onClick={() => setSearchFor(item)}
                  className="shrink-0 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Precio
                </button>
                <button onClick={() => remove(item.id)} className="shrink-0 text-slate-300 hover:text-red-500" title="Borrar">
                  ✕
                </button>
              </Card>
            ))}
          </div>

          {bought.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-400">Comprado ({bought.length})</p>
                <button onClick={clearBought} className="text-sm font-medium text-slate-400 hover:text-red-500">
                  Vaciar
                </button>
              </div>
              <div className="space-y-2">
                {bought.map((item) => (
                  <Card key={item.id} className="flex items-center justify-between gap-3 py-2.5 opacity-60">
                    <label className="flex min-w-0 flex-1 items-center gap-3">
                      <input type="checkbox" checked={true} onChange={() => toggle(item)} className="h-5 w-5 shrink-0" />
                      <span className="truncate line-through">{item.text}</span>
                    </label>
                    <button onClick={() => remove(item.id)} className="shrink-0 text-slate-300 hover:text-red-500" title="Borrar">
                      ✕
                    </button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {searchFor && <PriceSearchModal initialTerm={searchFor.text} onClose={() => setSearchFor(null)} />}
    </div>
  )
}

function PriceSearchModal({ initialTerm, onClose }: { initialTerm: string; onClose: () => void }) {
  const [term, setTerm] = useState(initialTerm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<PriceResult[]>([])

  const search = useCallback(async () => {
    if (!term.trim()) return
    // Corrige apodos/diminutivos conocidos (ej. "vinito" -> "vino") antes de
    // buscar; si cambió algo, lo mostramos en el campo para que se vea la corrección.
    const corrected = correctGroceryTerm(term.trim())
    if (corrected !== term.trim()) setTerm(corrected)
    setLoading(true)
    setError(null)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    try {
      const res = await fetch(`/api/price-search?q=${encodeURIComponent(corrected)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = (await res.json()) as { results?: PriceResult[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'No se pudo buscar el precio.')
      setResults(data.results ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar el precio.')
    } finally {
      setLoading(false)
    }
  }, [term])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- primera búsqueda automática al abrir el modal
    search()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar, no en cada tecla
  }, [])

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 px-0 sm:items-center sm:px-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white shadow-2xl dark:bg-slate-950 sm:rounded-[28px]">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <h3 className="text-lg font-bold">Buscar precio</h3>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400" aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              search()
            }}
            className="flex gap-2"
          >
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Qué buscar…" autoFocus />
            <Button type="submit" disabled={loading || !term.trim()}>
              {loading ? '…' : 'Buscar'}
            </Button>
          </form>
          <p className="text-xs text-slate-400">Precios de Vea, Changomas y Carrefour, orientativos.</p>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {loading ? (
            <Spinner />
          ) : results.length === 0 ? (
            <p className="text-center text-sm text-slate-500">Sin resultados.</p>
          ) : (
            <div className="space-y-2">
              {results.map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5 hover:border-emerald-300 dark:border-slate-800"
                >
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- thumbnail externo de un catálogo de terceros, no vale la pena el pipeline de next/image
                    <img src={r.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.store}</p>
                  </div>
                  <span className="shrink-0 font-bold text-emerald-700 dark:text-emerald-400">
                    {r.price != null ? formatMoney(r.price, 'ARS') : '—'}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type PriceResult = {
  store: string
  name: string
  price: number | null
  image: string | null
  url: string
}

function MiembrosTab({
  group,
  members,
  expenses,
  onChanged,
}: {
  group: Group
  members: Member[]
  expenses: Expense[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const usedMemberIds = useMemo(() => new Set(expenses.map((e) => e.paid_by)), [expenses])

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join?token=${group.invite_token}`
      : ''

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    await supabase.from('members').insert({ group_id: group.id, name: name.trim() })
    setName('')
    setBusy(false)
    onChanged()
  }

  async function remove(id: string) {
    if (usedMemberIds.has(id)) {
      alert('No se puede borrar: este miembro pagó algún gasto. Borrá o reasigná esos gastos primero.')
      return
    }
    // Las FKs hacia members son ON DELETE CASCADE (shares/incomes/savings/pagos):
    // borrar arrastraría ese historial en silencio y corrompería los balances.
    // Bloqueamos si el miembro está referenciado en algún lado.
    const refs = await memberReferences(id)
    if (refs) {
      alert(`No se puede borrar: ${refs}. Quitá esos registros primero.`)
      return
    }
    const { data, error } = await supabase.from('members').delete().eq('id', id).select('id')
    if (error) {
      alert('No se pudo borrar el miembro.')
      return
    }
    // RLS permite borrar miembros solo al dueño del grupo: si no se borró ninguna
    // fila (y no hubo error), fue por permisos.
    if (!data || data.length === 0) {
      alert('Solo el dueño del grupo puede borrar miembros.')
      return
    }
    onChanged()
  }

  // Cuenta referencias del miembro en tablas con cascade para evitar pérdida de
  // datos. Si una tabla opcional no existe (migración pendiente), cuenta 0.
  async function memberReferences(memberId: string): Promise<string | null> {
    const count = async (table: string, col: string) => {
      const { count: n, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(col, memberId)
      return error ? 0 : n ?? 0
    }
    const [shares, incomes, savings, payFrom, payTo] = await Promise.all([
      count('expense_shares', 'member_id'),
      count('incomes', 'member_id'),
      count('savings', 'member_id'),
      count('payments', 'from_member'),
      count('payments', 'to_member'),
    ])
    const parts: string[] = []
    if (shares) parts.push('participa en gastos')
    if (incomes) parts.push('tiene ingresos cargados')
    if (savings) parts.push('tiene ahorros cargados')
    if (payFrom + payTo) parts.push('tiene pagos registrados')
    return parts.length ? parts.join(', ') : null
  }

  async function updateWeight(id: string, val: string) {
    const w = Number(val)
    if (!(w > 0)) return
    await supabase.from('members').update({ weight: w }).eq('id', id)
    onChanged()
  }

  async function updateAlias(id: string, val: string, current: string | null) {
    const alias = val.trim()
    if (alias === (current ?? '')) return
    await supabase.from('members').update({ alias: alias || null }).eq('id', id)
    onChanged()
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={add} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del participante" />
          <Button type="submit" disabled={busy || !name.trim()}>
            Agregar
          </Button>
        </form>
        <div className="mt-3 space-y-2">
          {members.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay miembros.</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="border-b border-slate-100 pb-2 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex-1 font-medium">{m.name}</span>
                  <label className="flex items-center gap-1 text-xs text-slate-400" title="Peso para el reparto proporcional">
                    peso
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={String(m.weight ?? 1)}
                      onBlur={(e) => updateWeight(m.id, e.target.value)}
                      className="w-14 text-right"
                    />
                  </label>
                  <button onClick={() => remove(m.id)} className="text-slate-300 hover:text-red-500" title="Quitar">
                    ✕
                  </button>
                </div>
                <label className="mt-1 flex items-center gap-1 text-xs text-slate-400" title="Alias o CBU para cobrar">
                  alias
                  <Input
                    defaultValue={m.alias ?? ''}
                    onBlur={(e) => updateAlias(m.id, e.target.value, m.alias)}
                    placeholder="alias.mercadopago / CBU"
                    className="flex-1"
                  />
                </label>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-600">Invitar a alguien con cuenta</p>
        <p className="mb-2 text-xs text-slate-400">
          Compartí este link. Quien lo abra (con sesión iniciada) podrá ver y editar el grupo.
        </p>
        <div className="flex gap-2">
          <Input readOnly value={inviteUrl} className="text-xs" />
          <Button variant="ghost" onClick={copyInvite}>
            {copied ? '¡Copiado!' : 'Copiar'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
