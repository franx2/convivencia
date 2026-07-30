'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { BottomNav } from '@/components/BottomNav'
import { Header } from '@/components/Header'
import { Button, Card, Input, Label, Select, Spinner } from '@/components/ui'
import { CURRENCIES, formatMoney } from '@/lib/currencies'
import { userDisplayName, userPaymentAlias } from '@/lib/profile'
import type { Group } from '@/lib/types'

export default function HomePage() {
  const { user, loading } = useRequireAuth()
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [pending, setPending] = useState<Record<string, number>>({})
  const [fetching, setFetching] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('ARS')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const ensuredPersonal = useRef(false)

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false })
    let gs = (data ?? []) as Group[]

    // Auto-crear el espacio personal a quien no tenga (una sola vez).
    // Atómico vía RPC: grupo + miembro "Yo" + identidad en una transacción.
    if (!ensuredPersonal.current && !gs.some((g) => g.is_personal)) {
      ensuredPersonal.current = true
      const pg = await createGroupWithOwner({
        name: 'Mi espacio',
        baseCurrency: 'ARS',
        memberName: 'Yo',
        alias: userPaymentAlias(user) || null,
        isPersonal: true,
        userId: user.id,
      }).catch(() => null)
      if (pg) gs = [pg, ...gs]
    }
    setGroups(gs)

    // Total gastado en el mes en curso por grupo (en su moneda base).
    const ids = gs.map((g) => g.id)
    if (ids.length) {
      const { data: ex } = await supabase
        .from('expenses')
        .select('group_id, amount, rate_to_base, date')
        .in('group_id', ids)
      const month = new Date().toISOString().slice(0, 7)
      const t: Record<string, number> = {}
      for (const e of (ex ?? []) as {
        group_id: string
        amount: number
        rate_to_base: number
        date: string
      }[]) {
        if (String(e.date).slice(0, 7) !== month) continue
        t[e.group_id] = (t[e.group_id] ?? 0) + Number(e.amount) * Number(e.rate_to_base)
      }
      setTotals(t)

      // Pendientes de la lista de compras por grupo, para destacarla en la home.
      const { data: shop } = await supabase
        .from('shopping_items')
        .select('group_id')
        .in('group_id', ids)
        .eq('checked', false)
      const p: Record<string, number> = {}
      for (const s of (shop ?? []) as { group_id: string }[]) {
        p[s.group_id] = (p[s.group_id] ?? 0) + 1
      }
      setPending(p)
    }
    setFetching(false)
  }, [user])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  async function createGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    let group: Group
    try {
      const g = await createGroupWithOwner({
        name: name.trim(),
        baseCurrency: currency,
        memberName: userDisplayName(user),
        alias: userPaymentAlias(user) || null,
        isPersonal: false,
        userId: user.id,
      })
      if (!g) throw new Error('No se pudo crear el grupo.')
      group = g
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'No se pudo crear el grupo.')
      return
    }
    setBusy(false)
    setName('')
    setShowForm(false)
    // Onboarding: primero sumar integrantes, después compartir el link de invitación.
    router.push(`/g/${group.id}/invitar`)
  }

  async function deleteGroup(group: Group) {
    if (!user || group.owner_id !== user.id || deletingId) return
    const userId = user.id
    const ok = window.confirm(
      `¿Borrar "${group.name}"? Se eliminan sus gastos, miembros, pagos, ingresos, ahorros, tarjetas, presupuestos y categorías.`
    )
    if (!ok) return

    setDeletingId(group.id)
    setDeleteError(null)
    try {
      const expenses = await supabase.from('expenses').select('id').eq('group_id', group.id)
      if (expenses.error) throw expenses.error
      const expenseIds = ((expenses.data ?? []) as { id: string }[]).map((e) => e.id)
      if (expenseIds.length > 0) {
        const { error } = await supabase.from('expense_shares').delete().in('expense_id', expenseIds)
        if (error) throw error
      }
      const optionalTables = new Set<string>(['incomes', 'savings', 'cards'])
      for (const table of ['payments', 'budgets', 'templates', 'categories', 'incomes', 'savings', 'expenses', 'cards', 'members'] as const) {
        const { error } = await supabase.from(table).delete().eq('group_id', group.id)
        if (error) {
          if (optionalTables.has(table) && isMissingRelationError(error)) continue
          throw error
        }
      }
      const { error } = await supabase.from('groups').delete().eq('id', group.id).eq('owner_id', userId)
      if (error) throw error
      setGroups((prev) => prev.filter((g) => g.id !== group.id))
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo borrar el grupo.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading || !user) return <Spinner />

  const personalGroups = groups.filter((g) => g.is_personal)
  const sharedGroups = groups.filter((g) => !g.is_personal)
  const personalGroup = personalGroups[0]

  function groupCard(g: Group) {
    const month = totals[g.id] ?? 0
    return (
      <Card
        key={g.id}
        className="flex items-stretch justify-between overflow-hidden p-0 transition hover:border-emerald-300 hover:shadow"
      >
        <Link href={`/g/${g.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-medium">
              <span className="truncate">{g.name}</span>
              {g.is_personal && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  personal
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
              Este mes: {formatMoney(month, g.base_currency)}
              {!g.is_personal && (pending[g.id] ?? 0) > 0 && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  🛒 {pending[g.id]}
                </span>
              )}
            </span>
          </span>
          <span className="shrink-0 text-sm text-slate-400">{g.base_currency}</span>
        </Link>
        {g.owner_id === user!.id && (
          <button
            type="button"
            onClick={() => deleteGroup(g)}
            disabled={deletingId !== null}
            className="border-l border-slate-100 px-3 text-sm font-medium text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:hover:bg-red-950/30"
          >
            {deletingId === g.id ? 'Borrando…' : 'Borrar'}
          </button>
        )}
      </Card>
    )
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-36 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Grupos compartidos</h1>
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancelar' : '+ Nuevo grupo'}
          </Button>
        </div>

        {showForm && (
          <Card className="mb-5">
            <form onSubmit={createGroup} className="space-y-3">
              <div>
                <Label>Nombre del grupo</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Casa, viaje, asado…"
                  required
                />
              </div>
              <div>
                <Label>Moneda base</Label>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Creando…' : 'Crear grupo'}
              </Button>
            </form>
          </Card>
        )}

        {deleteError && <p className="mb-2 text-sm text-red-600">{deleteError}</p>}
        {fetching ? (
          <Spinner />
        ) : sharedGroups.length === 0 ? (
          <Card className="text-center text-slate-500">
            Todavía no tenés grupos compartidos. Creá uno para repartir gastos.
          </Card>
        ) : (
          <div className="space-y-2">{sharedGroups.map(groupCard)}</div>
        )}
      </main>

      <BottomNav active="shared" personalHref={personalGroup ? `/g/${personalGroup.id}` : null} />
    </>
  )
}

function isMissingRelationError(error: { code?: string; message?: string }) {
  const msg = (error.message ?? '').toLowerCase()
  return error.code === '42P01' || error.code === 'PGRST205' || msg.includes('could not find') || msg.includes('does not exist')
}

function isMissingFunctionError(error: { code?: string; message?: string }) {
  const msg = (error.message ?? '').toLowerCase()
  return error.code === 'PGRST202' || msg.includes('could not find the function')
}

// Crea grupo + miembro creador + identidad. Usa la RPC atómica create_group; si
// la función aún no existe (migración sin correr en este entorno), cae al método
// por pasos para no dejar la creación de grupos rota entre deploy y migración.
// ponytail: fallback por ordering deploy-antes-que-SQL; borrar cuando la
// migración esté corrida en todos los entornos.
async function createGroupWithOwner(opts: {
  name: string
  baseCurrency: string
  memberName: string | null
  alias: string | null
  isPersonal: boolean
  userId: string
}): Promise<Group | null> {
  const { name, baseCurrency, memberName, alias, isPersonal, userId } = opts
  const rpc = await supabase.rpc('create_group', {
    p_name: name,
    p_base_currency: baseCurrency,
    p_member_name: memberName,
    p_alias: alias,
    p_is_personal: isPersonal,
  })
  if (!rpc.error && rpc.data) return rpc.data as Group
  if (rpc.error && !isMissingFunctionError(rpc.error)) throw rpc.error

  // Fallback no atómico (RPC ausente).
  const { data: g, error } = await supabase
    .from('groups')
    .insert({ name, base_currency: baseCurrency, is_personal: isPersonal })
    .select()
    .single()
  if (error || !g) throw error ?? new Error('No se pudo crear el grupo.')
  const group = g as Group
  if (memberName) {
    const { data: member } = await supabase
      .from('members')
      .insert({ group_id: group.id, name: memberName, alias: alias || null })
      .select('id')
      .single()
    if (member) {
      await supabase
        .from('group_users')
        .update({ member_id: (member as { id: string }).id })
        .eq('group_id', group.id)
        .eq('user_id', userId)
    }
  }
  return group
}
