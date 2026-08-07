'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { createGroupWithOwner } from '@/lib/groups'
import { PageShell } from '@/components/PageShell'
import { Button, Card, Checkbox, ErrorText, Input, selectableBox, Spinner } from '@/components/ui'
import { SUPERMARKETS } from '@/lib/stores'
import { userPaymentAlias, userPreferredStores } from '@/lib/profile'
import { House, UserRound, UsersRound, type LucideIcon } from 'lucide-react'

type Uso = 'personal' | 'conviviente' | 'ambas'

const USO_OPTIONS: { key: Uso; Icon: LucideIcon; title: string; desc: string }[] = [
  { key: 'conviviente', Icon: House, title: 'Vivo con mi pareja / compañeros', desc: 'Quiero repartir gastos compartidos.' },
  { key: 'personal', Icon: UserRound, title: 'Solo mis gastos personales', desc: 'No necesito repartir con nadie.' },
  { key: 'ambas', Icon: UsersRound, title: 'Las dos cosas', desc: 'Gastos propios y compartidos.' },
]

/**
 * Onboarding post-registro (una sola vez por cuenta, marca user_metadata.onboarded):
 * uso previsto -> alias de cobro -> supermercados preferidos. Después de "uso":
 * hidrata con lo ya guardado, así a una cuenta existente no le repreguntamos.
 */
export default function OnboardingPage() {
  const { user, loading } = useRequireAuth()
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [uso, setUso] = useState<Uso | null>(null)
  const [alias, setAlias] = useState('')
  const [stores, setStores] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    /* eslint-disable react-hooks/set-state-in-effect -- hidratar el form con lo ya guardado en la cuenta */
    setAlias(userPaymentAlias(user))
    setStores(userPreferredStores(user))
    const existingUso = user.user_metadata?.intended_use
    if (existingUso === 'personal' || existingUso === 'conviviente' || existingUso === 'ambas') setUso(existingUso)
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user])

  function toggleStore(s: string) {
    setStores((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  async function finish() {
    if (!user) return
    setBusy(true)
    setError(null)
    const cleanAlias = alias.trim()
    const { error: upErr } = await supabase.auth.updateUser({
      data: {
        onboarded: true,
        intended_use: uso,
        payment_alias: cleanAlias || null,
        preferred_stores: stores,
      },
    })
    if (upErr) {
      setBusy(false)
      setError(upErr.message)
      return
    }

    // Asegura el espacio personal (si todavía no existe) para poder rutear ahí.
    let personalId: string | null = null
    const { data: existing } = await supabase.from('groups').select('id').eq('is_personal', true).maybeSingle()
    if (existing) {
      personalId = (existing as { id: string }).id
    } else {
      try {
        const g = await createGroupWithOwner({
          name: 'Mi espacio',
          baseCurrency: 'ARS',
          memberName: 'Yo',
          alias: cleanAlias || null,
          isPersonal: true,
          userId: user.id,
        })
        personalId = g?.id ?? null
      } catch {
        // Si falla, la home lo vuelve a intentar sola al cargar (ensuredPersonal).
      }
    }

    setBusy(false)
    if (uso === 'personal' && personalId) router.replace(`/g/${personalId}`)
    else if (uso === 'conviviente') router.replace('/?nuevo=1')
    else router.replace('/')
  }

  if (loading || !user || !hydrated) return <Spinner />

  return (
    <PageShell width="narrow">
      <p className="mb-4 text-sm font-semibold text-slate-400">Paso {step} de 3</p>

        {step === 1 && (
          <Card>
            <h1 className="text-xl font-bold">¿Cómo vas a usar covivencia?</h1>
            <p className="mt-1 text-sm text-slate-500">Así te llevamos directo a lo que más vas a usar.</p>
            <div className="mt-4 space-y-2">
              {USO_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setUso(o.key)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left ${
                    uso === o.key
                      ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <o.Icon size={21} strokeWidth={2.2} />
                  </span>
                  <span>
                    <span className="block font-semibold">{o.title}</span>
                    <span className="block text-xs text-slate-500">{o.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <Button onClick={() => setStep(2)} disabled={!uso} className="mt-5 w-full">
              Continuar
            </Button>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <h1 className="text-xl font-bold">Alias para cobrar</h1>
            <p className="mt-1 text-sm text-slate-500">
              Así te pueden transferir cuando alguien te debe plata. Se completa solo cuando elegís quién sos en un grupo.
            </p>
            <div className="mt-4">
              <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="tu.alias / CBU" autoFocus />
            </div>
            <div className="mt-5 flex items-center justify-between">
              <button type="button" onClick={() => setStep(1)} className="text-sm text-slate-400 hover:text-slate-600">
                ← Atrás
              </button>
              <Button onClick={() => setStep(3)} disabled={!alias.trim()}>
                Continuar
              </Button>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <h1 className="text-xl font-bold">¿Qué supermercados usás?</h1>
            <p className="mt-1 text-sm text-slate-500">
              Elegí todos los que compres: el buscador de precios de la lista de compras va a mostrar solo esos. Podés
              dejarlo vacío y buscamos en todos.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
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
            <div className="mt-3">
              <ErrorText>{error}</ErrorText>
            </div>
            <div className="mt-5 flex items-center justify-between">
              <button type="button" onClick={() => setStep(2)} className="text-sm text-slate-400 hover:text-slate-600">
                ← Atrás
              </button>
              <Button onClick={finish} disabled={busy}>
                {busy ? 'Guardando…' : 'Empezar'}
              </Button>
            </div>
          </Card>
        )}
    </PageShell>
  )
}
