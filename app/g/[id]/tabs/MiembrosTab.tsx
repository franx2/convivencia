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
                  <IconButton label="Quitar" onClick={() => remove(m.id, m.name)}>
                    ✕
                  </IconButton>
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
        <SectionTitle>Invitar a alguien con cuenta</SectionTitle>
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
      {dialog}
    </div>
  )
}
