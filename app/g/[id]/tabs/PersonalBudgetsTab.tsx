'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, IconButton, Input, Select } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { type CatMeta } from '@/lib/categories'
import { type Budget, type Expense, type Group } from '@/lib/types'
import { HistoryList } from './shared'

export function PersonalBudgetsTab({
  group,
  expenses,
  budgets,
  cats,
  catMeta,
  onChanged,
}: {
  group: Group
  expenses: Expense[]
  budgets: Budget[]
  cats: CatMeta[]
  catMeta: (v: string) => CatMeta
  onChanged: () => void
}) {
  const [category, setCategory] = useState('supermercado')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const month = new Date().toISOString().slice(0, 7)
  const spentByCat = new Map<string, number>()
  for (const e of expenses) {
    if (String(e.date).slice(0, 7) !== month) continue
    const cat = e.category || 'otros'
    spentByCat.set(cat, (spentByCat.get(cat) ?? 0) + Number(e.amount) * Number(e.rate_to_base))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!(amt > 0)) return
    setBusy(true)
    await supabase
      .from('budgets')
      .upsert({ group_id: group.id, category, amount: amt }, { onConflict: 'group_id,category' })
    setAmount('')
    setBusy(false)
    onChanged()
  }

  async function remove(id: string) {
    await supabase.from('budgets').delete().eq('id', id)
    onChanged()
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-lg font-semibold text-emerald-800 dark:text-emerald-300">Agregar presupuesto</h2>
        <form onSubmit={save} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => (
              <option key={c.value} value={c.value}>
                {c.symbol} {c.label}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Límite"
          />
          <Button type="submit" disabled={busy || !(Number(amount) > 0)}>
            Guardar
          </Button>
        </form>
      </Card>

      <HistoryList title="Presupuestos">
        {budgets.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay presupuestos cargados.</p>
        ) : (
          <div className="space-y-3">
            {budgets.map((b) => {
              const spent = spentByCat.get(b.category) ?? 0
              const limit = Number(b.amount)
              const ratio = limit > 0 ? spent / limit : 0
              const pct = Math.min(100, Math.round(ratio * 100))
              const bar = ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'
              return (
                <div key={b.id}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catMeta(b.category).color}`}>
                      {catMeta(b.category).symbol} {catMeta(b.category).label}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-500">
                        {formatMoney(spent, group.base_currency)} / {formatMoney(limit, group.base_currency)}
                      </span>
                      <IconButton label="Quitar" onClick={() => remove(b.id)}>
                    ✕
                  </IconButton>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </HistoryList>
    </div>
  )
}

