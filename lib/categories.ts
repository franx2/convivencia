// Categorias fijas pensadas para convivientes (parejas / familias).
// `color`: clases Tailwind para chips. `hex`: color sólido para gráficos SVG.
export const EXPENSE_CATEGORIES = [
  { value: 'supermercado', label: 'Supermercado', color: 'bg-emerald-100 text-emerald-700', hex: '#10b981' },
  { value: 'alquiler', label: 'Alquiler', color: 'bg-purple-100 text-purple-700', hex: '#a855f7' },
  { value: 'servicios', label: 'Servicios', color: 'bg-amber-100 text-amber-700', hex: '#f59e0b' },
  { value: 'comida', label: 'Comida / Delivery', color: 'bg-orange-100 text-orange-700', hex: '#f97316' },
  { value: 'transporte', label: 'Transporte', color: 'bg-sky-100 text-sky-700', hex: '#0ea5e9' },
  { value: 'hogar', label: 'Hogar', color: 'bg-pink-100 text-pink-700', hex: '#ec4899' },
  { value: 'salud', label: 'Salud', color: 'bg-red-100 text-red-700', hex: '#ef4444' },
  { value: 'ocio', label: 'Ocio', color: 'bg-indigo-100 text-indigo-700', hex: '#6366f1' },
  { value: 'otros', label: 'Otros', color: 'bg-slate-100 text-slate-600', hex: '#94a3b8' },
] as const

export type CategoryValue = (typeof EXPENSE_CATEGORIES)[number]['value']

export const DEFAULT_CATEGORY: CategoryValue = 'otros'

export function categoryMeta(value: string) {
  return (
    EXPENSE_CATEGORIES.find((c) => c.value === value) ?? {
      value,
      label: value,
      color: 'bg-slate-100 text-slate-600',
      hex: '#94a3b8',
    }
  )
}
