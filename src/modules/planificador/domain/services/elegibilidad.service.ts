/**
 * Elegibilidad de pedidos para el plan de una fecha (ADR-PLANIFICADOR-002 §1).
 *
 * Rutas NO inventa reglas de Pedidos: consume `estadoEntrega`, `embarqueId`,
 * `canal`, `origen`, `fecha`. `NO_ENTREGADO` no vuelve solo a `PENDIENTE`
 * (lo maneja Ejecución); si Ejecución lo reprograma con fecha <= F, entra.
 *
 * `wherePedidosElegiblesPlan` es el filtro Prisma (lado servidor).
 * `esPedidoElegible` es el predicado puro (para tests y doble-check en memoria).
 */

import type { Prisma } from '@prisma/client'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import { startOfDayBogota, endOfDayBogota } from '@/lib/dates'

const CANALES_PLANIFICABLES = ['DOMICILIO'] as const
const ORIGENES_PLANIFICABLES = ['PEDIDO', 'RECURRENTE', 'VENTA_RAPIDA'] as const

/**
 * Filtro Prisma para "pedidos elegibles para el plan de `fecha`".
 * `fecha` en formato YYYY-MM-DD (Bogotá).
 */
export function wherePedidosElegiblesPlan(fecha: string): Prisma.PedidoWhereInput {
  return {
    estadoEntrega: { in: ['PENDIENTE', 'NO_ENTREGADO'] },
    embarqueId: null,
    canal: { in: [...CANALES_PLANIFICABLES] },
    origen: { in: [...ORIGENES_PLANIFICABLES] },
    // fecha-elegible(F): el pedido no es de una fecha futura > F.
    fecha: { lte: endOfDayBogota(fecha) },
    // Excluir venta anónima sin dirección propia.
    NOT: {
      AND: [
        { clienteId: CANONICAL_CONSUMIDOR_FINAL_ID },
        { direccionEntrega: null },
        { negocioId: null },
      ],
    },
  }
}

export interface PedidoElegibleInput {
  estadoEntrega: string
  embarqueId: string | null
  canal: string
  origen: string
  fecha: Date | string
  clienteId: string
  direccionEntrega?: string | null
  negocioId?: string | null
}

/** Predicado puro. `fecha` YYYY-MM-DD (Bogotá). */
export function esPedidoElegible(p: PedidoElegibleInput, fecha: string): boolean {
  if (!['PENDIENTE', 'NO_ENTREGADO'].includes(p.estadoEntrega)) return false
  if (p.embarqueId) return false
  if (!(CANALES_PLANIFICABLES as readonly string[]).includes(p.canal)) return false
  if (!(ORIGENES_PLANIFICABLES as readonly string[]).includes(p.origen)) return false

  const f = typeof p.fecha === 'string' ? new Date(p.fecha) : p.fecha
  if (f.getTime() > endOfDayBogota(fecha).getTime()) return false

  const esAnonimoSinDireccion =
    p.clienteId === CANONICAL_CONSUMIDOR_FINAL_ID &&
    !p.direccionEntrega &&
    !p.negocioId
  if (esAnonimoSinDireccion) return false

  return true
}

/** Rango [inicio, fin] del día operativo, útil para queries auxiliares. */
export function rangoDia(fecha: string): { gte: Date; lte: Date } {
  return { gte: startOfDayBogota(fecha), lte: endOfDayBogota(fecha) }
}
