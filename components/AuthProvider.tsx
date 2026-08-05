'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthCtx = {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user || typeof window === 'undefined') return

    // Una apertura por pestana: evita inflar el contador en cada navegacion,
    // pero registra una nueva sesion cuando la persona vuelve a usar la app.
    const openedKey = `convivencia:activity-opened:${user.id}`
    if (window.sessionStorage.getItem(openedKey)) return
    window.sessionStorage.setItem(openedKey, '1')

    void supabase.from('user_activity_events').insert({ event_type: 'app_opened' })
  }, [user])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <Ctx.Provider value={{ user, loading, signOut }}>{children}</Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)

/** Para paginas protegidas: redirige a /login si no hay sesion. */
export function useRequireAuth() {
  const { user, loading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])
  return { user, loading }
}
