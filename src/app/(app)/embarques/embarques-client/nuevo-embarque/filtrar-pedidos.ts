import { todayStringBogota } from '@/lib/dates'
import { clasificarCompromiso } from '@/lib/pedidos-compromiso'
import { clasificarFranja } from '@/lib/pedidos-franja'
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
  /** #836 F2b: hora acordada HH:MM (Bogotá) del día prometido; ordena y agrupa, no restringe. */
  entregaNoAntesDe?: string | null
  saldo: number | string
  total: number | string
  nombreCli?: string
  apellidoCli?: string | null
  barrioCli?: string | null
  nombreNegocioCli?: string | null
}

/**
 * #836 F2b — para hoy, por tiempo restante hasta la hora acordada: `hoy_ya_toca` (≤ 1 h o pasada),
 * `hoy_con_hora` (entre 1 y 3 h, por hora), `hoy_sin_hora`, y `hoy_mas_tarde` (> 3 h, al final). Nunca se oculta.
 */
export type UrgenciaBucket = 'vencido' | 'hoy_ya_toca' | 'hoy_sin_hora' | 'hoy_con_hora' | 'sin_fecha' | 'hoy_mas_tarde' | 'futuro'

/** #836 XMOD: «hoy / vencido / futuro» sale de la regla única `clasificarCompromiso` (día de Bogotá). */
function bucketUrgencia(p: PedidoSeleccionable, hoy: string, ahora: Date): UrgenciaBucket {
  const c = clasificarCompromiso({ fechaEntrega: p.fechaEntrega, estadoEntrega: p.estadoEntrega }, hoy)
  if (c === 'sin_fecha' || c === 'cerrado') return 'sin_fecha'
  if (c === 'arrastrado') return 'vencido'
  if (c === 'programado') return 'futuro'
  const { franja, minutosFaltantes } = clasificarFranja(p, ahora)
  if (franja === 'ya_toca') return 'hoy_ya_toca'
  if (franja === 'mas_tarde') return 'hoy_mas_tarde'
  return minutosFaltantes === null ? 'hoy_sin_hora' : 'hoy_con_hora'
}

const ORDEN: Record<UrgenciaBucket, number> = {
  vencido: 0,
  hoy_ya_toca: 1,
  hoy_sin_hora: 2,
  hoy_con_hora: 3,
  sin_fecha: 4,
  hoy_mas_tarde: 5,
  futuro: 6,
}

export interface FiltrarOpciones {
  /** Incluir pedidos con fecha de entrega posterior a hoy. Default: false. */
  verFuturos?: boolean
  /** Búsqueda por nombre de cliente/negocio (case-insensitive). */
  buscar?: string
  /** Reloj inyectable (pruebas); por defecto, ahora. */
  ahora?: Date
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
  const ahora = opciones.ahora ?? new Date()
  const buscar = (opciones.buscar ?? '').trim().toLowerCase()

  return pedidos
    .filter((p) => {
      if (p.embarqueId) return false
      if (p.estadoEntrega !== 'PENDIENTE' && p.estadoEntrega !== 'NO_ENTREGADO') return false
      const bucket = bucketUrgencia(p, hoy, ahora)
      if (bucket === 'futuro' && !opciones.verFuturos) return false
      if (buscar && !nombreVisible(p).includes(buscar)) return false
      return true
    })
    .map((p) => ({ ...p, _bucket: bucketUrgencia(p, hoy, ahora) }))
    .sort((a, b) => {
      const d = ORDEN[a._bucket] - ORDEN[b._bucket]
      if (d !== 0) return d
      // con hora acordada: por hora (más cercana primero); si no, por fecha de entrega asc y número asc
      if (a.entregaNoAntesDe && b.entregaNoAntesDe && a.entregaNoAntesDe !== b.entregaNoAntesDe) {
        return a.entregaNoAntesDe < b.entregaNoAntesDe ? -1 : 1
      }
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
