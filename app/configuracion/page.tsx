'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth, useRequireAuth } from '@/components/AuthProvider'
import { BottomNav } from '@/components/BottomNav'
import { Header } from '@/components/Header'
import { Button, Card, Input, Label, Spinner } from '@/components/ui'
import { userDisplayName, userPaymentAlias } from '@/lib/profile'

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
  const [dark, setDark] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!user) return
    /* eslint-disable react-hooks/set-state-in-effect -- hidratar el form con los datos de la cuenta */
    setName(userDisplayName(user))
    setAlias(userPaymentAlias(user))
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee el tema inicial del DOM (script anti-flash)
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggleDark() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      // ignorar (modo privado / sin storage)
    }
  }

  async function save() {
    if (!user) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const cleanName = name.trim()
    const cleanAlias = alias.trim()
    const { error: upErr } = await supabase.auth.updateUser({
      data: { full_name: cleanName || null, payment_alias: cleanAlias || null },
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

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  if (loading || !user || !hydrated) return <Spinner />

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-6">
        <h1 className="mb-1 text-2xl font-bold">Configuración</h1>
        <p className="mb-5 text-sm text-slate-500">Datos de tu cuenta y preferencias.</p>

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
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
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
            onClick={toggleDark}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${dark ? 'bg-emerald-600' : 'bg-slate-300'}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${dark ? 'left-[22px]' : 'left-0.5'}`}
            />
          </button>
        </Card>

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-4 w-full rounded-xl border border-rose-200 bg-white py-3 text-center text-sm font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:hover:bg-rose-950/40"
        >
          Cerrar sesión
        </button>
      </main>
      <BottomNav active="personal" />
    </>
  )
}
