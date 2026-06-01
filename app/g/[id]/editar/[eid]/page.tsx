'use client'

import { useParams } from 'next/navigation'
import { useRequireAuth } from '@/components/AuthProvider'
import { Spinner } from '@/components/ui'
import { ExpenseForm } from '@/components/ExpenseForm'

export default function EditExpensePage() {
  const { user, loading } = useRequireAuth()
  const params = useParams<{ id: string; eid: string }>()
  if (loading || !user) return <Spinner />
  return <ExpenseForm groupId={params.id} expenseId={params.eid} />
}
