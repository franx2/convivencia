'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { Header } from '@/components/Header'
import { Button, Card, Input, Label, Select, Spinner } from '@/components/ui'
import { CURRENCIES } from '@/lib/currencies'
import type { Group } from '@/lib/types'

export default function HomePage() {
  const { user, loading } = useRequireAuth()
  const [groups, setGroups] = useState<Group[]>([])
  const [fetching, setFetching] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('ARS')
  const [personal, setPersonal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setGroups(data as Group[])
    setFetching(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial async; setState ocurre tras el await
    if (user) load()
  }, [user, load])

  async function createGroup(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // migration-safe: solo mandamos is_personal cuando aplica.
    const payload: { name: string; base_currency: string; is_personal?: boolean } = {
      name: name.trim(),
      base_currency: currency,
    }
    if (personal) payload.is_personal = true
    const { data, error } = await supabase.from('groups').insert(payload).select().single()
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    // Un espacio personal arranca con un único miembro ("Yo").
    if (personal && data) {
      await supabase.from('members').insert({ group_id: (data as Group).id, name: 'Yo' })
    }
    setBusy(false)
    setName('')
    setShowForm(false)
    setPersonal(false)
    if (data) setGroups((g) => [data as Group, ...g])
  }

  if (loading || !user) return <Spinner />

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Mis grupos</h1>
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
                  placeholder="Viaje a Bariloche"
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
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} />
                Es un espacio personal (solo mío, sin repartir)
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Creando…' : personal ? 'Crear espacio' : 'Crear grupo'}
              </Button>
            </form>
          </Card>
        )}

        {fetching ? (
          <Spinner />
        ) : groups.length === 0 ? (
          <Card className="text-center text-slate-500">
            Todavía no tenés grupos. Creá uno para empezar a cargar gastos.
          </Card>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <Link key={g.id} href={`/g/${g.id}`}>
                <Card className="flex items-center justify-between transition hover:border-emerald-300 hover:shadow">
                  <span className="flex items-center gap-2 font-medium">
                    {g.name}
                    {g.is_personal && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        personal
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-slate-400">{g.base_currency}</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
