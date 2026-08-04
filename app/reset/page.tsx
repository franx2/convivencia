'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Card, Input, Label, Spinner } from '@/components/ui'
import { Brand } from '@/components/Brand'

export default function ResetPasswordPage() {
  const router = useRouter()
  // 'checking' mientras Supabase procesa el link del email,
  // 'ready' si hay sesión de recuperación, 'invalid' si no.
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let settled = false

    // El link del email trae el token en el hash; con detectSessionInUrl
    // Supabase lo procesa y dispara PASSWORD_RECOVERY con una sesión válida.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        settled = true
        setStatus('ready')
      }
    })

    // Fallback: si ya había sesión (o el hash ya se procesó antes del listener).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true
        setStatus('ready')
      }
    })

    // Si en unos segundos no apareció ninguna sesión, el link es inválido/expiró.
    const t = setTimeout(() => {
      if (!settled) setStatus('invalid')
    }, 4000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(t)
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
      setTimeout(() => router.replace('/'), 1500)
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
        <p className="mb-6 text-center text-sm text-slate-500">Crear una nueva contraseña</p>
        <Card>
          {status === 'checking' && <Spinner />}

          {status === 'invalid' && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-slate-600">
                El link de recuperación es inválido o expiró. Pedí uno nuevo desde la
                pantalla de inicio de sesión.
              </p>
              <Button type="button" className="w-full" onClick={() => router.replace('/login')}>
                Ir a iniciar sesión
              </Button>
            </div>
          )}

          {status === 'ready' && done && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-emerald-700">
                Contraseña actualizada. Te llevamos a tus grupos…
              </p>
              <Spinner />
            </div>
          )}

          {status === 'ready' && !done && (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label>Nueva contraseña</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label>Repetir contraseña</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? 'Guardando…' : 'Guardar contraseña'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
