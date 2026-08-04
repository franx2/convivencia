'use client'

import { useDarkMode } from '@/components/ui'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { dark, toggle } = useDarkMode()

  return (
    <button
      onClick={toggle}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      aria-label="Cambiar tema"
      className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-[#c7c7cc] dark:hover:bg-[#1c1c1e]"
    >
      {dark ? <Sun size={19} strokeWidth={2.2} /> : <Moon size={19} strokeWidth={2.2} />}
    </button>
  )
}
