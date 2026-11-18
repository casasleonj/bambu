/**
 * #836 F1 — Contrato único de la FECHA PROMETIDA de entrega de un pedido.
 *
 * `Pedido.fechaEntrega` es la fecha prometida (compromiso). NO es la fecha física de
 * entrega (esa es `entregadoAt`/los hechos de entrega) ni la de creación (`createdAt`).
 * El compromiso se interpreta SIEMPRE por día calendario de America/Bogota, nunca por
 * instante UTC: así un compromiso a medianoche no «deriva» al día anterior (A27, #753).
 *
 * Esta función es la ÚNICA regla de «hoy / arrastrado / programado»: Pedidos y Embarques
 * deben usarla para no divergir (XMOD).
 */
import { diaEntregaBogota } from '@/lib/pedidos-entregas-historial'

export type ClasificacionCompromiso =
  | 'hoy' // previsto para hoy: normal, aunque se haya creado antes (A01, A02)
  | 'arrastrado' // previsto un día anterior y sigue abierto (A03)
  | 'programado' // previsto para un día futuro: se prepara, no es atraso (A01)
  | 'sin_fecha' // sin compromiso: no se inventa uno
  | 'cerrado' // entregado, cancelado o anulado: no es demanda pendiente (A23)

const ESTADOS_CERRADOS: ReadonlySet<string> = new Set(['ENTREGADO', 'CANCELADO', 'ANULADO'])

export function clasificarCompromiso(
  pedido: { fechaEntrega: Date | string | null; estadoEntrega: string },
  hoyBogota: string,
): ClasificacionCompromiso {
  if (ESTADOS_CERRADOS.has(pedido.estadoEntrega)) return 'cerrado'
  if (!pedido.fechaEntrega) return 'sin_fecha'
  const dia = diaEntregaBogota(new Date(pedido.fechaEntrega))
  if (dia < hoyBogota) return 'arrastrado'
  if (dia > hoyBogota) return 'programado'
  return 'hoy'
}

/** ¿El compromiso ya estaba vencido en `ahora`? Se congela en cada reprogramación (A04/A05). */
export function compromisoVencido(fecha: Date | null, ahora: Date): boolean {
  if (!fecha) return false
  return diaEntregaBogota(fecha) < diaEntregaBogota(ahora)
}
