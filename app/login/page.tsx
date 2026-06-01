'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { Button, Card, Input, Label } from '@/components/ui'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const nextDest = () => {
    if (typeof window === 'undefined') return '/'
    const n = new URLSearchParams(window.location.search).get('next')
    return n && n.startsWith('/') ? n : '/'
  }

  useEffect(() => {
    if (!loading && user) router.replace(nextDest())
  }, [user, loading, router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
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
          router.replace(nextDest())
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
        <h1 className="mb-1 text-center text-3xl font-bold text-emerald-700">convivencia</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Repartí gastos compartidos sin pelearte</p>
        <Card>
          {mode === 'forgot' ? (
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-700">Recuperar contraseña</h2>
              <p className="mt-1 text-sm text-slate-500">
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            {info && <p className="text-sm text-emerald-700">{info}</p>}
            <Button type="submit" disabled={busy} className="w-full">
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
