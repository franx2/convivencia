'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRequireAuth } from '@/components/AuthProvider'
import { NotFoundScreen, PageShell } from '@/components/PageShell'
import { Button, Card, IconButton, Input, Spinner, TextButton } from '@/components/ui'
import type { Group, Member } from '@/lib/types'

/**
 * Onboarding tras crear un grupo (items 7/8/9):
 *  - Paso 1: sumar integrantes (el creador ya está agregado como miembro).
 *  - Paso 2: compartir el link de invitación por WhatsApp / menú nativo / copiar.
 */
export default function InvitarPage() {
  const { user, loading } = useRequireAuth()
  const params = useParams<{ id: string }>()
  const groupId = params.id
  const router = useRouter()

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [myMemberId, setMyMemberId] = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const { data: g } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle()
    if (!g) {
      setNotFound(true)
      setFetching(false)
      return
    }
    setGroup(g as Group)
    const [{ data: m }, { data: link }] = await Promise.all([
      supabase.from('members').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('group_users').select('member_id').eq('group_id', groupId).eq('user_id', user.id).maybeSingle(),
    ])
    setMembers((m ?? []) as Member[])
    setMyMemberId(((link ?? {}) as { member_id?: string | null }).member_id ?? null)
    setFetching(false)
  }, [groupId, user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial async de datos del grupo
    if (user) load()
  }, [user, load])

  const inviteUrl =
    group && typeof window !== 'undefined' ? `${window.location.origin}/join?token=${group.invite_token}` : ''
  const shareText = group
    ? `Te invito a "${group.name}" en covivencia. para repartir gastos compartidos: ${inviteUrl}`
    : ''

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    await supabase.from('members').insert({ group_id: groupId, name: name.trim() })
    setName('')
    setBusy(false)
    load()
  }

  async function removeMember(id: string) {
    await supabase.from('members').delete().eq('id', id)
    load()
  }

  async function shareNative() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: group?.name ?? 'covivencia.', text: shareText })
      } catch {
        // el usuario canceló el share; no es un error
      }
    } else {
      copy()
    }
  }

  function shareWhatsapp() {
    if (typeof window !== 'undefined') window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
  }

  async function copy() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading || !user || fetching) return <Spinner />
  if (notFound || !group) return <NotFoundScreen>No encontramos este grupo.</NotFoundScreen>

  return (
    <PageShell nav={group.kind === 'viaje' ? 'viajes' : 'convivencia'} width="narrow">
      <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-muted">Paso {step} de 2</p>
          <TextButton tone="muted" onClick={() => router.push(`/g/${groupId}`)}>
            Saltar →
          </TextButton>
        </div>

        {step === 1 ? (
          <Card>
            <h1 className="text-xl font-bold">Sumá integrantes</h1>
            <p className="mt-1 text-sm text-muted">
              Agregá a las personas con las que compartís gastos en <span className="font-medium">{group.name}</span>. No
              necesitan tener cuenta todavía.
            </p>

            <form onSubmit={addMember} className="mt-4 flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del integrante" autoFocus />
              <Button type="submit" disabled={busy || !name.trim()} className="shrink-0">
                Agregar
              </Button>
            </form>

            <div className="mt-4 space-y-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 text-sm dark:border-slate-800"
                >
                  <span className="font-medium">
                    {m.name}
                    {m.id === myMemberId && <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">vos</span>}
                  </span>
                  {m.id !== myMemberId && (
                    <IconButton label="Quitar" onClick={() => removeMember(m.id)} />
                  )}
                </div>
              ))}
            </div>

            <Button onClick={() => setStep(2)} className="mt-5 w-full">
              Continuar
            </Button>
          </Card>
        ) : (
          <Card>
            <h1 className="text-xl font-bold">Compartí la invitación</h1>
            <p className="mt-1 text-sm text-muted">
              Mandales este link. Quien lo abra (con sesión iniciada) entra al grupo y elige quién es.
            </p>

            <div className="mt-4 flex gap-2">
              <Input readOnly value={inviteUrl} aria-label="Link de invitación" />
              <Button variant="ghost" onClick={copy} className="shrink-0">
                {copied ? '¡Copiado!' : 'Copiar'}
              </Button>
            </div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={shareWhatsapp}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#128C7E] px-4 py-3 text-base font-bold text-white transition active:scale-[0.99]"
              >
                <MessageCircle size={20} aria-hidden="true" /> Enviar por WhatsApp
              </button>
              <Button onClick={shareNative} className="w-full">
                Compartir por otro medio…
              </Button>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <TextButton tone="muted" onClick={() => setStep(1)}>
                ← Integrantes
              </TextButton>
              <TextButton onClick={() => router.push(`/g/${groupId}`)}>Ir al grupo →</TextButton>
            </div>
          </Card>
        )}
    </PageShell>
  )
}
