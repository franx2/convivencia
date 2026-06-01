'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { Header } from '@/components/Header'
import { Button, Card, Input, Select, Spinner } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { categoryMeta } from '@/lib/categories'
import { computeBalances, settle, spendByCategory } from '@/lib/balances'
import type { Expense, ExpenseShare, Group, Member } from '@/lib/types'

type Tab = 'gastos' | 'balances' | 'liquidacion' | 'miembros'

export default function GroupPage() {
  const { user, loading } = useRequireAuth()
  const params = useParams<{ id: string }>()
  const groupId = params.id

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [shares, setShares] = useState<ExpenseShare[]>([])
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
    const [{ data: m }, { data: e }] = await Promise.all([
      supabase.from('members').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('expenses').select('*').eq('group_id', groupId).order('date', { ascending: false }),
    ])
    setMembers((m ?? []) as Member[])
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

  const tabs: { key: Tab; label: string }[] = [
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
          <h1 className="mt-1 text-2xl font-bold">{group.name}</h1>
          <p className="text-sm text-slate-500">Moneda base: {group.base_currency}</p>
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${
                tab === t.key ? 'bg-white shadow-sm' : 'text-slate-500'
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
            memberName={memberName}
            hasMembers={members.length > 0}
            onChanged={load}
          />
        )}
        {tab === 'balances' && (
          <BalancesTab group={group} members={members} expenses={expenses} shares={shares} />
        )}
        {tab === 'liquidacion' && (
          <LiquidacionTab group={group} members={members} expenses={expenses} shares={shares} />
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
  memberName,
  hasMembers,
  onChanged,
}: {
  group: Group
  expenses: Expense[]
  memberName: (id: string) => string
  hasMembers: boolean
  onChanged: () => void
}) {
  const [filter, setFilter] = useState<string>('all')

  async function remove(id: string) {
    if (!confirm('¿Borrar este gasto?')) return
    await supabase.from('expenses').delete().eq('id', id)
    onChanged()
  }

  const usedCats = Array.from(new Set(expenses.map((e) => e.category || 'otros')))
  const shown = filter === 'all' ? expenses : expenses.filter((e) => (e.category || 'otros') === filter)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {expenses.length > 0 ? (
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-[200px]">
            <option value="all">Todas las categorías</option>
            {usedCats.map((c) => (
              <option key={c} value={c}>
                {categoryMeta(c).label}
              </option>
            ))}
          </Select>
        ) : (
          <span />
        )}
        {hasMembers ? (
          <Link href={`/g/${group.id}/nuevo`}>
            <Button>+ Agregar gasto</Button>
          </Link>
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
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryMeta(e.category).color}`}>
                  {categoryMeta(e.category).label}
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
}: {
  group: Group
  members: Member[]
  expenses: Expense[]
  shares: ExpenseShare[]
}) {
  const balances = useMemo(
    () => computeBalances(members, expenses, shares),
    [members, expenses, shares]
  )
  const total = expenses.reduce((s, e) => s + Number(e.amount) * Number(e.rate_to_base), 0)
  const byCat = useMemo(() => spendByCategory(expenses), [expenses])

  return (
    <div className="space-y-3">
      <Card className="flex items-center justify-between">
        <span className="text-slate-500">Total gastado</span>
        <span className="text-lg font-semibold">{formatMoney(total, group.base_currency)}</span>
      </Card>

      {byCat.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-medium text-slate-600">Gastos por categoría</p>
          <div className="space-y-2">
            {byCat.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryMeta(c.category).color}`}>
                    {categoryMeta(c.category).label}
                  </span>
                  <span className="text-slate-600">
                    {formatMoney(c.total, group.base_currency)} · {c.pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="px-1 pt-1 text-xs font-medium uppercase tracking-wide text-slate-400">Saldos</p>
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
    </div>
  )
}

function LiquidacionTab({
  group,
  members,
  expenses,
  shares,
}: {
  group: Group
  members: Member[]
  expenses: Expense[]
  shares: ExpenseShare[]
}) {
  const transfers = useMemo(() => {
    const balances = computeBalances(members, expenses, shares)
    return settle(balances)
  }, [members, expenses, shares])

  if (transfers.length === 0)
    return <Card className="text-center text-slate-500">Todo saldado. Nadie le debe a nadie. 🎉</Card>

  return (
    <div className="space-y-2">
      {transfers.map((t, i) => (
        <Card key={i} className="flex items-center justify-between">
          <span>
            <span className="font-medium text-red-600">{t.fromName}</span>
            <span className="text-slate-400"> le paga a </span>
            <span className="font-medium text-emerald-600">{t.toName}</span>
          </span>
          <span className="font-semibold">{formatMoney(t.amount, group.base_currency)}</span>
        </Card>
      ))}
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
              <div key={m.id} className="flex items-center justify-between border-b border-slate-100 pb-1 last:border-0">
                <span>{m.name}</span>
                <button onClick={() => remove(m.id)} className="text-slate-300 hover:text-red-500" title="Quitar">
                  ✕
                </button>
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
