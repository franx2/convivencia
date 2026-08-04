'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth, useRequireAuth } from '@/components/AuthProvider'
import { PageShell } from '@/components/PageShell'
import { Button, Card, ErrorText, Input, Label, PageTitle, Spinner, useDarkMode } from '@/components/ui'
import { userDisplayName, userPaymentAlias, userPreferredStores } from '@/lib/profile'
import { SUPERMARKETS } from '@/lib/stores'

/**
 * Configuración de la cuenta (items 2/11/12): nombre visible, alias de cobro
 * único por cuenta, modo oscuro y cerrar sesión. El alias se guarda en el
 * user_metadata (fuente de verdad) y se sincroniza en los miembros que
 * representan a esta cuenta en cada grupo.
 */
export default function ConfiguracionPage() {
  const { user, loading } = useRequireAuth()
  const { signOut } = useAuth()
  const router = useRouter()

  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')
  const [stores, setStores] = useState<string[]>([])
  const { dark, toggle: toggleDark } = useDarkMode()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!user) return
    /* eslint-disable react-hooks/set-state-in-effect -- hidratar el form con los datos de la cuenta */
    setName(userDisplayName(user))
    setAlias(userPaymentAlias(user))
    setStores(userPreferredStores(user))
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user])

  async function save() {
    if (!user) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const cleanName = name.trim()
    const cleanAlias = alias.trim()
    const { error: upErr } = await supabase.auth.updateUser({
      data: { full_name: cleanName || null, payment_alias: cleanAlias || null, preferred_stores: stores },
    })
    if (upErr) {
      setBusy(false)
      setError(upErr.message)
      return
    }
    // Alias único por cuenta (item 11): replicar en los miembros vinculados a
    // esta cuenta en cualquier grupo, así otros ven el alias actualizado.
    const { data: links } = await supabase
      .from('group_users')
      .select('member_id')
      .eq('user_id', user.id)
      .not('member_id', 'is', null)
    const ids = ((links ?? []) as { member_id: string | null }[])
      .map((l) => l.member_id)
      .filter((id): id is string => Boolean(id))
    if (ids.length) {
      await supabase.from('members').update({ alias: cleanAlias || null }).in('id', ids)
    }
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function toggleStore(s: string) {
    setStores((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  if (loading || !user || !hydrated) return <Spinner />

  return (
    <PageShell nav="settings" width="narrow">
      <PageTitle subtitle="Datos de tu cuenta y preferencias.">Configuración</PageTitle>

      <Card className="space-y-4">
        <div>
          <Label>Nombre visible</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          <p className="mt-1 text-xs text-slate-400">Con este nombre aparecés en los grupos compartidos.</p>
        </div>
        <div>
          <Label>Alias de cobro</Label>
          <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="alias.mp / CBU" />
          <p className="mt-1 text-xs text-slate-400">
            Se completa solo cuando elegís quién sos en un grupo, así te pueden transferir.
          </p>
        </div>
        <div>
          <Label>Supermercados que usás</Label>
          <div className="grid grid-cols-2 gap-2">
            {SUPERMARKETS.map((s) => (
              <label
                key={s}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  stores.includes(s)
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <input type="checkbox" checked={stores.includes(s)} onChange={() => toggleStore(s)} />
                {s}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Filtra el buscador de precios de la lista de compras. Sin ninguno marcado, busca en todos.
          </p>
        </div>
        <ErrorText>{error}</ErrorText>
        <Button onClick={save} disabled={busy} className="w-full">
          {busy ? 'Guardando…' : saved ? '¡Guardado!' : 'Guardar cambios'}
        </Button>
      </Card>

      <Card className="mt-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">Modo oscuro</p>
          <p className="text-xs text-slate-400">Cambia el aspecto de la app.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={dark}
          aria-label="Modo oscuro"
          onClick={toggleDark}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            dark ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${dark ? 'left-[22px]' : 'left-0.5'}`}
          />
        </button>
      </Card>

      <Button variant="danger" onClick={handleSignOut} className="mt-4 w-full py-3 font-bold">
        Cerrar sesión
      </Button>
    </PageShell>
  )
}
