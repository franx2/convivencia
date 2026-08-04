import assert from 'node:assert/strict'
import test from 'node:test'
import { computeBalances, settle } from './balances.ts'
import type { Expense, ExpenseShare, Member, Payment } from './types.ts'

// Fábricas mínimas: solo importan los campos que usa el cálculo, el resto son
// valores de relleno para que el objeto tenga la forma del tipo real.
function member(id: string, name = id): Member {
  return { id, group_id: 'g', name, weight: 1, alias: null, created_at: '' }
}

function expense(id: string, amount: number, paidBy: string, rate = 1): Expense {
  return {
    id,
    group_id: 'g',
    title: id,
    amount,
    currency: 'ARS',
    rate_to_base: rate,
    paid_by: paidBy,
    date: '2026-08-01',
    category: 'otros',
    bank: null,
    card: null,
    card_id: null,
    source: 'manual',
    created_by: null,
    created_at: '',
  }
}

function share(expenseId: string, memberId: string, weight = 1): ExpenseShare {
  return { expense_id: expenseId, member_id: memberId, weight }
}

function payment(from: string, to: string, amount: number): Payment {
  return {
    id: `${from}-${to}`,
    group_id: 'g',
    from_member: from,
    to_member: to,
    amount,
    date: '2026-08-01',
    note: null,
    created_by: null,
    created_at: '',
  }
}

const sumNet = (balances: { net: number }[]) => balances.reduce((s, b) => s + b.net, 0)

test('reparto simple entre dos: el que pagó queda a favor por la mitad', () => {
  const members = [member('a'), member('b')]
  const expenses = [expense('e1', 100, 'a')]
  const shares = [share('e1', 'a'), share('e1', 'b')]

  const balances = computeBalances(members, expenses, shares)
  assert.equal(balances.find((b) => b.memberId === 'a')?.net, 50)
  assert.equal(balances.find((b) => b.memberId === 'b')?.net, -50)
})

test('reparto proporcional por peso (2 y 1 => 2/3 y 1/3)', () => {
  const members = [member('a'), member('b')]
  const expenses = [expense('e1', 90, 'a')]
  const shares = [share('e1', 'a', 2), share('e1', 'b', 1)]

  const balances = computeBalances(members, expenses, shares)
  // a puso 90 y le tocaban 60 => +30 ; b no puso nada y le tocaban 30 => -30
  assert.equal(balances.find((b) => b.memberId === 'a')?.net, 30)
  assert.equal(balances.find((b) => b.memberId === 'b')?.net, -30)
})

test('multi-moneda: el gasto se convierte con rate_to_base', () => {
  const members = [member('a'), member('b')]
  // 10 USD a 1000 => 10.000 en moneda base
  const expenses = [expense('e1', 10, 'a', 1000)]
  const shares = [share('e1', 'a'), share('e1', 'b')]

  const balances = computeBalances(members, expenses, shares)
  assert.equal(balances.find((b) => b.memberId === 'a')?.net, 5000)
  assert.equal(balances.find((b) => b.memberId === 'b')?.net, -5000)
})

test('un pago registrado cancela la deuda', () => {
  const members = [member('a'), member('b')]
  const expenses = [expense('e1', 100, 'a')]
  const shares = [share('e1', 'a'), share('e1', 'b')]
  const payments = [payment('b', 'a', 50)]

  const balances = computeBalances(members, expenses, shares, payments)
  assert.equal(balances.find((b) => b.memberId === 'a')?.net, 0)
  assert.equal(balances.find((b) => b.memberId === 'b')?.net, 0)
})

// Regresión del bug F2: un gasto sin participantes (p. ej. tras borrar al único
// que lo compartía) acreditaba al pagador sin cobrarle a nadie, así que los
// balances dejaban de sumar cero y aparecía plata de la nada.
test('un gasto sin participantes se ignora, no acredita al pagador', () => {
  const members = [member('a'), member('b')]
  const expenses = [expense('e1', 100, 'a')]
  const shares: ExpenseShare[] = [] // el share fue borrado en cascada

  const balances = computeBalances(members, expenses, shares)
  assert.equal(balances.find((b) => b.memberId === 'a')?.net, 0)
  assert.equal(sumNet(balances), 0)
})

// La invariante central de toda la app: la plata no se crea ni se destruye.
test('invariante suma-cero en escenarios variados', () => {
  const members = [member('a'), member('b'), member('c')]
  const cases: { expenses: Expense[]; shares: ExpenseShare[]; payments: Payment[] }[] = [
    {
      expenses: [expense('e1', 100, 'a'), expense('e2', 33.33, 'b'), expense('e3', 7, 'c')],
      shares: [
        share('e1', 'a'),
        share('e1', 'b'),
        share('e1', 'c'),
        share('e2', 'a', 3),
        share('e2', 'c', 1),
        share('e3', 'b'),
      ],
      payments: [payment('b', 'a', 12.5)],
    },
    {
      // montos con decimales rebeldes + un gasto huérfano
      expenses: [expense('e1', 0.03, 'a'), expense('e2', 1234.56, 'c'), expense('e3', 999, 'b')],
      shares: [share('e1', 'a'), share('e1', 'b'), share('e2', 'a', 2), share('e2', 'b', 5), share('e2', 'c', 1)],
      payments: [],
    },
  ]

  for (const [i, c] of cases.entries()) {
    const balances = computeBalances(members, c.expenses, c.shares, c.payments)
    assert.ok(
      Math.abs(sumNet(balances)) < 0.02,
      `caso ${i}: los balances deberían sumar ~0 y sumaron ${sumNet(balances)}`
    )
  }
})

test('settle: las transferencias cubren exactamente lo que deben los deudores', () => {
  const members = [member('a'), member('b'), member('c')]
  const expenses = [expense('e1', 300, 'a')]
  const shares = [share('e1', 'a'), share('e1', 'b'), share('e1', 'c')]

  const balances = computeBalances(members, expenses, shares)
  const transfers = settle(balances)
  const totalTransferido = transfers.reduce((s, t) => s + t.amount, 0)
  const totalDeuda = balances.filter((b) => b.net < 0).reduce((s, b) => s - b.net, 0)

  assert.ok(Math.abs(totalTransferido - totalDeuda) < 0.02, 'lo transferido debe igualar lo adeudado')
  // nadie le transfiere a sí mismo
  assert.ok(transfers.every((t) => t.fromId !== t.toId))
})

test('settle: sin deudas no propone transferencias', () => {
  const members = [member('a'), member('b')]
  const expenses = [expense('e1', 100, 'a')]
  const shares = [share('e1', 'a')] // a pagó algo solo para sí mismo

  const balances = computeBalances(members, expenses, shares)
  assert.deepEqual(settle(balances), [])
})
