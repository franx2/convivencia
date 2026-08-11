// Categorías de supermercado (por pasillo/tipo de producto) para la lista de
// compras. Distintas de las categorías de gastos (lib/categories.ts): acá
// clasificamos QUÉ es el producto, no por qué se gastó la plata.
export type GroceryCategory = { value: string; label: string; emoji: string }

export const GROCERY_CATEGORIES: GroceryCategory[] = [
  { value: 'carnes', label: 'Carnes', emoji: '🥩' },
  { value: 'lacteos', label: 'Lácteos', emoji: '🥛' },
  { value: 'frutas_verduras', label: 'Frutas y Verduras', emoji: '🥦' },
  { value: 'panaderia', label: 'Panadería', emoji: '🍞' },
  { value: 'almacen', label: 'Almacén', emoji: '🛒' },
  { value: 'bebidas', label: 'Bebidas', emoji: '🥤' },
  { value: 'congelados', label: 'Congelados', emoji: '🧊' },
  { value: 'limpieza', label: 'Limpieza', emoji: '🧽' },
  { value: 'higiene', label: 'Higiene y Perfumería', emoji: '🧴' },
  { value: 'otros', label: 'Otros', emoji: '🧺' },
]

export const DEFAULT_GROCERY_CATEGORY = 'otros'

// Palabras clave (best-effort, igual criterio que suggestCategory de gastos):
// si el texto del producto contiene alguna, se sugiere esa categoría.
const KEYWORDS: Record<string, string[]> = {
  carnes: [
    'carne', 'pollo', 'milanesa', 'pescado', 'cerdo', 'chorizo', 'hamburguesa', 'salchicha',
    'jamon', 'fiambre', 'asado', 'pechuga', 'bife', 'costilla', 'matambre', 'vacio', 'merluza',
    'salmon', 'chinchulin', 'morcilla',
  ],
  lacteos: ['leche', 'queso', 'yogur', 'yogurt', 'manteca', 'crema de leche', 'dulce de leche', 'ricota'],
  frutas_verduras: [
    'manzana', 'banana', 'platano', 'tomate', 'lechuga', 'papa', 'cebolla', 'zanahoria',
    'naranja', 'limon', 'palta', 'zapallo', 'frutilla', 'uva', 'pera', 'choclo', 'morron',
    'ajo', 'espinaca', 'acelga', 'apio', 'pepino', 'brocoli', 'durazno', 'mandarina', 'kiwi',
  ],
  panaderia: ['pancito', 'facturas', 'factura', 'medialuna', 'tostada', 'bizcocho', 'budin', 'pan lactal', ' pan '],
  almacen: [
    'arroz', 'fideos', 'aceite', 'azucar', 'harina', 'sal fina', 'yerba', 'cafe', 'enlatado',
    'salsa', 'atun', 'galletitas', 'mermelada', 'miel', 'mayonesa', 'ketchup', 'mostaza',
    'lentejas', 'garbanzo', 'polenta', 'huevo',
  ],
  bebidas: ['agua', 'gaseosa', 'cerveza', 'vino', 'jugo', 'soda', 'fernet', 'energizante', 'sidra', 'coca'],
  congelados: ['helado', 'congelad'],
  limpieza: ['lavandina', 'detergente', 'esponja', 'desinfectante', 'limpiador', 'suavizante', 'trapo', 'lavavajilla'],
  higiene: [
    'shampoo', 'champu', 'jabon', 'papel higienico', 'pasta dental', 'dentifrico', 'desodorante',
    'toallita', 'protector', 'afeitar', 'crema dental',
  ],
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/**
 * Sugiere una categoría para un producto de la lista. Primero mira el
 * historial de items ya comprados (checked=true) del propio grupo: si un
 * producto igual o parecido ya se categorizó antes y se le dio el "ok"
 * (se marcó como comprado), usa esa categoría — aprende de las elecciones
 * confirmadas en vez de repetir siempre la misma palabra clave fija.
 * Sin historial que matchee, cae a las palabras clave (mismo criterio que
 * suggestCategory de gastos, lib/categories.ts).
 */
export function suggestGroceryCategory(
  text: string,
  history: { text: string; category: string }[] = []
): string {
  const t = stripAccents(text.trim().toLowerCase())
  if (t) {
    const matches = history.filter((h) => {
      const ht = stripAccents((h.text ?? '').trim().toLowerCase())
      if (!ht) return false
      if (ht === t) return true
      return t.length >= 3 && (ht.includes(t) || t.includes(ht))
    })
    if (matches.length) {
      const count = new Map<string, number>()
      for (const m of matches) count.set(m.category, (count.get(m.category) ?? 0) + 1)
      return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
    }
  }

  const normalized = ` ${t} `
  for (const [category, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => normalized.includes(stripAccents(w)))) return category
  }
  return DEFAULT_GROCERY_CATEGORY
}

export function groceryCategoryMeta(value: string): GroceryCategory {
  return GROCERY_CATEGORIES.find((c) => c.value === value) ?? GROCERY_CATEGORIES[GROCERY_CATEGORIES.length - 1]
}
