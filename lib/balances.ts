import type { Expense, ExpenseShare, Member, Payment } from './types'

export type Balance = {
  memberId: string
  name: string
  paid: number // total que puso, en moneda base
  share: number // total que le tocaba, en moneda base
  net: number // paid - share (positivo => le deben; negativo => debe)
}

export type Transfer = {
  fromId: string
  fromName: string
  toId: string
  toName: string
  amount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export type CategoryTotal = {
  category: string
  total: number // en moneda base
  pct: number // 0-100 sobre el total general
}

/** Total gastado por categoria, en moneda base, ordenado de mayor a menor. */
export function spendByCategory(expenses: Expense[]): CategoryTotal[] {
  const totals = new Map<string, number>()
  let grand = 0
  for (const e of expenses) {
    const base = Number(e.amount) * Number(e.rate_to_base)
    const cat = e.category || 'otros'
    totals.set(cat, (totals.get(cat) ?? 0) + base)
    grand += base
  }
  return [...totals.entries()]
    .map(([category, total]) => ({
      category,
      total: round2(total),
      pct: grand > 0 ? round2((total / grand) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

export type MonthTotal = {
  key: string // YYYY-MM
  label: string // p. ej. "mar"
  total: number // en moneda base
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Gasto total por mes (moneda base) de los ultimos `count` meses, terminando
 * en el mes actual. Devuelve la serie completa (meses sin gasto = 0) para que
 * el grafico de barras tenga continuidad temporal.
 */
export function spendByMonth(expenses: Expense[], count = 6): MonthTotal[] {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    const key = String(e.date).slice(0, 7) // YYYY-MM
    const base = Number(e.amount) * Number(e.rate_to_base)
    totals.set(key, (totals.get(key) ?? 0) + base)
  }
  const now = new Date()
  const out: MonthTotal[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({ key, label: MONTHS_ES[d.getMonth()], total: round2(totals.get(key) ?? 0) })
  }
  return out
}

/**
 * Calcula el balance neto de cada miembro en la moneda base del grupo.
 * Cada gasto se reparte en partes iguales entre los miembros incluidos en sus shares.
 */
export function computeBalances(
  members: Member[],
  expenses: Expense[],
  shares: ExpenseShare[],
  payments: Payment[] = []
): Balance[] {
  const paid = new Map<string, number>()
  const owed = new Map<string, number>()
  for (const m of members) {
    paid.set(m.id, 0)
    owed.set(m.id, 0)
  }

  const sharesByExpense = new Map<string, string[]>()
  for (const s of shares) {
    const arr = sharesByExpense.get(s.expense_id) ?? []
    arr.push(s.member_id)
    sharesByExpense.set(s.expense_id, arr)
  }

  for (const e of expenses) {
    const base = Number(e.amount) * Number(e.rate_to_base)
    // quien pago suma lo que puso
    paid.set(e.paid_by, (paid.get(e.paid_by) ?? 0) + base)
    // reparto en partes iguales entre los participantes
    const participants = sharesByExpense.get(e.id) ?? []
    if (participants.length === 0) continue
    const perHead = base / participants.length
    for (const mid of participants) {
      owed.set(mid, (owed.get(mid) ?? 0) + perHead)
    }
  }

  // Pagos ya registrados: quien pagó reduce su deuda (cuenta como "puso"),
  // quien cobró reduce lo que le deben (cuenta como "le tocaba").
  for (const p of payments) {
    const amt = Number(p.amount)
    paid.set(p.from_member, (paid.get(p.from_member) ?? 0) + amt)
    owed.set(p.to_member, (owed.get(p.to_member) ?? 0) + amt)
  }

  return members.map((m) => {
    const p = round2(paid.get(m.id) ?? 0)
    const s = round2(owed.get(m.id) ?? 0)
    return { memberId: m.id, name: m.name, paid: p, share: s, net: round2(p - s) }
  })
}

/**
 * Sugerencia de transferencias minimas para saldar (greedy):
 * los que deben le pagan a los que pusieron de mas.
 */
export function settle(balances: Balance[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.net < -0.005)
    .map((b) => ({ id: b.memberId, name: b.name, amt: -b.net }))
    .sort((a, b) => b.amt - a.amt)
  const creditors = balances
    .filter((b) => b.net > 0.005)
    .map((b) => ({ id: b.memberId, name: b.name, amt: b.net }))
    .sort((a, b) => b.amt - a.amt)

  const transfers: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]
    const c = creditors[j]
    const pay = round2(Math.min(d.amt, c.amt))
    if (pay > 0) {
      transfers.push({
        fromId: d.id,
        fromName: d.name,
        toId: c.id,
        toName: c.name,
        amount: pay,
      })
    }
    d.amt = round2(d.amt - pay)
    c.amt = round2(c.amt - pay)
    if (d.amt <= 0.005) i++
    if (c.amt <= 0.005) j++
  }
  return transfers
}
