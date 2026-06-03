'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { Header } from '@/components/Header'
import { Button, Card, Input, Label, Select, Spinner } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { mergeCategories, metaFrom, type CatMeta } from '@/lib/categories'
import { computeBalances, settle, spendByCategory, spendByMonth } from '@/lib/balances'
import { Donut, MonthlyBars } from '@/components/charts'
import type {
  Budget,
  Category,
  Expense,
  ExpenseShare,
  Group,
  Income,
  Member,
  Payment,
  Template,
} from '@/lib/types'

type Tab = 'gastos' | 'balances' | 'liquidacion' | 'miembros'

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
  const [fetching, setFetching] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>('gastos')

  const load = useCallback(async () => {
    const { data: g } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle()
    if (!g) {
      setNotFound(true)
      setFetching(false)
      return
    }
    setGroup(g as Group)
    const [
      { data: m },
      { data: e },
      { data: c },
      { data: p },
      { data: tpl },
      { data: bud },
      { data: inc },
    ] = await Promise.all([
      supabase.from('members').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('expenses').select('*').eq('group_id', groupId).order('date', { ascending: false }),
      supabase.from('categories').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('payments').select('*').eq('group_id', groupId).order('date', { ascending: false }),
      supabase.from('templates').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('budgets').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('incomes').select('*').eq('group_id', groupId).order('date', { ascending: false }),
    ])
    setMembers((m ?? []) as Member[])
    setCategories((c ?? []) as Category[])
    setPayments((p ?? []) as Payment[])
    setTemplates((tpl ?? []) as Template[])
    setBudgets((bud ?? []) as Budget[])
    setIncomes((inc ?? []) as Income[])
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
  }, [groupId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial async; setState ocurre tras el await
    if (user) load()
  }, [user, load])

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
        { key: 'gastos', label: 'Gastos' },
        { key: 'balances', label: 'Balances' },
      ]
    : [
        { key: 'gastos', label: 'Gastos' },
        { key: 'balances', label: 'Balances' },
        { key: 'liquidacion', label: 'Liquidación' },
        { key: 'miembros', label: 'Miembros' },
      ]

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <Link href="/" className="text-sm text-slate-400 hover:text-slate-600">
            ← Mis grupos
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
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

        <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${
                tab === t.key
                  ? 'bg-white shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'gastos' && (
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
        {tab === 'balances' && (
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
        {tab === 'liquidacion' && (
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
        {tab === 'miembros' && (
          <MiembrosTab group={group} members={members} expenses={expenses} onChanged={load} />
        )}
      </main>
    </>
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

  return (
    <div className="space-y-3">
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
                      {c.label}
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
                {catMeta(c).label}
              </option>
            ))}
          </Select>
        ) : (
          <span />
        )}
        {hasMembers ? (
          <div className="flex gap-2">
            {group.is_personal && (
              <Link href={`/g/${group.id}/importar`}>
                <Button variant="ghost">Importar resumen</Button>
              </Link>
            )}
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
      ) : (
        shown.map((e) => (
          <Card key={e.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{e.title}</p>
              <p className="mt-0.5 flex items-center gap-2 text-sm text-slate-500">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catMeta(e.category).color}`}>
                  {catMeta(e.category).label}
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
        ))
      )}
    </div>
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

      {/* Ingresos del mes */}
      <Card>
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

      <Card>
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
                      {catMeta(b.category).label}
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
                  {c.label}
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

  async function copyPay(key: string, toId: string, amt: number) {
    const alias = aliasOf(toId)
    const text = `${alias ? alias + ', ' : ''}${fmt(amt)}`
    try {
      await navigator.clipboard.writeText(text)
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
                <Button variant="ghost" onClick={() => copyPay(`t${i}`, t.toId, t.amount)}>
                  {copiedKey === `t${i}` ? '¡Copiado!' : 'Copiar alias + monto'}
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
      alert('No se puede borrar: este miembro pagó algún gasto.')
      return
    }
    await supabase.from('members').delete().eq('id', id)
    onChanged()
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
