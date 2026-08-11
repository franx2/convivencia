import assert from 'node:assert/strict'
import test from 'node:test'
import { suggestGroceryCategory } from './grocery-categories.ts'

test('sin historial, cae a la palabra clave', () => {
  assert.equal(suggestGroceryCategory('leche descremada'), 'lacteos')
})

test('sin historial ni palabra clave, cae a otros', () => {
  assert.equal(suggestGroceryCategory('cosa rara sin pista'), 'otros')
})

test('el historial confirmado (comprado) pisa a la palabra clave', () => {
  // "coca" matchea la palabra clave de bebidas, pero el grupo ya la venía
  // comprando y categorizando como almacén: gana lo confirmado.
  const history = [
    { text: 'coca cola', category: 'almacen' },
    { text: 'coca cola', category: 'almacen' },
  ]
  assert.equal(suggestGroceryCategory('coca', history), 'almacen')
})

test('el historial usa la categoría más repetida ante empate parcial', () => {
  const history = [
    { text: 'yerba', category: 'almacen' },
    { text: 'yerba', category: 'almacen' },
    { text: 'yerba', category: 'otros' },
  ]
  assert.equal(suggestGroceryCategory('yerba', history), 'almacen')
})

test('match parcial (substring) con al menos 3 letras', () => {
  const history = [{ text: 'yerba mate', category: 'almacen' }]
  assert.equal(suggestGroceryCategory('yerba', history), 'almacen')
})
