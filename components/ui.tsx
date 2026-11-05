'use client'

import { useEffect, useState, type ButtonHTMLAttributes, type ComponentProps, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ChevronDown, X } from 'lucide-react'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}) {
  const base =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-[#4ee6b0] dark:text-[#062419] dark:hover:bg-[#72efc1]',
    ghost:
      'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:border-[#26312d] dark:bg-[#131816] dark:text-[#e0e7e3] dark:hover:bg-[#18201d]',
    danger:
      'bg-white text-red-600 border border-red-200 hover:bg-red-50 dark:border-[#5a2f35] dark:bg-[#131816] dark:hover:bg-red-950/30',
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return (
    <input
      // text-base es a propósito: con menos de 16px, iOS hace zoom al enfocar el campo.
      className={`w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-[#26312d] dark:bg-[#131816] dark:text-[#f4f7f6] dark:focus:border-[#4ee6b0] dark:focus:ring-[#173e32] ${className}`}
      {...props}
    />
  )
}

/** Checkbox con el verde de la app: sin esto queda el azul default del navegador. */
export function Checkbox({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={`h-5 w-5 shrink-0 cursor-pointer accent-emerald-600 dark:accent-[#4ee6b0] ${className}`}
      {...props}
    />
  )
}

/**
 * Clases para una caja seleccionable (elegir miembros, supermercados…).
 * Centralizado porque el estado "elegido" se venía escribiendo a mano y en
 * varios lugares quedaba con fondo claro en modo oscuro (texto ilegible).
 */
export function selectableBox(selected: boolean): string {
  return `min-h-11 ${
    selected
      ? 'border-emerald-300 bg-emerald-50 dark:border-[#2f6b55] dark:bg-[#122620]'
      : 'border-slate-200 dark:border-[#26312d]'
  }`
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`min-h-[46px] w-full min-w-0 truncate rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-[#26312d] dark:bg-[#131816] dark:text-[#f4f7f6] dark:focus:border-[#4ee6b0] dark:focus:ring-[#173e32] ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function Card({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#26312d] dark:bg-[#131816] dark:shadow-none ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">{children}</label>
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-muted">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" />
    </div>
  )
}

/**
 * Título de página (h1). Un solo tamaño para todas las pantallas: antes convivían
 * text-xl/text-2xl semibold/bold según la página.
 */
export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">{children}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
    </div>
  )
}

/** Título de sección dentro de una Card o bloque. Reemplaza 8 variantes ad-hoc. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  if (!action) {
    return <p className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{children}</p>
  }
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{children}</p>
      {action}
    </div>
  )
}

/** Texto de error de formulario/acción. Antes: text-red-600/500 y rose-600/500 mezclados. */
export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="text-sm font-medium text-red-600 dark:text-red-400">{children}</p>
}

/** Estado vacío. Antes había 15 variantes (unas en Card, otras texto suelto). */
export function EmptyState({ children, inCard = true }: { children: ReactNode; inCard?: boolean }) {
  const text = <p className="text-center text-sm text-muted">{children}</p>
  return inCard ? <Card>{text}</Card> : text
}

/**
 * Botón de ícono (borrar/editar). Exige label accesible: antes varios no lo tenían.
 * Blanco táctil de 44px; el margen negativo evita que agrande la fila donde vive.
 */
export function IconButton({
  label,
  tone = 'danger',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  tone?: 'danger' | 'default'
  children?: ReactNode
}) {
  const tones = {
    danger: 'text-muted hover:text-red-500 active:text-red-600 dark:hover:text-red-400',
    default: 'text-muted hover:text-emerald-700 active:text-emerald-700 dark:hover:text-emerald-400',
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:bg-slate-100 dark:active:bg-[#22302a] ${tones[tone]} ${className}`}
      {...props}
    >
      {children ?? <X size={18} strokeWidth={2.2} aria-hidden="true" />}
    </button>
  )
}

/** Acción de texto ("+ Agregar", "Editar", "Cancelar"). Se ve liviana pero mide 44px para el dedo. */
export function TextButton({
  tone = 'accent',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'accent' | 'muted' }) {
  const tones = {
    accent: 'text-emerald-700 dark:text-[#4ee6b0]',
    muted: 'text-muted hover:text-slate-700 dark:hover:text-slate-200',
  }
  return (
    <button
      type="button"
      className={`-mx-2 -my-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold transition active:opacity-60 disabled:opacity-50 ${tones[tone]} ${className}`}
      {...props}
    />
  )
}

/**
 * Bloque plegable. En el celular, lo secundario (gastos fijos, gráficos, API keys)
 * empujaba la lista principal varias pantallas hacia abajo. Lo de adentro recién
 * se monta al abrir, así ECharts no se descarga si nadie lo pide.
 */
export function Disclosure({
  summary,
  defaultOpen = false,
  children,
}: {
  summary: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[#26312d] dark:bg-[#131816] dark:shadow-none">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown
          size={20}
          aria-hidden="true"
          className={`shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

/** Fecha corta para listas ("4 nov"): el mes ya lo da el separador y el ISO no entraba en la fila. */
export function shortDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso
  return new Date(`${iso.slice(0, 10)}T00:00:00`)
    .toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
    .replace('.', '')
}

/** Mientras hay un diálogo abierto, el fondo no se desplaza con el dedo. */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [locked])
}

export function Badge({
  children,
  tone = 'emerald',
}: {
  children: ReactNode
  tone?: 'emerald' | 'amber' | 'slate'
}) {
  const tones = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
  )
}

/**
 * Modal inferior en mobile / centrado en desktop. Base compartida por los
 * diálogos de la app (confirmación, buscador de precios, saldo inicial).
 */
export function Modal({
  title,
  onClose,
  children,
  maxWidth = 'max-w-md',
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  maxWidth?: string
}) {
  useBodyScrollLock(true)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="scrim-in fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 px-0 sm:items-center sm:px-4"
      onClick={(event) => {
        // Tocar afuera cierra: es lo que se espera de una hoja inferior en el celular.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`sheet-in max-h-[85dvh] w-full ${maxWidth} overflow-y-auto overscroll-contain rounded-t-[28px] bg-white shadow-2xl dark:bg-[#0b0e0d] sm:rounded-[28px]`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white py-2 pl-5 pr-3 dark:border-[#26312d] dark:bg-[#0b0e0d]">
          <h3 className="min-w-0 text-lg font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition hover:text-slate-600 active:bg-slate-100 dark:hover:text-slate-200 dark:active:bg-[#22302a]"
            aria-label="Cerrar"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">{children}</div>
      </div>
    </div>
  )
}

export type ConfirmRequest = {
  title: string
  message?: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  /** Solo aviso (un botón "Entendido"), sin acción a confirmar. */
  infoOnly?: boolean
  onConfirm?: () => void | Promise<void>
}

/**
 * Diálogo de confirmación/aviso in-app. Reemplaza window.confirm/alert, que en
 * mobile se ven como diálogo del navegador y rompen la estética de la app.
 * Uso: const confirm = useConfirm(); confirm({ title, onConfirm })
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [busy, setBusy] = useState(false)

  async function accept() {
    if (!request) return
    if (!request.onConfirm) return setRequest(null)
    setBusy(true)
    try {
      await request.onConfirm()
    } finally {
      setBusy(false)
      setRequest(null)
    }
  }

  const dialog = request ? (
    <Modal title={request.title} onClose={() => (busy ? undefined : setRequest(null))}>
      {request.message && <div className="text-sm text-slate-600 dark:text-slate-300">{request.message}</div>}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        {!request.infoOnly && (
          <Button variant="ghost" onClick={() => setRequest(null)} disabled={busy}>
            Cancelar
          </Button>
        )}
        <Button
          variant={request.tone === 'danger' ? 'danger' : 'primary'}
          onClick={request.infoOnly ? () => setRequest(null) : accept}
          disabled={busy}
          className={request.infoOnly ? 'col-span-2' : ''}
        >
          {busy ? 'Procesando…' : request.infoOnly ? 'Entendido' : (request.confirmLabel ?? 'Confirmar')}
        </Button>
      </div>
    </Modal>
  ) : null

  return { confirm: setRequest, dialog }
}

/** Lee/escribe el tema. Compartido por el toggle del Header y el de Configuración. */
export type ThemeMode = 'auto' | 'light' | 'dark'

function storedThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem('theme')
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto'
  } catch {
    return 'auto'
  }
}

export function useDarkMode() {
  const [dark, setDark] = useState(false)
  const [mode, setThemeMode] = useState<ThemeMode>('auto')

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      const nextMode = storedThemeMode()
      const nextDark = nextMode === 'dark' || (nextMode === 'auto' && media.matches)
      setThemeMode(nextMode)
      setDark(nextDark)
      document.documentElement.classList.toggle('dark', nextDark)
    }
    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      if (storedThemeMode() !== 'auto') return
      setDark(event.matches)
      document.documentElement.classList.toggle('dark', event.matches)
    }
    sync()
    media.addEventListener('change', onSystemThemeChange)
    window.addEventListener('covivencia-theme-change', sync)
    return () => {
      media.removeEventListener('change', onSystemThemeChange)
      window.removeEventListener('covivencia-theme-change', sync)
    }
  }, [])

  function setMode(nextMode: ThemeMode) {
    const nextDark = nextMode === 'dark' || (nextMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    setThemeMode(nextMode)
    setDark(nextDark)
    document.documentElement.classList.toggle('dark', nextDark)
    try {
      localStorage.setItem('theme', nextMode)
    } catch {
      // Ignore private mode or browsers without storage.
    }
    window.dispatchEvent(new Event('covivencia-theme-change'))
  }

  function toggle() {
    const next = !dark
    setMode(next ? 'dark' : 'light')
  }

  return { dark, mode, setMode, toggle }
}
