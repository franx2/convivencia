'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { House, Plane, Settings, ShoppingBasket, UsersRound, type LucideIcon } from 'lucide-react'

type BottomNavProps = {
  active: 'personal' | 'convivencia' | 'super' | 'viajes' | 'settings'
  personalHref?: string | null
}

export function BottomNav({ active, personalHref }: BottomNavProps) {
  const { user } = useAuth()
  const [fetchedPersonalHref, setFetchedPersonalHref] = useState<string | null>(null)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const resolvedPersonalHref = personalHref ?? fetchedPersonalHref

  // En iOS el teclado empuja hacia arriba los elementos `position: fixed` y la
  // barra "se levanta" tapando el contenido. Mientras hay teclado, la ocultamos.
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const onResize = () => setKeyboardOpen(window.innerHeight - vv.height > 150)
    onResize()
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (personalHref) return
    if (!user) return

    let cancelled = false
    supabase
      .from('groups')
      .select('id')
      .eq('is_personal', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.id) setFetchedPersonalHref(`/g/${data.id}`)
      })

    return () => {
      cancelled = true
    }
  }, [personalHref, user])

  if (keyboardOpen) return null

  return (
    <nav className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 px-3">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 rounded-[1.75rem] border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_12px_35px_rgba(15,23,42,0.22)] backdrop-blur dark:border-slate-700/90 dark:bg-slate-950/95">
        <NavItem
          active={active === 'personal'}
          disabled={!resolvedPersonalHref}
          href={resolvedPersonalHref ?? '#'}
          Icon={House}
          label="Personal"
        />
        <NavItem active={active === 'convivencia'} href="/?section=convivencia" Icon={UsersRound} label="Convivencia" />
        <NavItem active={active === 'super'} href="/super" Icon={ShoppingBasket} label="Super" />
        <NavItem active={active === 'viajes'} href="/?section=viajes" Icon={Plane} label="Viajes" />
        <NavItem active={active === 'settings'} href="/configuracion" Icon={Settings} label="Config." />
      </div>
    </nav>
  )
}

function NavItem({
  active,
  disabled,
  href,
  Icon,
  label,
}: {
  active: boolean
  disabled?: boolean
  href: string
  Icon: LucideIcon
  label: string
}) {
  const cls = `flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[1.25rem] px-1 py-2 text-center transition ${
    active
      ? 'bg-emerald-700 text-white shadow-sm dark:bg-emerald-600'
      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
  } ${disabled ? 'pointer-events-none opacity-45' : ''}`

  const body = (
    <>
      <Icon size={20} strokeWidth={2.3} />
      <span className="block truncate text-[10px] font-bold leading-tight">{label}</span>
    </>
  )

  if (disabled) {
    return (
      <button type="button" disabled className={cls}>
        {body}
      </button>
    )
  }

  return (
    <Link href={href} className={cls}>
      {body}
    </Link>
  )
}
