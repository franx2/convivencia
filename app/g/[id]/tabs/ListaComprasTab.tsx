'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, Checkbox, EmptyState, ErrorText, IconButton, Input, Modal, Select, Spinner } from '@/components/ui'
import { formatMoney } from '@/lib/currencies'
import { correctGroceryTerm } from '@/lib/grocery-glossary'
import { DEFAULT_GROCERY_CATEGORY, GROCERY_CATEGORIES, suggestGroceryCategory } from '@/lib/grocery-categories'
import { type ShoppingItem } from '@/lib/types'

export function ListaComprasTab({
  groupId,
  items,
  onChanged,
}: {
  groupId: string
  items: ShoppingItem[]
  onChanged: () => void
}) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState(DEFAULT_GROCERY_CATEGORY)
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [searchFor, setSearchFor] = useState<ShoppingItem | null>(null)

  const pending = items.filter((i) => !i.checked)
  const bought = items.filter((i) => i.checked)
  // Historial "confirmado": items a los que ya se les dio el ok (comprados),
  // con su categoría. Sirve de base para aprender y sugerir mejor con el tiempo.
  const confirmedHistory = bought.map((i) => ({ text: i.text, category: i.category || DEFAULT_GROCERY_CATEGORY }))
  // Pendientes agrupados por categoría de súper (carnes, lácteos, etc.), en el
  // orden fijo de GROCERY_CATEGORIES; se omiten las categorías sin ítems.
  const pendingByCategory = GROCERY_CATEGORIES.map((cat) => ({
    cat,
    items: pending.filter((i) => (i.category || DEFAULT_GROCERY_CATEGORY) === cat.value),
  })).filter((g) => g.items.length > 0)

  function onTextChange(value: string) {
    setText(value)
    if (!categoryTouched) setCategory(suggestGroceryCategory(value, confirmedHistory))
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    await supabase.from('shopping_items').insert({ group_id: groupId, text: text.trim(), category })
    setText('')
    setCategory(DEFAULT_GROCERY_CATEGORY)
    setCategoryTouched(false)
    setBusy(false)
    onChanged()
  }

  async function toggle(item: ShoppingItem) {
    await supabase.from('shopping_items').update({ checked: !item.checked }).eq('id', item.id)
    onChanged()
  }

  async function remove(id: string) {
    await supabase.from('shopping_items').delete().eq('id', id)
    onChanged()
  }

  async function clearBought() {
    await supabase.from('shopping_items').delete().eq('group_id', groupId).eq('checked', true)
    onChanged()
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={add} className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Leche, pan, detergente…"
              autoFocus
            />
            <Button type="submit" disabled={busy || !text.trim()}>
              Agregar
            </Button>
          </div>
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setCategoryTouched(true)
            }}
          >
            {GROCERY_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </Select>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState>Todavía no hay nada en la lista.</EmptyState>
      ) : (
        <>
          <div className="space-y-4">
            {pendingByCategory.map(({ cat, items: catItems }) => (
              <div key={cat.value}>
                <p className="mb-2 text-sm font-semibold text-slate-400">
                  {cat.emoji} {cat.label} ({catItems.length})
                </p>
                <div className="space-y-2">
                  {catItems.map((item) => (
                    <Card key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                      <label className="flex min-w-0 flex-1 items-center gap-3">
                        <Checkbox checked={false} onChange={() => toggle(item)} className="h-5 w-5" />
                        <span className="truncate">{item.text}</span>
                      </label>
                      <button
                        onClick={() => setSearchFor(item)}
                        className="shrink-0 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        Precio
                      </button>
                      <IconButton label="Borrar" onClick={() => remove(item.id)} className="shrink-0">
                    ✕
                  </IconButton>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {bought.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-400">Comprado ({bought.length})</p>
                <button onClick={clearBought} className="text-sm font-medium text-slate-400 hover:text-red-500">
                  Vaciar
                </button>
              </div>
              <div className="space-y-2">
                {bought.map((item) => (
                  <Card key={item.id} className="flex items-center justify-between gap-3 py-2.5 opacity-60">
                    <label className="flex min-w-0 flex-1 items-center gap-3">
                      <Checkbox checked={true} onChange={() => toggle(item)} className="h-5 w-5" />
                      <span className="truncate line-through">{item.text}</span>
                    </label>
                    <IconButton label="Borrar" onClick={() => remove(item.id)} className="shrink-0">
                    ✕
                  </IconButton>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {searchFor && <PriceSearchModal initialTerm={searchFor.text} onClose={() => setSearchFor(null)} />}
    </div>
  )
}

export function PriceSearchModal({ initialTerm, onClose }: { initialTerm: string; onClose: () => void }) {
  const [term, setTerm] = useState(initialTerm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<PriceGroup[]>([])

  const search = useCallback(async () => {
    if (!term.trim()) return
    // Corrige apodos/diminutivos conocidos (ej. "vinito" -> "vino") antes de
    // buscar; si cambió algo, lo mostramos en el campo para que se vea la corrección.
    const corrected = correctGroceryTerm(term.trim())
    if (corrected !== term.trim()) setTerm(corrected)
    setLoading(true)
    setError(null)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    try {
      const res = await fetch(`/api/price-search?q=${encodeURIComponent(corrected)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = (await res.json()) as { groups?: PriceGroup[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'No se pudo buscar el precio.')
      setGroups(data.groups ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar el precio.')
    } finally {
      setLoading(false)
    }
  }, [term])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- primera búsqueda automática al abrir el modal
    search()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar, no en cada tecla
  }, [])

  return (
    <Modal title="Buscar precio" onClose={onClose}>
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              search()
            }}
            className="flex gap-2"
          >
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Qué buscar…" autoFocus />
            <Button type="submit" disabled={loading || !term.trim()}>
              {loading ? '…' : 'Buscar'}
            </Button>
          </form>
          <p className="text-xs text-slate-400">
            Precios de Vea, Changomas, Carrefour, Jumbo, Disco y La Anónima, orientativos. Mismo producto en varios
            supermercados aparece agrupado para comparar.
          </p>

          <ErrorText>{error}</ErrorText>
          {loading ? (
            <Spinner />
          ) : groups.length === 0 ? (
            <p className="text-center text-sm text-slate-500">Sin resultados.</p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.key} className="rounded-xl border border-slate-100 p-2.5 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    {g.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- thumbnail externo de un catálogo de terceros, no vale la pena el pipeline de next/image
                      <img src={g.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800" />
                    )}
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{g.name}</p>
                  </div>
                  <div className="mt-2 space-y-1">
                    {g.offers.map((o, i) => (
                      <a
                        key={`${o.store}-${i}`}
                        href={o.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-900 ${
                          i === 0 && g.offers.length > 1 ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''
                        }`}
                      >
                        <span className="text-slate-500">
                          {o.store}
                          {i === 0 && g.offers.length > 1 && (
                            <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                              Mejor precio
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-bold text-emerald-700 dark:text-emerald-400">
                          {o.price != null ? formatMoney(o.price, 'ARS') : '—'}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </Modal>
  )
}

export type PriceGroup = {
  key: string
  name: string
  image: string | null
  offers: { store: string; price: number | null; url: string; name: string }[]
}

