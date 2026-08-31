'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'
import { fetchResilient } from '@/lib/fetch-resilient'
import type { PlanDia } from '../plan-types'
import { ExcepcionesBay } from './excepciones-bay'
import { GrupoCard } from './grupo-card'

const SEV_ORDER = { ALTA: 0, MEDIA: 1, BAJA: 2 } as const

/**
 * Pantalla "Hoy" — centro de operación diaria del Planificador (v4 §37).
 *
 * Camino feliz: entrar → ver propuesta → resolver excepciones → confirmar.
 * El usuario no construye el plan; lo revisa.
 */
interface Desactualizado {
  desactualizado: boolean
  nuevos: number
  caidos: number
}

export function HoyClient({
  fecha,
  planInicial,
  desactualizadoInicial,
  repartidores = [],
}: {
  fecha: string
  planInicial: PlanDia | null
  desactualizadoInicial?: Desactualizado | null
  repartidores?: Array<{ id: string; nombre: string }>
}) {
  const [plan, setPlan] = useState<PlanDia | null>(planInicial)
  const [desac, setDesac] = useState<Desactualizado | null>(desactualizadoInicial ?? null)
  const [busy, setBusy] = useState<null | 'generar' | 'replan' | 'confirmar' | 'cancelar'>(null)
  const { confirm, modal } = useConfirm()

  const recargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/rutas/planes?fecha=${fecha}`)
      const data = await res.json()
      if (data.success) {
        setPlan(data.plan ?? null)
        setDesac(data.desactualizado ?? null)
      }
    } catch {
      /* mantener el plan actual */
    }
  }, [fecha])

  // Otro usuario tocó el plan de esta fecha → refetch (ADR-PLANIFICADOR-001 §6).
  useRealtimeListener(['route_plan.updated'], (e) => {
    if (e.id === fecha) recargar()
  })

  const generar = useCallback(async () => {
    setBusy('generar')
    const r = await fetchResilient<{ planId: string }>('/api/rutas/planes/generar', {
      method: 'POST',
      body: { fecha },
      localEndpoint: 'rutas-plan-generar',
    })
    setBusy(null)
    if (r.status === 'ok') { toast.success('Propuesta generada'); await recargar() }
    else if (r.status === 'offline') toast.info('Sin conexión — no se pudo generar. Reintentá online.')
    else toast.error(r.error || 'No se pudo generar la propuesta')
  }, [fecha, recargar])

  const replan = useCallback(async () => {
    if (!plan) return
    setBusy('replan')
    const r = await fetchResilient<{ diff: { sinCambios: boolean } }>(`/api/rutas/planes/${plan.id}/replan`, {
      method: 'POST',
      body: { trigger: 'MANUAL' },
      localEndpoint: 'rutas-plan-replan',
    })
    setBusy(null)
    if (r.status === 'ok') {
      toast.success(r.data.diff.sinCambios ? 'Sin cambios en la demanda' : 'Propuesta recalculada — revisá los cambios')
      await recargar()
    } else if (r.status === 'offline') toast.info('Sin conexión — recalcular requiere estar online.')
    else toast.error(r.error || 'No se pudo recalcular')
  }, [plan, recargar])

  const confirmar = useCallback(async () => {
    if (!plan) return
    const abiertas = plan.excepciones.filter((e) => e.estado === 'ABIERTA' && e.severidad === 'ALTA')
    if (abiertas.length > 0) {
      const ok = await confirm(
        `Hay ${abiertas.length} excepción(es) de severidad ALTA sin resolver. ¿Confirmar de todos modos?`,
      )
      if (!ok) return
    }
    setBusy('confirmar')
    const r = await fetchResilient<{ estado: string; embarques: unknown[]; fallidos: unknown[] }>(
      `/api/rutas/planes/${plan.id}/confirmar`,
      {
        method: 'POST',
        body: { expectedVersion: plan.version, idempotencyKey: `confirm-${plan.id}-v${plan.version}` },
        localEndpoint: 'rutas-plan-confirmar',
      },
    )
    setBusy(null)
    if (r.status === 'ok') {
      if (r.data.estado === 'CONFIRMED') toast.success(`Plan confirmado — ${r.data.embarques.length} embarque(s) creado(s)`)
      else toast.warning(`Plan confirmado parcialmente — ${r.data.fallidos.length} grupo(s) fallaron`)
      await recargar()
    } else if (r.status === 'offline') {
      toast.error('Sin conexión — el cierre necesita estar online. No se encoló.')
    } else if (r.statusCode === 409) {
      toast.error('El plan cambió mientras lo revisabas. Recargá la página.')
    } else toast.error(r.error || 'No se pudo confirmar')
  }, [plan, confirm, recargar])

  const cancelar = useCallback(async () => {
    if (!plan) return
    const ok = await confirm('¿Descartar esta propuesta? Podés generar una nueva después.')
    if (!ok) return
    setBusy('cancelar')
    const r = await fetchResilient(`/api/rutas/planes/${plan.id}`, { method: 'DELETE', localEndpoint: 'rutas-plan-cancelar' })
    setBusy(null)
    if (r.status === 'ok') { toast.success('Propuesta descartada'); setPlan(null) }
    else toast.error('No se pudo descartar')
  }, [plan, confirm])

  const fechaLabel = new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  if (!plan || plan.estado === 'CANCELLED' || plan.estado === 'SUPERSEDED') {
    return (
      <div className="space-y-4" data-testid="rutas-hoy">
        <Header fechaLabel={fechaLabel} />
        <EmptyState
          icon={<span className="text-3xl">🗺️</span>}
          title="No hay una propuesta para hoy"
          description="El sistema analiza la demanda pendiente, la geografía y la capacidad para proponerte cómo distribuir. Vos revisás y confirmás."
          actionLabel={busy === 'generar' ? 'Generando…' : 'Generar propuesta'}
          onAction={busy ? undefined : generar}
        />
        {modal}
      </div>
    )
  }

  const r = plan.resumen
  const confirmado = plan.estado === 'CONFIRMED' || plan.estado === 'INTEGRATION_PARTIAL'
  const excepcionesAbiertas = plan.excepciones
    .filter((e) => e.estado === 'ABIERTA')
    .sort((a, b) => SEV_ORDER[a.severidad] - SEV_ORDER[b.severidad])

  return (
    <div className="space-y-5" data-testid="rutas-hoy">
      <Header fechaLabel={fechaLabel}>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${estadoBadge(plan.estado)}`}>
          {estadoLabel(plan.estado)}
        </span>
        <span className="text-xs text-gray-400">v{plan.version}</span>
      </Header>

      {!confirmado && desac?.desactualizado && (
        <div
          className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex items-center justify-between gap-3 flex-wrap"
          data-testid="rutas-desactualizado"
        >
          <span>
            La demanda cambió desde que se generó el plan
            {desac.nuevos > 0 && ` · ${desac.nuevos} pedido(s) nuevo(s)`}
            {desac.caidos > 0 && ` · ${desac.caidos} ya no aplica(n)`}.
          </span>
          <button
            onClick={replan}
            disabled={!!busy}
            className="text-xs px-2 py-1 bg-white border border-blue-300 rounded hover:bg-blue-100 disabled:opacity-50"
          >
            Recalcular ahora
          </button>
        </div>
      )}

      {r && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Pedidos" value={r.pedidos} />
          <Kpi label="Grupos" value={r.grupos} />
          <Kpi label="Unidades" value={r.unidades} />
          <Kpi label="Excepciones" value={r.excepciones} accent={r.excepciones > 0 ? 'warn' : undefined} />
        </div>
      )}

      {excepcionesAbiertas.length > 0 && (
        <ExcepcionesBay
          planId={plan.id}
          expectedUpdatedAt={plan.updatedAt}
          excepciones={excepcionesAbiertas}
          disabled={confirmado || !!busy}
          onResuelta={recargar}
        />
      )}

      <div className="space-y-3">
        {plan.grupos.map((g) => (
          <GrupoCard
            key={g.id}
            grupo={g}
            grupos={plan.grupos}
            repartidores={repartidores}
            planId={plan.id}
            expectedUpdatedAt={plan.updatedAt}
            confirmado={confirmado || !!busy}
            onCambio={recargar}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {!confirmado && (
          <>
            <button
              onClick={confirmar}
              disabled={!!busy}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              data-testid="btn-confirmar-plan"
            >
              {busy === 'confirmar' ? 'Confirmando…' : 'Confirmar plan'}
            </button>
            <button onClick={replan} disabled={!!busy} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50">
              {busy === 'replan' ? 'Recalculando…' : 'Recalcular'}
            </button>
            <button onClick={cancelar} disabled={!!busy} className="px-4 py-2 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
              Descartar
            </button>
          </>
        )}
        {confirmado && (
          <p className="text-sm text-gray-600">
            Plan confirmado. Los embarques están en <Link href="/embarques" className="text-blue-600 underline">Embarques</Link>.
          </p>
        )}
      </div>
      {modal}
    </div>
  )
}

function Header({ fechaLabel, children }: { fechaLabel: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hoy</h1>
        <p className="text-gray-500 capitalize">{fechaLabel}</p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: 'warn' }) {
  return (
    <div className="bg-white p-3 rounded-lg border shadow-sm">
      <div className={`text-2xl font-bold ${accent === 'warn' ? 'text-amber-600' : 'text-gray-900'}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function estadoLabel(e: PlanDia['estado']): string {
  return { PROPOSED: 'Propuesta', REVIEW: 'En revisión', CONFIRMED: 'Confirmado', INTEGRATION_PARTIAL: 'Confirmado (parcial)', SUPERSEDED: 'Reemplazado', CANCELLED: 'Descartado' }[e]
}
function estadoBadge(e: PlanDia['estado']): string {
  if (e === 'CONFIRMED') return 'bg-green-100 text-green-800'
  if (e === 'INTEGRATION_PARTIAL') return 'bg-amber-100 text-amber-800'
  if (e === 'REVIEW') return 'bg-blue-100 text-blue-800'
  return 'bg-gray-100 text-gray-700'
}
