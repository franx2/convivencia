'use client'

import { type ReactNode } from 'react'
import { Card } from '@/components/ui'

export function monthLabelEs(key: string): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}


export function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </Card>
  )
}

export function HistoryList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</h3>
      {children}
    </Card>
  )
}

