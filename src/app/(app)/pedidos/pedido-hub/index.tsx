'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/empty-state'
import { getTodayString } from '@/lib/dates'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { FocoStrip } from './foco-strip'
import { OperacionList } from './operacion-list'
import { deriveOperacion } from './derive-operacion'
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
  error: string | null
  /** callback: abrir el detalle (modal legacy en 4a; peek en 4b). */
  onOpen: (pedido: Pedido) => void
  /** callback: ejecutar la acción destacada (mapea a las mutaciones existentes). */
  onAccion: (pedido: Pedido, key: AccionKey) => void
  /** el control de rango de fecha existente de pedidos-client (independiente de los focos). */
  dateFilterSlot?: ReactNode
  onRetry?: () => void
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
  pedidos, counts, loading, error, onOpen, onAccion, dateFilterSlot, onRetry,
}: PedidoHubProps) {
  const isOnline = useOnlineStatus()
  const viewport = useViewport()
  const [activeFoco, setActiveFoco] = useState<FocoKey | null>(null)
  const hoyBogota = getTodayString()

  // Focos por pedido de la página cargada (para el filtro client-side y para
  // derivar "excepciones" cuando counts no lo trae).
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
    { key: 'esperandoPago', label: 'Esperando pago', value: countEsperandoPago(pedidos, focosByPedido), amount: counts.esperandoPagoTotal, tone: counts.esperandoPagoTotal > 0 ? 'red' : 'none' },
    { key: 'pendientesN2', label: 'Pendientes', value: counts.pendientesN2Count, tone: counts.pendientesN2Count > 0 ? 'amber' : 'none' },
    { key: 'excepciones', label: 'Excepciones', value: counts.excepcionesCount ?? excepcionesEnPagina, tone: (counts.excepcionesCount ?? excepcionesEnPagina) > 0 ? 'red' : 'none' },
  ]

  const pedidosFiltrados = useMemo(() => {
    if (!activeFoco) return pedidos
    return pedidos.filter((p) => focosByPedido.get(p.id)?.includes(activeFoco))
  }, [pedidos, activeFoco, focosByPedido])

  const offlineConDatos = !isOnline && pedidos.length > 0
  const errorSinDatos = error && pedidos.length === 0

  return (
    <div className="space-y-3" data-testid="pedido-hub">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {dateFilterSlot}
        {offlineConDatos && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800" data-testid="pedido-hub-offline">
            Sin conexión — se actualiza al reconectar
          </span>
        )}
      </div>

      <FocoStrip focos={focos} activeFoco={activeFoco} onSelect={setActiveFoco} />

      {activeFoco && pedidosFiltrados.length < pedidos.length && (
        <p className="text-xs text-gray-500" data-testid="foco-filtro-info">
          Mostrando {pedidosFiltrados.length} de {pedidos.length} en esta página
        </p>
      )}

      {errorSinDatos ? (
        <EmptyState
          title="No se pudieron cargar las operaciones"
          description={error ?? undefined}
          actionLabel={onRetry ? 'Reintentar' : undefined}
          onAction={onRetry}
        />
      ) : loading && pedidos.length === 0 ? (
        <div className="animate-pulse space-y-2" data-testid="pedido-hub-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        <OperacionList
          pedidos={pedidosFiltrados}
          viewport={viewport}
          hoyBogota={hoyBogota}
          onAccion={onAccion}
          onOpen={onOpen}
        />
      )}
    </div>
  )
}

function countEsperandoPago(
  pedidos: Pedido[],
  focosByPedido: Map<string, ReturnType<typeof deriveOperacion>['focos']>,
): number {
  return pedidos.filter((p) => focosByPedido.get(p.id)?.includes('esperandoPago')).length
}
