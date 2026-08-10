/**
 * Fechas en formato YYYY-MM-DD usando la hora LOCAL del dispositivo.
 *
 * Antes se usaba `new Date().toISOString().slice(0, 10)`, que devuelve la fecha
 * en UTC: en Argentina (UTC-3) a partir de las 21:00 ya devolvía el día
 * siguiente. Un gasto cargado a las 22:00 del 31 de agosto quedaba con fecha
 * 1 de septiembre y se contaba en el mes equivocado (balances, presupuestos,
 * totales del mes).
 */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Hoy, en la fecha local de quien usa la app. */
export function todayISO(): string {
  return toISODate(new Date())
}

/** Mes actual (YYYY-MM) en fecha local. */
export function currentMonth(): string {
  return todayISO().slice(0, 7)
}

/**
 * Gasto fijo de monto variable (luz, gas): ¿ya llegó el día elegido y todavía
 * no se cargó el gasto real de este mes? `lastMonth` es la fecha (cualquier
 * día) del último mes ya cargado, o null si nunca se cargó.
 */
export function isServiceDue(dayOfMonth: number, lastMonth: string | null, now: Date = new Date()): boolean {
  if (now.getDate() < dayOfMonth) return false
  return (lastMonth ?? '').slice(0, 7) !== toISODate(now).slice(0, 7)
}
