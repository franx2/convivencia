export type Group = {
  id: string
  name: string
  base_currency: string
  owner_id: string
  invite_token: string
  created_at: string
}

export type Member = {
  id: string
  group_id: string
  name: string
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
  created_by: string | null
  created_at: string
}

export type ExpenseShare = {
  expense_id: string
  member_id: string
}
