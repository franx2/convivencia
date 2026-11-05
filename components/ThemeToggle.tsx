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
      className="grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-slate-100 dark:text-[#c1cbc6] dark:hover:bg-[#18201d]"
    >
      {dark ? <Sun size={19} strokeWidth={2.2} /> : <Moon size={19} strokeWidth={2.2} />}
    </button>
  )
}
