'use client'

import { useEffect, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    ghost:
      'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700',
    danger:
      'bg-white text-red-600 border border-red-200 hover:bg-red-50 dark:bg-slate-800 dark:border-red-900/50',
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-900/40 ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-900/40 ${className}`}
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
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
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
    <div className="flex items-center justify-center py-16 text-slate-400">
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
      {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
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
  const text = <p className="text-center text-sm text-slate-500 dark:text-slate-400">{children}</p>
  return inCard ? <Card>{text}</Card> : text
}

/** Botón de ícono (borrar/editar). Exige label accesible: antes varios no lo tenían. */
export function IconButton({
  label,
  tone = 'danger',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  tone?: 'danger' | 'default'
  children: ReactNode
}) {
  const tones = {
    danger: 'text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400',
    default: 'text-slate-300 hover:text-emerald-600 dark:text-slate-600 dark:hover:text-emerald-400',
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`shrink-0 transition ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
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
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 px-0 sm:items-center sm:px-4">
      <div
        className={`max-h-[85vh] w-full ${maxWidth} overflow-y-auto rounded-t-[28px] bg-white shadow-2xl dark:bg-slate-950 sm:rounded-[28px]`}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Cerrar"
          >
            ×
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
      <div className="mt-5 flex justify-end gap-2">
        {!request.infoOnly && (
          <Button variant="ghost" onClick={() => setRequest(null)} disabled={busy}>
            Cancelar
          </Button>
        )}
        <Button
          variant={request.tone === 'danger' ? 'danger' : 'primary'}
          onClick={request.infoOnly ? () => setRequest(null) : accept}
          disabled={busy}
        >
          {busy ? 'Procesando…' : request.infoOnly ? 'Entendido' : (request.confirmLabel ?? 'Confirmar')}
        </Button>
      </div>
    </Modal>
  ) : null

  return { confirm: setRequest, dialog }
}

/** Lee/escribe el tema. Compartido por el toggle del Header y el de Configuración. */
export function useDarkMode() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee el tema que fijó el script anti-flash antes de hidratar
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

  return { dark, toggle }
}
