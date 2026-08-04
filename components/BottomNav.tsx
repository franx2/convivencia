'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { House, UsersRound, type LucideIcon } from 'lucide-react'

type BottomNavProps = {
  active: 'personal' | 'shared'
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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2 px-3">
        <NavItem
          active={active === 'personal'}
          disabled={!resolvedPersonalHref}
          href={resolvedPersonalHref ?? '#'}
          Icon={House}
          label="Personal"
          sublabel="Mis gastos"
        />
        <NavItem active={active === 'shared'} href="/" Icon={UsersRound} label="Compartidos" sublabel="Grupos" />
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
  sublabel,
}: {
  active: boolean
  disabled?: boolean
  href: string
  Icon: LucideIcon
  label: string
  sublabel: string
}) {
  const cls = `flex min-h-[64px] items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
    active
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:text-emerald-200'
      : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100'
  } ${disabled ? 'pointer-events-none opacity-45' : ''}`

  const body = (
    <>
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
          active ? 'bg-white shadow-sm dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-900'
        }`}
      >
        <Icon size={21} strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold leading-tight">{label}</span>
        <span className="mt-0.5 block truncate text-xs opacity-70">{sublabel}</span>
      </span>
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
