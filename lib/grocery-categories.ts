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

/** Sugiere una categoría por palabra clave en el texto del producto. Best-effort, editable. */
export function suggestGroceryCategory(text: string): string {
  const normalized = ` ${stripAccents(text.toLowerCase())} `
  for (const [category, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => normalized.includes(stripAccents(w)))) return category
  }
  return DEFAULT_GROCERY_CATEGORY
}

export function groceryCategoryMeta(value: string): GroceryCategory {
  return GROCERY_CATEGORIES.find((c) => c.value === value) ?? GROCERY_CATEGORIES[GROCERY_CATEGORIES.length - 1]
}
