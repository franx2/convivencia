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
    const { data, error } = await supabase
      .from('groups')
      .insert({ name: name.trim(), base_currency: currency })
      .select()
      .single()
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setName('')
    setShowForm(false)
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
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Creando…' : 'Crear grupo'}
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
                  <span className="font-medium">{g.name}</span>
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
