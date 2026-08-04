// Pestañas del grupo. Viven fuera de page.tsx porque algunos tabs necesitan el
// tipo para pedir navegación al padre (ej: el dashboard personal).
export type SharedTab = 'gastos' | 'lista' | 'balances' | 'liquidacion' | 'miembros'
export type PersonalTab = 'inicio' | 'ingresos' | 'gastos' | 'ahorros' | 'presupuestos' | 'tarjetas' | 'resumen'
export type Tab = SharedTab | PersonalTab

export function isPersonalTab(value: Tab): value is PersonalTab {
  return ['inicio', 'ingresos', 'gastos', 'ahorros', 'presupuestos', 'tarjetas', 'resumen'].includes(value)
}

export function isSharedTab(value: Tab): value is SharedTab {
  return ['gastos', 'lista', 'balances', 'liquidacion', 'miembros'].includes(value)
}
