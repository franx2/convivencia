'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { Button, Card, Input, Label } from '@/components/ui'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
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
      if (mode === 'signin') {
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
          <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm">
            <button
              className={`flex-1 rounded-md py-1.5 font-medium ${mode === 'signin' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              onClick={() => setMode('signin')}
              type="button"
            >
              Iniciar sesión
            </button>
            <button
              className={`flex-1 rounded-md py-1.5 font-medium ${mode === 'signup' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              onClick={() => setMode('signup')}
              type="button"
            >
              Crear cuenta
            </button>
          </div>

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
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {info && <p className="text-sm text-emerald-700">{info}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Procesando…' : mode === 'signin' ? 'Entrar' : 'Registrarme'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
