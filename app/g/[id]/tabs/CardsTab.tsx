'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, ErrorText, IconButton, Input, Select, useConfirm } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { BANK_DISCOUNT_SOURCES, sourceIdsForBanks } from '@/lib/bank-discounts'
import { type BankDiscount, type CreditCard, type Expense, type Group } from '@/lib/types'
import { HistoryList } from './shared'
import { currentMonth, toISODate, todayISO } from '@/lib/dates'

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

export function dateFromDay(year: number, monthIndex0: number, day: number): Date {
  return new Date(year, monthIndex0, Math.min(day, daysInMonth(year, monthIndex0)))
}

/**
 * Ciclo de facturación real (cierre -> vencimiento), no el mes calendario:
 * un gasto de julio puede vencer en agosto. Devuelve null si la tarjeta no
 * tiene cierre cargado (fallback: mes calendario, manejado por el caller).
 */
export function computeLastStatement(
  card: CreditCard,
  expenses: Expense[]
): { total: number; from: string; to: string; due: string | null } | null {
  if (!card.closing_day) return null
  const today = new Date()
  let closing = dateFromDay(today.getFullYear(), today.getMonth(), card.closing_day)
  if (closing > today) {
    closing = dateFromDay(today.getFullYear(), today.getMonth() - 1, card.closing_day)
  }
  const prevClosing = dateFromDay(closing.getFullYear(), closing.getMonth() - 1, card.closing_day)
  const from = new Date(prevClosing)
  from.setDate(from.getDate() + 1)

  const toStr = toISODate(closing)
  const fromStr = toISODate(from)

  let dueStr: string | null = null
  if (card.due_day) {
    // El vencimiento suele caer el mes siguiente al cierre (ej: cierra 23, vence 5);
    // si el día de vto. es mayor al de cierre, asumimos que vence el mismo mes.
    const dueMonthOffset = card.due_day <= card.closing_day ? 1 : 0
    const due = dateFromDay(closing.getFullYear(), closing.getMonth() + dueMonthOffset, card.due_day)
    dueStr = toISODate(due)
  }

  const total = expenses
    .filter((e) => e.card_id === card.id && e.date >= fromStr && e.date <= toStr)
    .reduce((sum, e) => sum + Number(e.amount) * Number(e.rate_to_base), 0)

  return { total, from: fromStr, to: toStr, due: dueStr }
}

export function CardsTab({
  group,
  cards,
  discounts,
  expenses,
  userId,
  onChanged,
}: {
  group: Group
  cards: CreditCard[]
  discounts: BankDiscount[]
  expenses: Expense[]
  userId: string
  onChanged: () => void
}) {
  const { confirm, dialog } = useConfirm()
  const [name, setName] = useState('')
  const [bank, setBank] = useState('')
  const [last4, setLast4] = useState('')
  const [closingDay, setClosingDay] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncInfo, setSyncInfo] = useState<string | null>(null)
  const [selectedSourceIds, setSelectedSourceIds] = useState(() => BANK_DISCOUNT_SOURCES.map((source) => source.id))
  const [discountRubricFilter, setDiscountRubricFilter] = useState<DiscountRubricId | 'all'>('all')
  const month = currentMonth()
  const sourceIds = useMemo(
    () => sourceIdsForBanks(cards.flatMap((card) => [card.bank, card.name])),
    [cards]
  )
  const sourceLabels = BANK_DISCOUNT_SOURCES.filter((source) => sourceIds.includes(source.id)).map((source) => source.bank)
  const groupedDiscounts = useMemo(
    () =>
      DISCOUNT_RUBRICS.map((rubric) => ({
        ...rubric,
        discounts: discounts.filter(
          (discount) =>
            isCurrentDiscount(discount) &&
            selectedSourceIds.includes(discount.source_key) &&
            (discountRubricFilter === 'all' || discountRubric(discount) === discountRubricFilter) &&
            discountRubric(discount) === rubric.id
        ),
      })).filter((rubric) => rubric.discounts.length > 0),
    [discounts, discountRubricFilter, selectedSourceIds]
  )
  const visibleDiscountCount = groupedDiscounts.reduce((count, rubric) => count + rubric.discounts.length, 0)

  function toggleSource(sourceId: string) {
    setSelectedSourceIds((current) =>
      current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId]
    )
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    await supabase.from('cards').insert({
      group_id: group.id,
      name: name.trim(),
      bank: bank.trim() || null,
      last4: last4.trim() || null,
      closing_day: Number(closingDay) || null,
      due_day: Number(dueDay) || null,
    })
    setName('')
    setBank('')
    setLast4('')
    setClosingDay('')
    setDueDay('')
    setBusy(false)
    setAdding(false)
    onChanged()
  }

  function remove(id: string) {
    confirm({
      title: '¿Borrar esta tarjeta?',
      message: 'Los gastos importados con ella quedan guardados.',
      confirmLabel: 'Borrar tarjeta',
      tone: 'danger',
      onConfirm: async () => {
        await supabase.from('cards').delete().eq('id', id)
        onChanged()
      },
    })
  }

  async function syncDiscounts() {
    if (selectedSourceIds.length === 0) {
      setSyncError('Elegí al menos un banco para actualizar sus descuentos.')
      return
    }
    setSyncBusy(true)
    setSyncError(null)
    setSyncInfo(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const response = await fetch('/api/bank-discounts', {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: JSON.stringify({ sources: selectedSourceIds }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        discounts?: BankDiscount[]
        sources?: { bank: string; count: number; ok: boolean; error?: string }[]
      }
      if (!response.ok) throw new Error(data.error || 'No se pudieron actualizar los descuentos.')

      const rows = (data.discounts ?? [])
        .filter(isStorableBankDiscount)
        .map((discount) => {
          const row = { ...discount, user_id: userId } as Record<string, unknown>
          delete row.id
          delete row.created_at
          return row
        })
      if (rows.length > 0) {
        const { error } = await supabase
          .from('bank_discounts')
          .upsert(rows, { onConflict: 'user_id,source_key,external_key' })
        if (error) throw new Error(`${error.message}. Ejecutá supabase/migration_bank_discounts.sql.`)
      }

      const sourceSummary = (data.sources ?? [])
        .map((source) => `${source.bank}: ${source.ok ? source.count : source.error ?? 'error'}`)
        .join(' · ')
      setSyncInfo(
        rows.length > 0
          ? `Actualizado ahora · ${sourceSummary}`
          : `No encontré promos en HTML público · ${sourceSummary}`
      )
      onChanged()
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'No se pudieron actualizar los descuentos.')
    } finally {
      setSyncBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {false && (
        <>
      <Card className="border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-emerald-900 dark:text-emerald-200">Descuentos bancarios</h2>
            <p className="mt-1 text-xs text-emerald-800/75 dark:text-emerald-300/75">
              {sourceLabels.length > 0
                ? `Detectamos ${sourceLabels.join(', ')} en tus tarjetas.`
                : 'Elegí los bancos cuyas promociones querés consultar.'}
            </p>
          </div>
          <Button type="button" onClick={syncDiscounts} disabled={syncBusy}>
            {syncBusy ? 'Consultando…' : 'Actualizar seleccionados'}
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Bancos para consultar">
          {BANK_DISCOUNT_SOURCES.map((source) => {
            const selected = selectedSourceIds.includes(source.id)
            return (
              <label
                key={source.id}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  selected
                    ? 'border-emerald-500 bg-emerald-600 text-white'
                    : 'border-emerald-200 bg-white text-emerald-800 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSource(source.id)}
                  className="h-3.5 w-3.5 accent-emerald-700"
                />
                {source.bank}
              </label>
            )
          })}
        </div>
        {syncInfo && <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-300">{syncInfo}</p>}
        {syncError && (
          <div className="mt-3">
            <ErrorText>{syncError}</ErrorText>
          </div>
        )}
      </Card>

      {discounts.length > 0 && (
        <HistoryList title="Promos encontradas">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">{visibleDiscountCount} promociones vigentes</p>
              <Select
                value={discountRubricFilter}
                onChange={(event) => setDiscountRubricFilter(event.target.value as DiscountRubricId | 'all')}
                className="w-auto min-w-40"
                aria-label="Filtrar promociones por rubro"
              >
                <option value="all">Todos los rubros</option>
                {DISCOUNT_RUBRICS.filter((rubric) => rubric.id !== 'other').map((rubric) => (
                  <option key={rubric.id} value={rubric.id}>
                    {rubric.label}
                  </option>
                ))}
              </Select>
            </div>
            {groupedDiscounts.length === 0 ? (
              <p className="text-sm text-slate-500">No hay promociones vigentes para esta selección.</p>
            ) : (
              groupedDiscounts.map((rubric) => (
                <section key={rubric.id} className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{rubric.label}</h3>
                  {rubric.discounts.slice(0, 12).map((discount) => {
                    const matchingCards = cards.filter((card) => sameBank(card.bank, discount.bank))
                    return (
                      <div key={discount.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{discount.title}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {discount.bank}
                              {discount.merchant ? ` · ${discount.merchant}` : ''}
                              {discount.category ? ` · ${discount.category}` : ''}
                            </p>
                          </div>
                          {discount.discount_percent != null && (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              {discount.discount_percent}%
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          {discount.installments != null && <span>💳 {discount.installments} cuotas</span>}
                          {discount.weekdays.length > 0 && <span>📅 {discount.weekdays.join(', ')}</span>}
                          {discount.cap_amount != null && <span>Tope {formatMoney(discount.cap_amount, group.base_currency)}</span>}
                          {discount.card_brand && <span>{discount.card_brand}</span>}
                        </div>
                        {matchingCards.length > 0 && (
                          <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            Aplica a: {matchingCards.map((card) => card.name).join(', ')}
                          </p>
                        )}
                        <a
                          href={discount.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs text-slate-400 underline hover:text-emerald-600"
                        >
                          Ver términos en el banco
                        </a>
                      </div>
                    )
                  })}
                </section>
              ))
            )}
          </div>
        </HistoryList>
      )}
        </>
      )}

      {adding ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">Crear tarjeta</h2>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          </div>
          <form onSubmit={add} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: Visa Galicia)" autoFocus />
              <div>
                <label htmlFor="card-bank" className="mb-1 block text-xs font-medium text-slate-500">
                  Banco manual (opcional)
                </label>
                <Input
                  id="card-bank"
                  list="supported-banks"
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  placeholder="Ej: Banco Patagonia"
                />
              </div>
              <Input value={last4} onChange={(e) => setLast4(e.target.value)} placeholder="Últimos 4" maxLength={4} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" min="1" max="31" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} placeholder="Cierre" />
                <Input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="Vto." />
              </div>
            </div>
            <datalist id="supported-banks">
              {BANK_DISCOUNT_SOURCES.map((source) => (
                <option key={source.id} value={source.bank} />
              ))}
            </datalist>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Guardando…' : 'Guardar tarjeta'}
            </Button>
          </form>
        </Card>
      ) : (
        <Button onClick={() => setAdding(true)} className="w-full">
          + Nueva tarjeta
        </Button>
      )}

      <HistoryList title="Mis tarjetas">
        {cards.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Todavía no hay tarjetas creadas.</p>
            <Link href={`/g/${group.id}/importar`}>
              <Button variant="ghost">Importar resumen sin tarjeta</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => {
              const statement = computeLastStatement(card, expenses)
              const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('es-AR')
              let summaryLine: string
              if (statement) {
                const range = `${fmtDate(statement.from)} al ${fmtDate(statement.to)}`
                const due = statement.due ? ` · vence ${fmtDate(statement.due)}` : ''
                summaryLine = `Último resumen (${range}): ${formatMoney(statement.total, group.base_currency)}${due}`
              } else {
                const cardExpenses = expenses.filter((e) => e.card_id === card.id && String(e.date).slice(0, 7) === month)
                const total = cardExpenses.reduce((sum, e) => sum + Number(e.amount) * Number(e.rate_to_base), 0)
                summaryLine = `Este mes: ${formatMoney(total, group.base_currency)} · cargá el cierre para ver el resumen real`
              }
              return (
                <div key={card.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{card.name}</p>
                      <p className="text-xs text-slate-400">
                        {[card.bank, card.last4 ? `•••• ${card.last4}` : null].filter(Boolean).join(' · ') || 'Sin datos extra'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{summaryLine}</p>
                    </div>
                    <IconButton label="Borrar" onClick={() => remove(card.id)}>
                    ✕
                  </IconButton>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/g/${group.id}/importar?cardId=${card.id}`}>
                      <Button variant="ghost">Importar resumen</Button>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </HistoryList>
      {dialog}
    </div>
  )
}

export function sameBank(cardBank: string | null, discountBank: string): boolean {
  if (!cardBank) return false
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '')
  const card = normalize(cardBank)
  const discount = normalize(discountBank)
  if (card === discount) return true
  if (discount.includes('nacion')) return card.includes('nacion') || card === 'bna'
  return card.includes(discount) || discount.includes(card)
}

export function isStorableBankDiscount(discount: BankDiscount): boolean {
  const validPercent =
    discount.discount_percent == null ||
    (Number.isFinite(discount.discount_percent) && discount.discount_percent > 0 && discount.discount_percent <= 100)
  const validInstallments =
    discount.installments == null ||
    (Number.isInteger(discount.installments) && discount.installments > 0 && discount.installments <= 60)
  return validPercent && validInstallments
}

export function isCurrentDiscount(discount: BankDiscount): boolean {
  const today = todayISO()
  return (!discount.valid_from || discount.valid_from <= today) && (!discount.valid_to || discount.valid_to >= today)
}

export const DISCOUNT_RUBRICS = [
  { id: 'supermarkets', label: 'Supermercados' },
  { id: 'fuel', label: 'Combustible' },
  { id: 'pharmacy', label: 'Farmacias' },
  { id: 'food', label: 'Gastronomía' },
  { id: 'shopping', label: 'Compras' },
  { id: 'travel', label: 'Viajes y entretenimiento' },
  { id: 'home', label: 'Hogar y tecnología' },
  { id: 'other', label: 'Otros descuentos' },
] as const

export type DiscountRubricId = (typeof DISCOUNT_RUBRICS)[number]['id']

export function discountRubric(discount: BankDiscount): DiscountRubricId {
  const text = [discount.category, discount.merchant, discount.title, discount.terms_text]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (/supermerc|mayorista|alimento|coto|carrefour|jumbo|disco|vea|dia\b|changomas/.test(text)) return 'supermarkets'
  if (/combustible|ypf|shell|axion|estacion de servicio/.test(text)) return 'fuel'
  if (/farmacia|farmacity|optica/.test(text)) return 'pharmacy'
  if (/gastronom|restaurante|bar\b|cafe\b|pedido.?ya/.test(text)) return 'food'
  if (/indumentaria|moda|shopping|calzado|belleza/.test(text)) return 'shopping'
  if (/viaje|turismo|hotel|aerolinea|entretenimiento|cine|show/.test(text)) return 'travel'
  if (/hogar|tecnologia|electro|mercado libre|tienda/.test(text)) return 'home'
  return 'other'
}
