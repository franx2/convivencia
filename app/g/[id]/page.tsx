'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { NotFoundScreen, PageShell } from '@/components/PageShell'
import { Badge, Spinner } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { mergeCategories, metaFrom } from '@/lib/categories'
import type {
  BankDiscount,
  Budget,
  Category,
  CreditCard,
  Expense,
  ExpenseShare,
  Group,
  Income,
  Member,
  Payment,
  RecurringExpense,
  Saving,
  ShoppingItem,
  Template,
} from '@/lib/types'
import { isPersonalTab, isSharedTab, type Tab } from './tabs-types'
import { BalancesTab } from './tabs/BalancesTab'
import { CardsTab } from './tabs/CardsTab'
import { GastosTab } from './tabs/GastosTab'
import { IdentityPrompt } from './tabs/IdentityPrompt'
import { LiquidacionTab } from './tabs/LiquidacionTab'
import { ListaComprasTab } from './tabs/ListaComprasTab'
import { MiembrosTab } from './tabs/MiembrosTab'
import { PersonalBudgetsTab } from './tabs/PersonalBudgetsTab'
import { PersonalDashboard } from './tabs/PersonalDashboard'
import { PersonalIncomesTab } from './tabs/PersonalIncomesTab'
import { PersonalSummaryTab } from './tabs/PersonalSummaryTab'
import { SavingsTab } from './tabs/SavingsTab'

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
  const [discounts, setDiscounts] = useState<BankDiscount[]>([])
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([])
  const [recurring, setRecurring] = useState<RecurringExpense[]>([])
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
      { data: bdis },
      { data: shop },
      { data: rec },
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
      supabase.from('bank_discounts').select('*').order('discount_percent', { ascending: false, nullsFirst: false }),
      supabase.from('shopping_items').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('recurring_expenses').select('*').eq('group_id', groupId).order('day_of_month'),
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
    setDiscounts((bdis ?? []) as BankDiscount[])
    setShoppingItems((shop ?? []) as ShoppingItem[])
    // Tolerante a que falte la migración de recurrentes (rec queda null).
    setRecurring((rec ?? []) as RecurringExpense[])
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
  if (notFound || !group) return <NotFoundScreen>No encontramos este grupo (o no tenés acceso).</NotFoundScreen>

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
    <PageShell
      nav={group.is_personal ? 'personal' : 'shared'}
      personalHref={group.is_personal ? `/g/${group.id}` : null}
    >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              {group.name}
              {group.is_personal && <Badge>personal</Badge>}
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
            recurring={recurring}
            members={members}
            myMemberId={myMemberId}
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
          <CardsTab
            group={group}
            cards={cards}
            discounts={discounts}
            expenses={expenses}
            userId={user.id}
            onChanged={load}
          />
        )}
        {group.is_personal && activeTab === 'resumen' && (
          <PersonalSummaryTab group={group} expenses={expenses} incomes={incomes} savings={savings} />
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
    </PageShell>
  )
}


