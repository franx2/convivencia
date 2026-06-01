'use client'

import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee el estado inicial del tema desde el DOM (lo fijó el script anti-flash antes de hidratar)
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      // ignorar (modo privado / sin storage)
    }
  }

  return (
    <button
      onClick={toggle}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      aria-label="Cambiar tema"
      className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}
