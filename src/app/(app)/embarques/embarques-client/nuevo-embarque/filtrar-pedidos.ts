import { todayStringBogota } from '@/lib/dates'
import { clasificarCompromiso } from '@/lib/pedidos-compromiso'
import type { PedidoCantidades } from '@/lib/embarque-auto'

/**
 * Selección de pedidos elegibles para un embarque suelto (Paso 1 del wizard).
 *
 * Regla (decisión del PO):
 *  - `estadoEntrega ∈ {PENDIENTE, NO_ENTREGADO}` y sin `embarqueId` (libre).
 *  - fecha de entrega HOY o VENCIDA, o SIN fecha. Los "entregar en 8 días" NO
 *    aparecen salvo que se active "Ver pedidos futuros".
 *  - orden por urgencia: vencidos → hoy con hora → hoy sin hora → sin fecha → futuros.
 */

export interface PedidoSeleccionable extends PedidoCantidades {
  id: string
  numero: number
  estadoEntrega: string
  estadoPago: string
  embarqueId: string | null
  fechaEntrega: string | null
  horaPreferida: string | null
  saldo: number | string
  total: number | string
  nombreCli?: string
  apellidoCli?: string | null
  barrioCli?: string | null
  nombreNegocioCli?: string | null
}

export type UrgenciaBucket = 'vencido' | 'hoy_con_hora' | 'hoy_sin_hora' | 'sin_fecha' | 'futuro'

/** #836 XMOD: «hoy / vencido / futuro» sale de la regla única `clasificarCompromiso` (día de Bogotá). */
function bucketUrgencia(p: PedidoSeleccionable, hoy: string): UrgenciaBucket {
  const c = clasificarCompromiso({ fechaEntrega: p.fechaEntrega, estadoEntrega: p.estadoEntrega }, hoy)
  if (c === 'sin_fecha' || c === 'cerrado') return 'sin_fecha'
  if (c === 'arrastrado') return 'vencido'
  if (c === 'programado') return 'futuro'
  return p.horaPreferida ? 'hoy_con_hora' : 'hoy_sin_hora'
}

const ORDEN: Record<UrgenciaBucket, number> = {
  vencido: 0,
  hoy_con_hora: 1,
  hoy_sin_hora: 2,
  sin_fecha: 3,
  futuro: 4,
}

export interface FiltrarOpciones {
  /** Incluir pedidos con fecha de entrega posterior a hoy. Default: false. */
  verFuturos?: boolean
  /** Búsqueda por nombre de cliente/negocio (case-insensitive). */
  buscar?: string
}

function nombreVisible(p: PedidoSeleccionable): string {
  return (p.nombreNegocioCli || `${p.nombreCli ?? ''} ${p.apellidoCli ?? ''}`).trim().toLowerCase()
}

/** Aplica la regla de elegibilidad + orden. No muta la entrada. */
export function filtrarPedidosSeleccionables(
  pedidos: PedidoSeleccionable[],
  opciones: FiltrarOpciones = {},
): Array<PedidoSeleccionable & { _bucket: UrgenciaBucket }> {
  const hoy = todayStringBogota()
  const buscar = (opciones.buscar ?? '').trim().toLowerCase()

  return pedidos
    .filter((p) => {
      if (p.embarqueId) return false
      if (p.estadoEntrega !== 'PENDIENTE' && p.estadoEntrega !== 'NO_ENTREGADO') return false
      const bucket = bucketUrgencia(p, hoy)
      if (bucket === 'futuro' && !opciones.verFuturos) return false
      if (buscar && !nombreVisible(p).includes(buscar)) return false
      return true
    })
    .map((p) => ({ ...p, _bucket: bucketUrgencia(p, hoy) }))
    .sort((a, b) => {
      const d = ORDEN[a._bucket] - ORDEN[b._bucket]
      if (d !== 0) return d
      // dentro del bucket: por fecha de entrega asc, luego por número asc
      const fa = a.fechaEntrega ? new Date(a.fechaEntrega).getTime() : Infinity
      const fb = b.fechaEntrega ? new Date(b.fechaEntrega).getTime() : Infinity
      if (fa !== fb) return fa - fb
      return a.numero - b.numero
    })
}

/** ¿Este pedido tiene saldo pendiente (chip de fiado en la fila)? */
export function tieneFiadoPendiente(p: PedidoSeleccionable): boolean {
  return p.estadoPago !== 'PAGADO' && Number(p.saldo) > 0
}
