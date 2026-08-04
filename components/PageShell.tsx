'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { BottomNav } from '@/components/BottomNav'
import { Header } from '@/components/Header'

/**
 * Envoltorio único de página: Header + contenido + barra inferior.
 * Antes cada pantalla repetía su propio <main> con anchos distintos
 * (max-w-lg / max-w-2xl / max-w-3xl) que no coincidían con el Header
 * (siempre max-w-3xl), así que el contenido quedaba desalineado.
 */
export function PageShell({
  children,
  nav,
  personalHref,
  width = 'wide',
}: {
  children: ReactNode
  /** Sin `nav` no se muestra la barra inferior (ej: onboarding). */
  nav?: 'personal' | 'convivencia' | 'viajes' | 'settings'
  personalHref?: string | null
  /** `narrow` para formularios de una columna; igual alineado a la izquierda que el Header. */
  width?: 'wide' | 'narrow'
}) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6">
        <div className={width === 'narrow' ? 'mx-auto w-full max-w-lg' : ''}>{children}</div>
      </main>
      {nav && <BottomNav active={nav} personalHref={personalHref} />}
    </>
  )
}

/** Pantalla de "no encontrado" con el mismo shell que el resto. */
export function NotFoundScreen({ children, backHref = '/' }: { children: ReactNode; backHref?: string }) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 text-center text-slate-500 dark:text-slate-400">
        <p>{children}</p>
        <Link href={backHref} className="mt-3 inline-block font-medium text-emerald-700 underline dark:text-emerald-400">
          Volver
        </Link>
      </main>
    </>
  )
}
