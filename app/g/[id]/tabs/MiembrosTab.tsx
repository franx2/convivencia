'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, IconButton, Input, SectionTitle, useConfirm } from '@/components/ui'
import { type Expense, type Group, type Member } from '@/lib/types'

export function MiembrosTab({
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
  const { confirm, dialog } = useConfirm()

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

  const blocked = (message: string) => confirm({ title: 'No se puede borrar', message, infoOnly: true })

  async function remove(id: string, memberName: string) {
    if (usedMemberIds.has(id)) {
      blocked('Este miembro pagó algún gasto. Borrá o reasigná esos gastos primero.')
      return
    }
    // Las FKs hacia members son ON DELETE CASCADE (shares/incomes/savings/pagos):
    // borrar arrastraría ese historial en silencio y corrompería los balances.
    // Bloqueamos si el miembro está referenciado en algún lado.
    const refs = await memberReferences(id)
    if (refs) {
      blocked(`${refs}. Quitá esos registros primero.`)
      return
    }
    confirm({
      title: `¿Quitar a ${memberName}?`,
      message: 'Se elimina del grupo. No se puede deshacer.',
      confirmLabel: 'Quitar',
      tone: 'danger',
      onConfirm: async () => {
        const { data, error } = await supabase.from('members').delete().eq('id', id).select('id')
        if (error) {
          blocked('No se pudo borrar el miembro.')
          return
        }
        // RLS permite borrar miembros solo al dueño del grupo: si no se borró ninguna
        // fila (y no hubo error), fue por permisos.
        if (!data || data.length === 0) {
          blocked('Solo el dueño del grupo puede borrar miembros.')
          return
        }
        onChanged()
      },
    })
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
    const [shares, incomes, savings, payFrom, payTo, recurring, recurringShares] = await Promise.all([
      count('expense_shares', 'member_id'),
      count('incomes', 'member_id'),
      count('savings', 'member_id'),
      count('payments', 'from_member'),
      count('payments', 'to_member'),
      count('recurring_expenses', 'paid_by'),
      count('recurring_expense_shares', 'member_id'),
    ])
    const parts: string[] = []
    if (shares) parts.push('participa en gastos')
    if (incomes) parts.push('tiene ingresos cargados')
    if (savings) parts.push('tiene ahorros cargados')
    if (payFrom + payTo) parts.push('tiene pagos registrados')
    if (recurring + recurringShares) parts.push('está en gastos recurrentes')
    return parts.length ? parts.join(', ') : null
  }

  async function updateName(id: string, val: string, current: string) {
    const name = val.trim()
    if (!name || name === current) return
    await supabase.from('members').update({ name }).eq('id', id)
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
          <Button type="submit" disabled={busy || !name.trim()} className="shrink-0">
            Agregar
          </Button>
        </form>
        <div className="mt-1">
          {members.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay miembros.</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="border-b border-slate-100 py-3 last:border-0 last:pb-0 dark:border-[#26312d]">
                {/* Una fila por dato: en una sola, el nombre quedaba de 26px de ancho. */}
                <div className="flex items-center gap-3">
                  <Input
                    defaultValue={m.name}
                    onBlur={(e) => updateName(m.id, e.target.value, m.name)}
                    className="flex-1 font-medium"
                    aria-label={`Nombre de ${m.name}`}
                    autoCapitalize="words"
                  />
                  <IconButton label={`Quitar a ${m.name}`} onClick={() => remove(m.id, m.name)} />
                </div>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2">
                  <label className="block text-xs font-medium text-muted" title="Alias o CBU para cobrar">
                    Alias o CBU
                    <Input
                      defaultValue={m.alias ?? ''}
                      onBlur={(e) => updateAlias(m.id, e.target.value, m.alias)}
                      placeholder="alias.mercadopago"
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="mt-1"
                    />
                  </label>
                  <label className="block text-xs font-medium text-muted" title="Peso para el reparto proporcional">
                    Peso
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={String(m.weight ?? 1)}
                      onBlur={(e) => updateWeight(m.id, e.target.value)}
                      className="mt-1 text-right tabular-nums"
                    />
                  </label>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle>Invitar a alguien con cuenta</SectionTitle>
        <p className="mb-2 text-xs text-muted">
          Compartí este link. Quien lo abra (con sesión iniciada) podrá ver y editar el grupo.
        </p>
        <div className="flex gap-2">
          <Input readOnly value={inviteUrl} aria-label="Link de invitación" />
          <Button variant="ghost" onClick={copyInvite} className="shrink-0">
            {copied ? '¡Copiado!' : 'Copiar'}
          </Button>
        </div>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <Button
            onClick={() => navigator.share({ title: group.name, url: inviteUrl }).catch(() => undefined)}
            className="mt-2 w-full"
          >
            Compartir invitación
          </Button>
        )}
      </Card>
      {dialog}
    </div>
  )
}
