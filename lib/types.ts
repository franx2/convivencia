export type Group = {
  id: string
  name: string
  base_currency: string
  owner_id: string
  invite_token: string
  is_personal: boolean
  // Tipo de grupo compartido: 'viaje' no separa gastos/balances por mes. Fijo al crear.
  kind: 'convivencia' | 'viaje'
  // Saldo inicial / ajuste del balance acumulado (espacio personal).
  baseline_amount?: number
  baseline_date?: string | null
  created_at: string
}

export type Member = {
  id: string
  group_id: string
  name: string
  weight: number // peso por defecto para el reparto (1 = parte normal)
  alias: string | null // alias/CBU para cobrar (opcional)
  created_at: string
}

export type GroupUser = {
  group_id: string
  user_id: string
  member_id: string | null // miembro que representa a este usuario dentro del grupo
  created_at: string
}

export type Expense = {
  id: string
  group_id: string
  title: string
  amount: number
  currency: string
  rate_to_base: number
  paid_by: string
  date: string
  category: string
  bank: string | null
  card: string | null
  card_id: string | null
  source: 'manual' | 'card_import'
  created_by: string | null
  created_at: string
}

export type ExpenseShare = {
  expense_id: string
  member_id: string
  weight: number // peso del participante en este gasto (1 = parte igual)
}

export type Template = {
  id: string
  group_id: string
  label: string
  category: string
  amount: number | null
  created_at: string
}

export type Budget = {
  id: string
  group_id: string
  category: string
  amount: number
  created_at: string
}

export type Income = {
  id: string
  group_id: string
  member_id: string
  amount: number // en moneda base
  date: string
  note: string | null
  created_by: string | null
  created_at: string
}

export type Saving = {
  id: string
  group_id: string
  member_id: string
  amount: number
  date: string
  note: string | null
  created_by: string | null
  created_at: string
}

export type CreditCard = {
  id: string
  group_id: string
  name: string
  bank: string | null
  last4: string | null
  closing_day: number | null
  due_day: number | null
  created_at: string
}

export type BankDiscount = {
  id: string
  user_id: string
  source_key: string
  external_key: string
  bank: string
  title: string
  merchant: string | null
  category: string | null
  discount_percent: number | null
  installments: number | null
  cap_amount: number | null
  min_amount: number | null
  valid_from: string | null
  valid_to: string | null
  weekdays: string[]
  payment_method: string | null
  card_brand: string | null
  card_tier: string | null
  province: string | null
  terms_text: string
  source_url: string
  last_seen_at: string
  created_at: string
}

export type Category = {
  id: string
  group_id: string
  value: string
  label: string
  color: string
  hex: string
  created_at: string
}

export type ShoppingItem = {
  id: string
  group_id: string
  text: string
  category: string // categoría de supermercado (lib/grocery-categories.ts), no la de gastos
  checked: boolean
  created_by: string | null
  created_at: string
}

export type Payment = {
  id: string
  group_id: string
  from_member: string
  to_member: string
  amount: number
  date: string
  note: string | null
  created_by: string | null
  created_at: string
}
