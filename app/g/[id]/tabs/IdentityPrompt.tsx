'use client'

import { useState } from 'react'
import { type User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Button, Card, ErrorText, Input, Select } from '@/components/ui'
import { userDisplayName, userPaymentAlias } from '@/lib/profile'
import { type Group, type Member } from '@/lib/types'

export function IdentityPrompt({
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
      {error && (
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Card>
  )
}

