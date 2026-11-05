'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { HandCoins, ReceiptText, ShoppingBasket } from 'lucide-react'
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
import { currentMonth } from '@/lib/dates'

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
  const [takenMemberIds, setTakenMemberIds] = useState<Set<string>>(new Set())
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
    // Miembros ya elegidos por OTRA cuenta en este grupo: no deben ofrecerse
    // como opción al preguntar "¿quién sos?" (antes se podían pisar entre sí).
    const claimedMemberIds = new Set<string>()
    if (user) {
      const { data: links, error: linksError } = await supabase
        .from('group_users')
        .select('user_id, member_id')
        .eq('group_id', groupId)
      if (!linksError) {
        for (const row of (links ?? []) as { user_id: string; member_id: string | null }[]) {
          if (row.member_id && row.user_id !== user.id) claimedMemberIds.add(row.member_id)
          if (row.member_id && row.user_id === user.id) linkedMemberId = row.member_id
        }
      }
    }
    setTakenMemberIds(claimedMemberIds)
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
  const tabsTopRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    // La tira queda pegada arriba al bajar: al cambiar de pestaña, el contenido
    // nuevo tiene que arrancar desde su principio y no desde la mitad.
    const top = tabsTopRef.current?.getBoundingClientRect().top ?? 0
    if (top < 0) window.scrollBy({ top })
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
    const month = currentMonth()
    return expenses
      .filter((e) => String(e.date).slice(0, 7) === month)
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
    : group.kind === 'viaje'
      ? [
          // Grupal (ex "viaje"): interfaz simplificada, lo que importa es
          // cargar gastos y ver quién le debe a quién. Sin tab de Balances.
          { key: 'gastos', label: 'Gastos' },
          { key: 'liquidacion', label: 'Liquidación' },
          { key: 'lista', label: pendingShopping > 0 ? `Lista (${pendingShopping})` : 'Lista' },
          { key: 'miembros', label: 'Miembros' },
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
      nav={group.is_personal ? 'personal' : group.kind === 'viaje' ? 'viajes' : 'convivencia'}
      personalHref={group.is_personal ? `/g/${group.id}` : null}
    >
        {(!group.is_personal || activeTab !== 'inicio') && (
        <div className="mb-3 min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-2 text-2xl font-bold leading-tight">
            {group.name}
            {group.is_personal && <Badge>personal</Badge>}
          </h1>
          <p className="text-sm text-muted">
            {group.is_personal ? 'Espacio personal · ' : ''}Moneda base: {group.base_currency}
          </p>
        </div>
        )}

        {!group.is_personal && group.kind !== 'viaje' && (
          <div className="mb-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setTab('lista')}
              className="min-w-0 rounded-2xl border border-amber-400 bg-amber-400 p-3.5 text-left text-amber-950 shadow-sm transition active:scale-[0.98] dark:border-[#665027] dark:bg-[#4a351d] dark:text-[#ffe0a8] dark:shadow-none"
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <ShoppingBasket size={17} strokeWidth={2.3} aria-hidden="true" className="shrink-0" />
                Lista de compras
              </span>
              <span className="mt-1 block text-lg font-bold leading-tight">
                {pendingShopping > 0 ? `${pendingShopping} pendiente${pendingShopping === 1 ? '' : 's'}` : 'Todo listo ✓'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('gastos')}
              className="min-w-0 rounded-2xl border border-emerald-700 bg-emerald-700 p-3.5 text-left text-white shadow-sm transition active:scale-[0.98] dark:border-[#29614f] dark:bg-[#1d5d48] dark:text-[#b8ffe6] dark:shadow-none"
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <ReceiptText size={17} strokeWidth={2.3} aria-hidden="true" className="shrink-0" />
                Gastos del mes
              </span>
              <span className="mt-1 block break-words text-lg font-bold leading-tight tabular-nums">
                {formatMoney(monthExpenseTotal, group.base_currency)}
              </span>
            </button>
          </div>
        )}

        {!group.is_personal && group.kind === 'viaje' && (
          <button
            type="button"
            onClick={() => setTab('liquidacion')}
            className="mb-3 block w-full rounded-2xl border border-emerald-700 bg-emerald-700 p-3.5 text-left text-white shadow-sm transition active:scale-[0.98] dark:border-[#29614f] dark:bg-[#1d5d48] dark:text-[#b8ffe6] dark:shadow-none"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <HandCoins size={17} strokeWidth={2.3} aria-hidden="true" className="shrink-0" />
              Liquidación
            </span>
            <span className="mt-1 block text-lg font-bold leading-tight">Ver quién le debe a quién</span>
          </button>
        )}

        {!group.is_personal && members.length > 0 && !members.some((m) => m.id === myMemberId) && (
          <IdentityPrompt
            group={group}
            members={members}
            takenMemberIds={takenMemberIds}
            user={user}
            onSaved={(id) => {
              setMyMemberId(id)
              load()
            }}
          />
        )}

        <div ref={tabsTopRef} />
        <div className="sticky top-0 z-30 -mx-4 mb-3 bg-slate-50 px-4 py-1.5 dark:bg-[#0b0e0d]">
          <div ref={tabsRef} role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-slate-200/70 p-1 text-sm dark:bg-[#131816]">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={activeTab === t.key}
                data-active={activeTab === t.key}
                onClick={() => setTab(t.key)}
                className={`min-h-11 flex-1 shrink-0 whitespace-nowrap rounded-xl px-3.5 font-semibold transition ${
                  activeTab === t.key
                    ? 'bg-white text-emerald-800 shadow-sm dark:bg-[#22302a] dark:text-[#4ee6b0]'
                    : 'text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

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
