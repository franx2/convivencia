'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { Card, Spinner } from '@/components/ui'

function JoinInner() {
  const { user, loading } = useAuth()
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token')
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (loading || !token) return
    if (!user) {
      // guardamos el destino para volver después de iniciar sesión
      router.replace(`/login?next=${encodeURIComponent(`/join?token=${token}`)}`)
      return
    }
    if (ran.current) return
    ran.current = true
    supabase.rpc('join_group', { p_token: token }).then(({ data, error }) => {
      if (error) setError(error.message)
      else if (data) router.replace(`/g/${data}`)
      else setError('No se pudo unir al grupo.')
    })
  }, [user, loading, token, router])

  const shownError = !token ? 'Link de invitación inválido.' : error

  if (shownError)
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <Card className="text-slate-600">
          {shownError}
          <div className="mt-3">
            <Link href="/" className="text-emerald-700 underline">
              Ir al inicio
            </Link>
          </div>
        </Card>
      </main>
    )

  return <Spinner />
}

export default function JoinPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <JoinInner />
    </Suspense>
  )
}
