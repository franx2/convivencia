'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { createGroupWithOwner } from '@/lib/groups'
import { PageShell } from '@/components/PageShell'
import { Button, Card, Checkbox, ErrorText, Input, selectableBox, Spinner, TextButton } from '@/components/ui'
import { SUPERMARKETS } from '@/lib/stores'
import { ALL_MODULES, MODULES, userModules, userPaymentAlias, userPreferredStores, type ModuleKey } from '@/lib/profile'
import { House, UserRound, UsersRound, type LucideIcon } from 'lucide-react'

type Uso = 'personal' | 'conviviente' | 'ambas'

const USO_OPTIONS: { key: Uso; Icon: LucideIcon; title: string; desc: string }[] = [
  { key: 'conviviente', Icon: House, title: 'Vivo con mi pareja / compañeros', desc: 'Quiero repartir gastos compartidos.' },
  { key: 'personal', Icon: UserRound, title: 'Solo mis gastos personales', desc: 'No necesito repartir con nadie.' },
  { key: 'ambas', Icon: UsersRound, title: 'Las dos cosas', desc: 'Gastos propios y compartidos.' },
]

/**
 * Onboarding post-registro (una sola vez por cuenta, marca user_metadata.onboarded):
 * uso previsto -> módulos -> alias de cobro (si usa grupos) -> supermercados
 * (si usa la lista). Hidrata con lo ya guardado. Con ?solo=modulos (cuentas de
 * antes de los módulos) pregunta solo eso.
 */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Onboarding />
    </Suspense>
  )
}

type Step = 'uso' | 'modulos' | 'alias' | 'super'

function Onboarding() {
  const { user, loading } = useRequireAuth()
  const router = useRouter()
  const onlyModules = useSearchParams().get('solo') === 'modulos'
  const [hydrated, setHydrated] = useState(false)
  const [step, setStep] = useState<Step>(onlyModules ? 'modulos' : 'uso')
  const [modules, setModules] = useState<ModuleKey[]>(ALL_MODULES)
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
    setModules(userModules(user))
    const existingUso = user.user_metadata?.intended_use
    if (existingUso === 'personal' || existingUso === 'conviviente' || existingUso === 'ambas') setUso(existingUso)
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user])

  const steps: Step[] = onlyModules
    ? ['modulos']
    : [
        'uso',
        'modulos',
        ...(modules.includes('grupos') ? (['alias'] as Step[]) : []),
        ...(modules.includes('super') ? (['super'] as Step[]) : []),
      ]
  const stepIdx = steps.indexOf(step)
  const isLast = stepIdx === steps.length - 1
  const next = () => (isLast ? void finish() : setStep(steps[stepIdx + 1]))
  const back = () => setStep(steps[stepIdx - 1])
  const nextLabel = isLast ? (busy ? 'Guardando…' : 'Empezar') : 'Continuar'

  function chooseUso(u: Uso) {
    setUso(u)
    // "Solo personal" arranca sin grupos ni lista (la lista vive en la convivencia).
    setModules(u === 'personal' ? ['finanzas'] : ALL_MODULES)
  }

  function toggleModule(k: ModuleKey) {
    setModules((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : ALL_MODULES.filter((x) => x === k || prev.includes(x)),
    )
  }

  function toggleStore(s: string) {
    setStores((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  async function finish() {
    if (!user) return
    setBusy(true)
    setError(null)
    const cleanAlias = alias.trim()
    const { error: upErr } = await supabase.auth.updateUser({
      data: onlyModules
        ? { modules }
        : {
            onboarded: true,
            intended_use: uso,
            modules,
            payment_alias: cleanAlias || null,
            preferred_stores: stores,
          },
    })
    if (upErr) {
      setBusy(false)
      setError(upErr.message)
      return
    }
    if (onlyModules) {
      router.replace('/')
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
    if ((uso === 'personal' || !modules.includes('grupos')) && personalId) router.replace(`/g/${personalId}`)
    else if (uso === 'conviviente') router.replace('/?nuevo=1')
    else router.replace('/')
  }

  if (loading || !user || !hydrated) return <Spinner />

  return (
    <PageShell width="narrow">
      {steps.length > 1 && (
        <p className="mb-4 text-sm font-semibold text-muted">
          {/* El total depende de lo que elija en 'uso' y 'modulos': en el primer paso no lo prometemos. */}
          Paso {stepIdx + 1}{step === 'uso' ? '' : ` de ${steps.length}`}
        </p>
      )}

        {step === 'uso' && (
          <Card>
            <h1 className="text-xl font-bold">¿Cómo vas a usar covivencia?</h1>
            <p className="mt-1 text-sm text-muted">Así te llevamos directo a lo que más vas a usar.</p>
            <div className="mt-4 space-y-2">
              {USO_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => chooseUso(o.key)}
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
                    <span className="block text-xs text-muted">{o.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <Button onClick={next} disabled={!uso} className="mt-5 w-full">
              Continuar
            </Button>
          </Card>
        )}

        {step === 'modulos' && (
          <Card>
            <h1 className="text-xl font-bold">¿Qué querés usar?</h1>
            <p className="mt-1 text-sm text-muted">
              Mostramos solo lo que elijas. Gastos y Tarjetas están siempre. Lo cambiás cuando quieras en Config.
            </p>
            <div className="mt-4 space-y-2">
              {MODULES.map((m) => (
                <label
                  key={m.key}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${selectableBox(modules.includes(m.key))}`}
                >
                  <span className="pt-0.5">
                    <Checkbox checked={modules.includes(m.key)} onChange={() => toggleModule(m.key)} />
                  </span>
                  <span>
                    <span className="block font-semibold">{m.title}</span>
                    <span className="block text-xs text-muted">{m.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            {isLast && (
              <div className="mt-3">
                <ErrorText>{error}</ErrorText>
              </div>
            )}
            <div className="mt-5 flex items-center justify-between">
              {stepIdx > 0 ? (
                <TextButton tone="muted" onClick={back}>
                  ← Atrás
                </TextButton>
              ) : (
                <span />
              )}
              <Button onClick={next} disabled={busy}>
                {nextLabel}
              </Button>
            </div>
          </Card>
        )}

        {step === 'alias' && (
          <Card>
            <h1 className="text-xl font-bold">Alias para cobrar</h1>
            <p className="mt-1 text-sm text-muted">
              Así te pueden transferir cuando alguien te debe plata. Se completa solo cuando elegís quién sos en un grupo.
            </p>
            <div className="mt-4">
              <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="tu.alias / CBU" autoFocus autoCapitalize="none" autoCorrect="off" enterKeyHint="next" />
              {isLast && <div className="mt-3"><ErrorText>{error}</ErrorText></div>}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <TextButton tone="muted" onClick={back}>
                ← Atrás
              </TextButton>
              <Button onClick={next} disabled={busy || !alias.trim()}>
                {nextLabel}
              </Button>
            </div>
          </Card>
        )}

        {step === 'super' && (
          <Card>
            <h1 className="text-xl font-bold">¿Qué supermercados usás?</h1>
            <p className="mt-1 text-sm text-muted">
              Elegí todos los que compres: el buscador de precios de la lista de compras va a mostrar solo esos. Podés
              dejarlo vacío y buscamos en todos.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {SUPERMARKETS.map((s) => (
                <label
                  key={s}
                  className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${selectableBox(stores.includes(s))}`}
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
              <TextButton tone="muted" onClick={back}>
                ← Atrás
              </TextButton>
              <Button onClick={finish} disabled={busy}>
                {busy ? 'Guardando…' : 'Empezar'}
              </Button>
            </div>
          </Card>
        )}
    </PageShell>
  )
}
