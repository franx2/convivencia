export type Group = {
  id: string
  name: string
  base_currency: string
  owner_id: string
  invite_token: string
  is_personal: boolean
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

export type Category = {
  id: string
  group_id: string
  value: string
  label: string
  color: string
  hex: string
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
