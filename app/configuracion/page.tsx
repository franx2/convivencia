'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Moon, Smartphone, Sun, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth, useRequireAuth } from '@/components/AuthProvider'
import { PageShell } from '@/components/PageShell'
import { Button, Card, Checkbox, ErrorText, Input, Label, PageTitle, Spinner, selectableBox, useDarkMode } from '@/components/ui'
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
  const { mode, setMode } = useDarkMode()
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
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${selectableBox(stores.includes(s))}`}
              >
                <Checkbox checked={stores.includes(s)} onChange={() => toggleStore(s)} />
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

      <Card className="mt-4">
        <div>
          <p className="font-semibold">Apariencia</p>
          <p className="text-xs text-slate-400">Automatico sigue el modo configurado en tu celular.</p>
        </div>
        <div role="radiogroup" aria-label="Apariencia" className="mt-3 grid grid-cols-3 rounded-xl bg-slate-100 p-1 dark:bg-[#18201d]">
          <ThemeModeButton active={mode === 'auto'} label="Auto" Icon={Smartphone} onClick={() => setMode('auto')} />
          <ThemeModeButton active={mode === 'light'} label="Claro" Icon={Sun} onClick={() => setMode('light')} />
          <ThemeModeButton active={mode === 'dark'} label="Oscuro" Icon={Moon} onClick={() => setMode('dark')} />
        </div>
      </Card>

      <Button variant="danger" onClick={handleSignOut} className="mt-4 w-full py-3 font-bold">
        Cerrar sesión
      </Button>
    </PageShell>
  )
}

function ThemeModeButton({
  active,
  label,
  Icon,
  onClick,
}: {
  active: boolean
  label: string
  Icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${
        active
          ? 'bg-white text-emerald-700 shadow-sm dark:bg-[#22302a] dark:text-[#4ee6b0]'
          : 'text-slate-500 hover:text-slate-700 dark:text-[#94a19c] dark:hover:text-[#f4f7f6]'
      }`}
    >
      <Icon size={15} strokeWidth={2.3} />
      {label}
    </button>
  )
}
