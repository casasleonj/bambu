/**
 * Fachada legacy de utilidades de pedido.
 *
 * F2 (docs/pedidos/INVENTARIO_PEDIDOS_OPERACION_COMERCIAL.md §F2): este
 * archivo NO define máquinas de estado. La lógica canónica de transiciones
 * y badges vive en el dominio de pedidos:
 *   - `src/modules/pedidos/domain/value-objects/EstadoEntrega.ts` / `EstadoPago.ts`
 *   - `src/modules/pedidos/domain/services/pedido-transitions.service.ts`
 *
 * Acá solo se re-exporta para consumidores legacy fuera de `src/modules`,
 * más un puñado de helpers de negocio que aún no tienen equivalente en el
 * dominio (fiados, alertas del día).
 */

import {
  TRANSICIONES_ENTREGA,
  TRANSICIONES_PAGO,
  puedeTransicionarEntrega,
  puedeTransicionarPago,
  legacyToNewState,
  getBadgeEntrega,
  getBadgePago,
  getBadgeOrigen,
  type BadgeInfo,
} from '@/modules/pedidos/domain/services/pedido-transitions.service'
import { EstadoPagoVO } from '@/modules/pedidos/domain/value-objects/EstadoPago'
import {
  resolverLimiteFiados,
  puedeCrearPedido as puedeCrearPedidoDominio,
  puedeFiar,
  getEstadoFiados,
  getAlertaPedidoDia,
} from '@/modules/pedidos/domain/services/pedido-validation.service'
import type { EstadoPago } from '@prisma/client'
import { LIMITE_FIADOS_DEFAULT } from './constants'

// ====================
// RE-EXPORTS DEL DOMINIO (fuente única de verdad)
// ====================

export {
  TRANSICIONES_ENTREGA,
  TRANSICIONES_PAGO,
  puedeTransicionarEntrega,
  puedeTransicionarPago,
  legacyToNewState,
  getBadgeEntrega,
  getBadgePago,
  getBadgeOrigen,
  // FIX MEDIUM (C-VAL-7): límite de fiados con fallback consistente (dominio).
  resolverLimiteFiados,
  // FIX consolidacion-credito (docs/AGUA_BAMBU_INTEGRIDAD_COMERCIAL_CONVERGENCIA_v1.0.md
  // §1): antes eran copias byte-a-byte de pedido-validation.service.ts —
  // riesgo de que una corrección se aplique a una copia y no a la otra.
  // Firma idéntica a la del dominio, re-export directo.
  puedeFiar,
  getEstadoFiados,
  getAlertaPedidoDia,
}
export type { BadgeInfo }

// ====================
// CÁLCULOS (delegan al dominio; firma legacy number→string)
// ====================

/**
 * Estado de pago proyectado desde `(total, totalPagado, estadoEntrega)`. Delega
 * en `EstadoPagoVO.proyectar` (F2/G5.1: sin lógica duplicada). `estadoEntrega`
 * default `'ENTREGADO'` preserva el comportamiento legacy.
 */
export function calcularEstadoPago(
  total: number,
  totalPagado: number,
  estadoEntrega: string = 'ENTREGADO',
): EstadoPago {
  return EstadoPagoVO.proyectar(total, totalPagado, estadoEntrega).get() as EstadoPago
}

export function calcularSaldo(total: number, totalPagado: number): number {
  return Math.max(0, total - totalPagado)
}

/**
 * Decide si un pedido acaba de "culminar" (entregado + pagado en su
 * totalidad) — usado para disparar PEDIDO_CULMINADO desde dos endpoints
 * mutuamente excluyentes (entrega/route.ts y pagar-fiado/route.ts).
 *
 * Ambos call sites solo invocan esto sobre una transición RECIÉN ocurrida
 * (nunca sobre un estado "ya así desde antes"): el use case de entrega corta
 * temprano si el pedido ya estaba ENTREGADO, y el query FIFO de pagar-fiado
 * solo trae pedidos con saldo > 0 (nunca ya PAGADO). Por construcción, un
 * `true` acá es siempre una transición fresca.
 */
export function shouldFireCulminado(
  estadoEntrega: string,
  estadoPago: string,
): boolean {
  return estadoEntrega === 'ENTREGADO' && estadoPago === 'PAGADO'
}

// ====================
// BADGES — solo el helper legacy sin equivalente en el dominio
// ====================

export function getBadgeLegacy(estado: string): { label: string; className: string } {
  const conocidos = ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'CANCELADO', 'ANULADO']
  if (conocidos.includes(estado)) {
    return getBadgeEntrega(estado as Parameters<typeof getBadgeEntrega>[0])
  }
  return { label: estado, className: 'bg-gray-100 text-gray-600' }
}

// ====================
// VALIDACIONES DE NEGOCIO (fiados / alertas — delegan al dominio)
// ====================

/**
 * Verifica si un cliente puede crear nuevos pedidos.
 * Retorna null si puede, o un string con el mensaje de error.
 *
 * FIX consolidacion-credito: delega en `pedido-validation.service.ts`. Firma
 * legacy más angosta (`{ bloqueado, id }`) porque algunos callers legacy no
 * tienen el Cliente completo a mano; la función del dominio no usa
 * `verificado`/`creadoPorRol` en esta regla (solo bloqueado/id/pendientes/
 * límite) — completar esos dos campos con un valor dummy es seguro y no
 * cambia el resultado.
 */
export function puedeCrearPedido(
  cliente: {
    bloqueado: boolean
    id: string
  },
  pedidosPendientes: Array<{ id: string; numero: number; saldo: number }>,
  limite: number = LIMITE_FIADOS_DEFAULT,
): string | null {
  return puedeCrearPedidoDominio(
    { ...cliente, verificado: false, creadoPorRol: '' },
    pedidosPendientes,
    limite,
  )
}
