'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ShoppingBasket } from 'lucide-react'
import { useRequireAuth } from '@/components/AuthProvider'
import { PageShell } from '@/components/PageShell'
import { Button, Card, ErrorText, PageTitle, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { Group, ShoppingItem } from '@/lib/types'
import { ListaComprasTab } from '../g/[id]/tabs/ListaComprasTab'

/**
 * La lista Super pertenece al único grupo de convivencia. Si existían varios,
 * la persona elige cuál conservar y los demás pasan a ser viajes, sin borrar
 * los ítems de sus listas.
 */
export default function SuperPage() {
  const { user, loading } = useRequireAuth()
  const [groups, setGroups] = useState<Group[]>([])
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [fetching, setFetching] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadGroups = useCallback(async () => {
    if (!user) return
    setFetching(true)
    setError(null)
    const { data, error: loadError } = await supabase.from('groups').select('*').order('created_at', { ascending: true })
    if (loadError) setError(loadError.message)
    setGroups((data ?? []) as Group[])
    setFetching(false)
  }, [user])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- la consulta hidrata el estado inicial de la pantalla */
    void loadGroups()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadGroups])

  const personalGroup = useMemo(() => groups.find((group) => group.is_personal) ?? null, [groups])
  const sharedGroups = useMemo(() => groups.filter((group) => !group.is_personal), [groups])
  const convivenciaGroups = useMemo(
    () => sharedGroups.filter((group) => group.kind === 'convivencia'),
    [sharedGroups],
  )
  const activeGroup = convivenciaGroups.length === 1 ? convivenciaGroups[0] : null
  const activeGroupId = activeGroup?.id

  const loadItems = useCallback(async (groupId: string) => {
    setError(null)
    const { data, error: loadError } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('group_id', groupId)
      .order('checked', { ascending: true })
      .order('created_at', { ascending: false })
    if (loadError) {
      setError(loadError.message)
      return
    }
    setItems((data ?? []) as ShoppingItem[])
  }, [])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sincroniza los ítems cuando cambia el grupo seleccionado */
    if (activeGroupId) void loadItems(activeGroupId)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activeGroupId, loadItems])

  async function chooseConvivencia(groupId: string) {
    setMigrating(true)
    setError(null)

    const { error: migrateError } = await supabase
      .from('groups')
      .update({ kind: 'viaje' })
      .eq('is_personal', false)
      .eq('kind', 'convivencia')
      .neq('id', groupId)

    if (migrateError) {
      setError(migrateError.message)
      setMigrating(false)
      return
    }

    const { error: selectError } = await supabase.from('groups').update({ kind: 'convivencia' }).eq('id', groupId)
    if (selectError) {
      setError(selectError.message)
      setMigrating(false)
      return
    }

    setGroups((previous) =>
      previous.map((group) =>
        group.is_personal ? group : { ...group, kind: group.id === groupId ? 'convivencia' : 'viaje' },
      ),
    )
    setMigrating(false)
  }

  if (loading || fetching) return <Spinner />

  return (
    <PageShell nav="super" personalHref={personalGroup ? `/g/${personalGroup.id}` : null} width="narrow">
      <PageTitle subtitle="La lista de compras del grupo de convivencia.">Super</PageTitle>
      <ErrorText>{error}</ErrorText>

      {sharedGroups.length === 0 ? (
        <Card className="space-y-3 text-center">
          <ShoppingBasket className="mx-auto text-emerald-700" size={30} aria-hidden="true" />
          <p className="font-semibold">Todavía no tenés un grupo compartido</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Creá un grupo de convivencia para organizar su lista de compras.
          </p>
          <Link
            href="/?section=convivencia"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
          >
            Ir a Convivencia <ArrowRight size={16} />
          </Link>
        </Card>
      ) : !activeGroup ? (
        <div className="space-y-3">
          <Card>
            <p className="font-semibold">Elegí tu grupo de convivencia</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Ese grupo tendrá la lista Super principal. Los demás grupos compartidos pasarán a Viajes y conservarán sus
              propias listas.
            </p>
          </Card>
          {sharedGroups.map((group) => (
            <Card key={group.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{group.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {group.kind === 'viaje' ? 'Actualmente en Viajes' : 'Grupo de convivencia'}
                </p>
              </div>
              <Button onClick={() => void chooseConvivencia(group.id)} disabled={migrating} className="shrink-0">
                {migrating ? 'Guardando...' : 'Elegir'}
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="flex items-center gap-3 border-emerald-100 bg-emerald-50/60 dark:border-[#29614f] dark:bg-[#18201d]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white dark:bg-[#173e32] dark:text-[#4ee6b0]">
              <ShoppingBasket size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-emerald-800 dark:text-[#94a19c]">Lista de convivencia</p>
              <p className="truncate font-semibold text-emerald-950 dark:text-[#f4f7f6]">{activeGroup.name}</p>
            </div>
          </Card>
          <ListaComprasTab groupId={activeGroup.id} items={items} onChanged={() => void loadItems(activeGroup.id)} />
        </div>
      )}
    </PageShell>
  )
}
