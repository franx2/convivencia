// Supermercados soportados por el buscador de precios (app/api/price-search).
// Lista canónica compartida entre el wizard de onboarding/Configuración (elige
// cuáles usa cada usuario) y la propia búsqueda (filtra por esa preferencia).
export const SUPERMARKETS = ['Vea', 'Changomas', 'Carrefour', 'Jumbo', 'Disco', 'La Anónima'] as const
export type Supermarket = (typeof SUPERMARKETS)[number]

export function isSupermarket(value: string): value is Supermarket {
  return (SUPERMARKETS as readonly string[]).includes(value)
}
