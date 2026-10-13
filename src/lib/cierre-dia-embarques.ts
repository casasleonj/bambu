/**
 * Predicado ÚNICO de "embarque pendiente para el cierre del día".
 *
 * ALS AB-ALS-EMB-2026-10-13 §7 (T-05) / invariante I-15: `GET /api/cierre`
 * (que decide COMPLETO/INCOMPLETO) y `POST /api/cierre` (que rechaza el cierre
 * con `EMBARQUES_ABIERTOS`) deben usar exactamente la misma regla. Antes el GET
 * solo miraba `ABIERTO` y el POST `ABIERTO | EN_RUTA`: un día con un embarque
 * `EN_RUTA` se mostraba como `COMPLETO` y el POST lo rechazaba después.
 *
 * `CERRADO` y `CANCELADO` no son pendientes.
 */

import { EstadoEmbarque, type Prisma } from '@prisma/client'

export const ESTADOS_EMBARQUE_PENDIENTES_CIERRE_DIA = [
  EstadoEmbarque.ABIERTO,
  EstadoEmbarque.EN_RUTA,
] as const

/** `where` de Prisma para los embarques del rango de fechas que impiden cerrar el día. */
export function whereEmbarquesPendientesCierreDia(rango: {
  gte: Date
  lt: Date
}): Prisma.EmbarqueWhereInput {
  return {
    fecha: rango,
    estado: { in: [...ESTADOS_EMBARQUE_PENDIENTES_CIERRE_DIA] },
  }
}
