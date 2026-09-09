'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { EmptyState } from '@/components/empty-state'
import { getTodayString } from '@/lib/dates'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'
import { FocoStrip } from './foco-strip'
import { RecurrentesDelDia } from './recurrentes-del-dia'
import { OperacionList } from './operacion-list'
import { PeekPanel } from './peek-panel'
import { PedidoCommandMenu } from './command-menu'
import { deriveOperacion } from './derive-operacion'
import { usePeek } from './use-peek'
import { invalidatePeek } from './peek-cache'
import type { AccionKey, FocoCount, FocoKey, Pedido } from './types'

export interface PedidoHubCounts {
  /** PENDIENTE sin embarque (hoy o atrasados). */
  porPlanificarCount: number
  /** solo atrasados de días anteriores — dispara el tono ámbar del foco. */
  atrasadosCount: number
  enRutaCount: number
  esperandoPagoTotal: number
  pendientesN2Count: number
  /** operaciones con excepción abierta — en 4a se deriva de la página cargada. */
  excepcionesCount?: number
}

interface PedidoHubProps {
  pedidos: Pedido[]
  counts: PedidoHubCounts
  loading: boolean
  /** Fase 9 F9-i: una actualización está en vuelo mientras YA hay datos en
   *  pantalla (refetch manual, polling, realtime). Distinto de `loading`
   *  (carga inicial). Solo dispara un indicador sutil "Actualizando…" — no
   *  bloquea, no reemplaza la lista. Se ignora si el usuario está offline. */
  refetching?: boolean
  error: string | null
  userRole: string | null
  /** ejecutar la acción destacada (mapea a las mutaciones existentes de pedidos-client). */
  onAccion: (pedido: Pedido, key: AccionKey) => void
  /** abrir el flujo de creación (modal de pedidos-client). */
  onNuevaOperacion?: () => void
  /** el control de rango de fecha existente de pedidos-client (independiente de los focos). */
  dateFilterSlot?: ReactNode
  onRetry?: () => void
  /** dispara un refetch de la lista/counts (para realtime). */
  onRefetch?: () => void
}

function useViewport(): 'desktop' | 'mobile' {
  const [vp, setVp] = useState<'desktop' | 'mobile'>('desktop')
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => setVp(mq.matches ? 'mobile' : 'desktop')
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return vp
}

export function PedidoHub({
  pedidos, counts, loading, refetching = false, error, userRole, onAccion, onNuevaOperacion, dateFilterSlot, onRetry, onRefetch,
}: PedidoHubProps) {
  const isOnline = useOnlineStatus()
  const viewport = useViewport()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeFoco, setActiveFoco] = useState<FocoKey | null>(null)
  const hoyBogota = getTodayString()

  // F8-i: faceta "solo habituales" — server-side (la lista no trae la
  // recurrencia por fila), toggle vía query param.
  const soloHabituales = searchParams.get('conRecurrencia') === 'true'
  const toggleHabituales = () => {
    const p = new URLSearchParams(searchParams.toString())
    if (soloHabituales) p.delete('conRecurrencia')
    else p.set('conRecurrencia', 'true')
    router.push(`/pedidos${p.toString() ? `?${p.toString()}` : ''}`)
  }

  const focosByPedido = useMemo(() => {
    const map = new Map<string, ReturnType<typeof deriveOperacion>['focos']>()
    for (const p of pedidos) map.set(p.id, deriveOperacion(p, { hoyBogota }).focos)
    return map
  }, [pedidos, hoyBogota])

  const excepcionesEnPagina = useMemo(
    () => pedidos.filter((p) => focosByPedido.get(p.id)?.includes('excepciones')).length,
    [pedidos, focosByPedido],
  )

  const focos: FocoCount[] = [
    { key: 'porPlanificar', label: 'Por planificar', value: counts.porPlanificarCount, tone: counts.atrasadosCount > 0 ? 'amber' : 'none' },
    { key: 'enRuta', label: 'En ruta', value: counts.enRutaCount, tone: 'none' },
    { key: 'esperandoPago', label: 'Esperando pago', value: countByFoco(pedidos, focosByPedido, 'esperandoPago'), amount: counts.esperandoPagoTotal, tone: counts.esperandoPagoTotal > 0 ? 'red' : 'none' },
    { key: 'pendientesN2', label: 'Pendientes', value: counts.pendientesN2Count, tone: counts.pendientesN2Count > 0 ? 'amber' : 'none' },
    { key: 'excepciones', label: 'Excepciones', value: counts.excepcionesCount ?? excepcionesEnPagina, tone: (counts.excepcionesCount ?? excepcionesEnPagina) > 0 ? 'red' : 'none' },
  ]

  const pedidosFiltrados = useMemo(() => {
    if (!activeFoco) return pedidos
    return pedidos.filter((p) => focosByPedido.get(p.id)?.includes(activeFoco))
  }, [pedidos, activeFoco, focosByPedido])

  const peek = usePeek(pedidosFiltrados)

  // Realtime SELECTIVO (plan Fase 5, P6): invalidar el peek solo ante eventos
  // que cambian los datos de un pedido concreto; refetch de la lista/counts
  // solo ante eventos que pueden mover focos.
  useRealtimeListener(['pedido.*', 'pago.*', 'embarque.*', 'route_plan.updated'], (evt) => {
    const t = evt.type
    // pedido.*/pago.* con id → ese pedido (pendienteN2, total/saldo/estadoPago, factura).
    if ((t.startsWith('pedido.') || t.startsWith('pago.')) && evt.id) {
      invalidatePeek(evt.id)
    }
    // embarque.updated → invalidar solo el peek abierto si su pedido usa ese
    // embarque (como asignación o como embarque de una Actividad N2).
    if (t.startsWith('embarque.') && evt.id && peek.activeId) {
      const usaEmbarque =
        peek.layer1?.embarqueId === evt.id ||
        (peek.layer2?.embarqueResumen?.id === evt.id) ||
        (peek.layer2?.pendienteN2?.actividades?.some((a) => a.embarqueId === evt.id) ?? false)
      if (usaEmbarque) invalidatePeek(peek.activeId)
    }
    // route_plan.updated no toca el peek de un pedido concreto, pero el foco
    // "Por planificar" sí depende del plan del día → la lista/counts se
    // refetchean para todos los eventos escuchados.
    //
    // Fase 7-iii (P6): NO hay evento realtime `caso.*` (`RealtimeEntity` en
    // `src/lib/realtime.ts` no lo incluye). Un `Caso` creado en el flujo de un
    // pedido llega vía el `pedido.*` de ese flujo; uno creado por el cron
    // `alertas-batch` (detección periódica) NO empuja al peek abierto — límite
    // conocido y aceptable (el cron es detectivo, no en vivo). No se inventa
    // el evento acá.
    onRefetch?.()
  }, { debounceMs: 500 })

  const offlineConDatos = !isOnline && pedidos.length > 0
  const errorSinDatos = error && pedidos.length === 0
  // F9-i: "Actualizando…" solo mientras hay datos y conexión — nunca durante la
  // carga inicial (skeleton) ni offline (ahí manda el badge de sin conexión).
  const mostrarActualizando = refetching && isOnline && !(loading && pedidos.length === 0)

  const listNode = errorSinDatos ? (
    <EmptyState title="No se pudieron cargar las operaciones" description={error ?? undefined} actionLabel={onRetry ? 'Reintentar' : undefined} onAction={onRetry} />
  ) : loading && pedidos.length === 0 ? (
    <div className="animate-pulse space-y-2" data-testid="pedido-hub-skeleton">
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-gray-100" />)}
    </div>
  ) : (
    <OperacionList pedidos={pedidosFiltrados} viewport={viewport} hoyBogota={hoyBogota} onAccion={onAccion} onOpen={peek.open} />
  )

  const peekNode = peek.activeId && peek.layer1 ? (
    <PeekPanel
      pedido={peek.layer1}
      layer2={peek.layer2}
      loadingLayer2={peek.loadingLayer2}
      errorLayer2={peek.errorLayer2}
      viewport={viewport}
      userRole={userRole}
      hoyBogota={hoyBogota}
      onClose={peek.close}
      onNav={peek.nav}
      onAccion={onAccion}
      onOpenVinculado={(id) => {
        const target = pedidos.find((p) => p.id === id)
        if (target) peek.open(target)
      }}
      onMutadoN2={() => {
        // tras una mutación N2: recargar el peek + refetch de lista/counts.
        if (peek.activeId) {
          invalidatePeek(peek.activeId)
          const p = pedidos.find((x) => x.id === peek.activeId)
          if (p) peek.open(p)
        }
        onRefetch?.()
      }}
    />
  ) : null

  return (
    <div className="space-y-3" data-testid="pedido-hub">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {dateFilterSlot}
        {offlineConDatos && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800" data-testid="pedido-hub-offline">
            Sin conexión — se actualiza al reconectar
          </span>
        )}
        {mostrarActualizando && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-400" data-testid="pedido-hub-actualizando" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
            Actualizando…
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FocoStrip focos={focos} activeFoco={activeFoco} onSelect={setActiveFoco} />
        <button
          type="button"
          onClick={toggleHabituales}
          data-testid="faceta-habituales"
          aria-pressed={soloHabituales}
          className={`rounded-full border px-2.5 py-1 text-xs ${soloHabituales ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
        >
          🔁 Solo habituales
        </button>
      </div>

      {activeFoco && pedidosFiltrados.length < pedidos.length && (
        <p className="text-xs text-gray-500" data-testid="foco-filtro-info">
          Mostrando {pedidosFiltrados.length} de {pedidos.length} en esta página
        </p>
      )}

      {/* F8-iv: "Generar pedidos habituales de hoy" — CTA contextual (Q3) */}
      <RecurrentesDelDia onGenerado={() => onRefetch?.()} />

      {/* desktop: lista + peek lado a lado; mobile: lista + peek como bottom sheet */}
      {viewport === 'desktop' && peekNode ? (
        <div className="grid grid-cols-[1fr_24rem] gap-3">
          <div>{listNode}</div>
          <div className="sticky top-4 self-start">{peekNode}</div>
        </div>
      ) : (
        <>
          {listNode}
          {peekNode}
        </>
      )}

      <PedidoCommandMenu
        selected={peek.layer1}
        hoyBogota={hoyBogota}
        onNuevaOperacion={() => onNuevaOperacion?.()}
        onBuscarCliente={() => { window.location.href = '/clientes' }}
        onAccion={onAccion}
      />
    </div>
  )
}

function countByFoco(
  pedidos: Pedido[],
  focosByPedido: Map<string, ReturnType<typeof deriveOperacion>['focos']>,
  foco: FocoKey,
): number {
  return pedidos.filter((p) => focosByPedido.get(p.id)?.includes(foco)).length
}
