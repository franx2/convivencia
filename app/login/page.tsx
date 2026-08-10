'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { Button, Card, ErrorText, Input, Label } from '@/components/ui'
import { Brand } from '@/components/Brand'
import { clientRateLimited } from '@/lib/client-rate-limit'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const nextDest = () => {
    if (typeof window === 'undefined') return '/'
    const n = new URLSearchParams(window.location.search).get('next')
    if (n && n.startsWith('/')) return n
    const saved = sessionStorage.getItem('oauth-next')
    return saved && saved.startsWith('/') ? saved : '/'
  }

  useEffect(() => {
    if (!loading && user) {
      const destination = nextDest()
      sessionStorage.removeItem('oauth-next')
      router.replace(destination)
    }
  }, [user, loading, router])

  async function signInWithGoogle() {
    if (typeof window === 'undefined') return
    setOauthBusy(true)
    setError(null)
    setInfo(null)
    const next = new URLSearchParams(window.location.search).get('next')
    if (next?.startsWith('/')) sessionStorage.setItem('oauth-next', next)

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    })
    if (oauthError) {
      setError(oauthError.message)
      setOauthBusy(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    // Freno de intentos (login/registro/reset comparten el límite): ver lib/client-rate-limit.ts.
    if (clientRateLimited('auth-attempt', 8, 5 * 60_000)) {
      setError('Demasiados intentos. Esperá unos minutos y volvé a intentar.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'forgot') {
        const redirectTo =
          typeof window !== 'undefined' ? `${window.location.origin}/reset` : undefined
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
        if (error) throw error
        setInfo('Si el email está registrado, te mandamos un link para restablecer la contraseña. Revisá tu casilla.')
      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace(nextDest())
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.session) {
          // El alias, el uso y los supermercados preferidos se piden en /onboarding.
          router.replace('/onboarding')
        } else {
          setInfo('Te registramos. Revisá tu email para confirmar la cuenta y después iniciá sesión.')
          setMode('signin')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-1 text-center"><Brand centered /></div>
        <p className="mb-6 text-center text-sm text-slate-500">Repartí gastos compartidos sin pelearte</p>
        <Card>
          {mode === 'forgot' ? (
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">Recuperar contraseña</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Ingresá tu email y te mandamos un link para crear una nueva contraseña.
              </p>
            </div>
          ) : (
            <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
              <button
                className={`flex-1 rounded-md py-1.5 font-medium ${mode === 'signin' ? 'bg-white shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setInfo(null)
                }}
                type="button"
              >
                Iniciar sesión
              </button>
              <button
                className={`flex-1 rounded-md py-1.5 font-medium ${mode === 'signup' ? 'bg-white shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
                onClick={() => {
                  setMode('signup')
                  setError(null)
                  setInfo(null)
                }}
                type="button"
              >
                Crear cuenta
              </button>
            </div>
          )}

          {mode !== 'forgot' && (
            <div className="mb-5 space-y-2">
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                disabled={busy || oauthBusy}
                className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#26312d] dark:bg-[#131816] dark:text-[#f4f7f6] dark:hover:bg-[#18201d]"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#4285f4] text-xs font-black text-white">G</span>
                {oauthBusy ? 'Conectando...' : 'Continuar con Google'}
              </button>
              <div className="flex items-center gap-3 pt-1 text-xs text-slate-400 dark:text-[#94a19c]" aria-hidden="true">
                <span className="h-px flex-1 bg-slate-200 dark:bg-[#26312d]" />
                <span>o usá tu email</span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-[#26312d]" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {mode !== 'forgot' && (
              <div>
                <Label>Contraseña</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot')
                      setError(null)
                      setInfo(null)
                    }}
                    className="mt-1.5 text-sm font-medium text-emerald-700 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
            )}
            <ErrorText>{error}</ErrorText>
            {info && <p className="text-sm text-emerald-700 dark:text-emerald-400">{info}</p>}
            <Button type="submit" disabled={busy || oauthBusy} className="w-full">
              {busy
                ? 'Procesando…'
                : mode === 'signin'
                  ? 'Entrar'
                  : mode === 'signup'
                    ? 'Registrarme'
                    : 'Enviar link de recuperación'}
            </Button>
            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setInfo(null)
                }}
                className="w-full text-center text-sm font-medium text-slate-500 hover:underline"
              >
                Volver a iniciar sesión
              </button>
            )}
          </form>
        </Card>
      </div>
    </div>
  )
}
