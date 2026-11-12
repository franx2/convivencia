import assert from 'node:assert/strict'
import test from 'node:test'
import { extractTotals, parseTransactions } from './import-statement.ts'

// Formato Supervielle VISA (datos inventados): dos columnas pesos/dólares,
// fecha DD-MM-YY, y en las cuotas el comercio va en la línea de arriba.
const SUPERVIELLE = [
  'NRO DE CUENTA : 1111111111 VISA : SIGNATURE',
  'FECHA DETALLE DE TRANSACCION IMPORTE EN PESOS IMPORTE EN DOLARES',
  'SALDO ANTERIOR 100.000,00 0,00',
  '05-10-26 SU PAGO EN PESOS -100.000,00 0,00',
  'Movimientos',
  'FECHA COMPROBANTE DETALLE DE TRANSACCION IMPORTE EN PESOS IMPORTE EN DOLARES',
  'AEROLINEAS ARGENTINAS S.A',
  '27-09-26 002670 127.534,16',
  'C.01/06',
  '18-10-26 420544 VEA SM 180 112.895,50',
  '20-10-26 354108 MERPAGO*FARINA 13.500,00 0,00',
  'TARJETA 1234 Total Consumos de FULANO 253.929,66 0,00',
  '22-10-26 INTERESES FINANCIACION $ 2.596,60 0,00',
  'SALDO ACTUAL 256.526,26 0,00',
  'Si optó por rescindir un Paquete de Productos de Banco Supervielle S.A.',
]

test('Supervielle: consumos, cuotas con comercio arriba y columna en dólares', () => {
  const tx = parseTransactions(SUPERVIELLE, 2026)
  assert.deepEqual(
    tx.map((t) => [t.date, t.title, t.amount, t.currency]),
    [
      ['2026-09-27', 'AEROLINEAS ARGENTINAS S.A', 127534.16, 'ARS'],
      ['2026-10-18', 'VEA SM 180', 112895.5, 'ARS'],
      ['2026-10-20', 'MERPAGO*FARINA', 13500, 'ARS'],
    ],
  )
  assert.equal(tx[0].category, 'viajes')
  assert.equal(tx[1].category, 'supermercado')
  assert.equal(tx[0].bank, 'Supervielle')
  assert.equal(tx[0].card, 'VISA 1234')
  const sum = tx.reduce((a, t) => a + t.amount, 0)
  assert.equal(Math.round(sum * 100), Math.round((extractTotals(SUPERVIELLE).ars ?? 0) * 100))
})
