import assert from 'node:assert/strict'
import test from 'node:test'
import { isServiceDue, toISODate } from './dates.ts'

// Regresión: `toISOString().slice(0,10)` devolvía la fecha en UTC, así que en
// Argentina (UTC-3) todo lo cargado después de las 21:00 quedaba con la fecha
// del día siguiente. Al construir el Date con componentes locales, estos casos
// dan la fecha correcta sin importar la zona horaria de quien corra el test.
test('usa la fecha local, no la UTC', () => {
  // 7 de agosto a las 22:00 hora local: antes daba 2026-08-08.
  assert.equal(toISODate(new Date(2026, 7, 7, 22, 0, 0)), '2026-08-07')
  // Último día del mes de noche: el caso que mandaba el gasto al mes siguiente.
  assert.equal(toISODate(new Date(2026, 7, 31, 23, 59, 0)), '2026-08-31')
})

test('rellena mes y día con cero a la izquierda', () => {
  assert.equal(toISODate(new Date(2026, 0, 5, 12, 0, 0)), '2026-01-05')
  assert.equal(toISODate(new Date(2026, 11, 25, 0, 0, 0)), '2026-12-25')
})

test('la medianoche local pertenece a ese mismo día', () => {
  assert.equal(toISODate(new Date(2026, 2, 1, 0, 0, 0)), '2026-03-01')
})

// Gastos fijos de monto variable (luz, gas): recordar solo cuando llegó el
// día y todavía no se cargó el gasto real de este mes.
test('isServiceDue: no llegó el día todavía', () => {
  assert.equal(isServiceDue(15, null, new Date(2026, 7, 10)), false)
})

test('isServiceDue: llegó el día y nunca se cargó', () => {
  assert.equal(isServiceDue(15, null, new Date(2026, 7, 15)), true)
})

test('isServiceDue: llegó el día pero ya se cargó este mes', () => {
  assert.equal(isServiceDue(15, '2026-08-01', new Date(2026, 7, 20)), false)
})

test('isServiceDue: llegó el día, lo último cargado fue el mes pasado', () => {
  assert.equal(isServiceDue(15, '2026-07-01', new Date(2026, 7, 20)), true)
})
