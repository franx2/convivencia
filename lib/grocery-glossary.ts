// Glosario de apodos/diminutivos comunes en la lista de compras (AR) -> nombre
// de producto real, para que la búsqueda de precios encuentre mejores
// resultados. Ej: "vinito" -> "vino". Se corrige palabra por palabra (match
// exacto, sin acentos) antes de buscar; el resto del texto queda intacto.
const GROCERY_GLOSSARY: Record<string, string> = {
  vinito: 'vino',
  vinitos: 'vinos',
  vinacho: 'vino',
  birra: 'cerveza',
  birras: 'cervezas',
  cervecita: 'cerveza',
  cervecitas: 'cervezas',
  fernecito: 'fernet',
  cafecito: 'café',
  cafecitos: 'cafés',
  tecito: 'té',
  quesito: 'queso',
  quesitos: 'quesos',
  jamoncito: 'jamón',
  pancito: 'pan',
  pancitos: 'pan',
  panecito: 'pan',
  salchichita: 'salchicha',
  salchichitas: 'salchichas',
  gaseosita: 'gaseosa',
  gaseositas: 'gaseosas',
  chocolatito: 'chocolate',
  papitas: 'papas fritas',
  fideitos: 'fideos',
  huevitos: 'huevos',
  manzanitas: 'manzanas',
  naranjitas: 'naranjas',
  tomatitos: 'tomates',
  cebollitas: 'cebollas',
  carnecita: 'carne',
  pollito: 'pollo',
  yogurcito: 'yogur',
  aceitito: 'aceite',
  yerbita: 'yerba',
  coca: 'coca cola',
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** Corrige apodos/diminutivos conocidos palabra por palabra. Preserva el resto del texto tal cual. */
export function correctGroceryTerm(term: string): string {
  return term
    .split(/(\s+)/)
    .map((word) => {
      const key = stripAccents(word.toLowerCase())
      return GROCERY_GLOSSARY[key] ?? word
    })
    .join('')
}
