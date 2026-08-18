/**
 * Ledger físico — servicios de dominio puros (FASE 2, ADR-FISICO-001).
 *
 * Reglas congeladas (contrato §8, §9):
 * - `cantidad` es SIEMPRE positiva; el efecto se determina por `tipo`, nunca
 *   por el signo de `cantidad`.
 * - `AJUSTE_AUTORIZADO` exige `metadata.effect` (INCREASE|DECREASE) +
 *   `authorization != NULL` + `userId != NULL`. Sin metadata.effect válido el
 *   movimiento se rechaza.
 * - Una sustitución es una operación de negocio que produce DOS movimientos
 *   físicos separados (no un movimiento ambiguo con dos efectos).
 */

import type { TipoMovimiento } from '@prisma/client'

export const CUSTODIAS = [
  'VEHICULO',
  'ALMACEN',
  'INSPECCION',
  'CLIENTE',
  'PRODUCCION',
  'DESCARTE',
  'EXTERNO',
] as const

export type Custodia = (typeof CUSTODIAS)[number]

export interface MovimientoFisicoInput {
  tipo: TipoMovimiento
  producto: string
  cantidad: number
  origen?: string | null
  destino?: string | null
  metadata?: ({ effect?: 'INCREASE' | 'DECREASE' } & Record<string, unknown>) | null
  authorization?: string | null
  userId?: string | null
}

/**
 * Valida un movimiento del ledger físico según el contrato §8.
 * Retorna la lista de errores (vacía si es válido).
 */
export function validarMovimientoFisico(input: MovimientoFisicoInput): string[] {
  const errores: string[] = []

  if (!Number.isInteger(input.cantidad) || input.cantidad <= 0) {
    errores.push('cantidad debe ser un entero positivo')
  }

  if (!input.producto || input.producto.trim() === '') {
    errores.push('producto es obligatorio')
  }

  if (input.tipo === 'AJUSTE_AUTORIZADO') {
    const effect = input.metadata?.effect
    if (effect !== 'INCREASE' && effect !== 'DECREASE') {
      errores.push('AJUSTE_AUTORIZADO exige metadata.effect INCREASE|DECREASE')
    }
    if (!input.authorization) {
      errores.push('AJUSTE_AUTORIZADO exige authorization')
    }
    if (!input.userId) {
      errores.push('AJUSTE_AUTORIZADO exige userId')
    }
  }

  return errores
}

/**
 * Construye los dos movimientos físicos separados de una sustitución
 * (contrato §9). El ejemplo del contrato usa "RECEPCION_DEFECTUOSA"
 * (repartidor → inspección), que coincide con el tipo RETORNO de la tabla
 * obligatoria §8 (RETORNO = - custodia del repartidor, + custodia de
 * inspección). El motivo defectuoso se registra en metadata.
 */
export function construirMovimientosSustitucion(input: {
  producto: string
  cantidad: number
}): { recepcion: MovimientoFisicoInput; entrega: MovimientoFisicoInput } {
  return {
    recepcion: {
      tipo: 'RETORNO',
      producto: input.producto,
      cantidad: input.cantidad,
      origen: 'VEHICULO',
      destino: 'INSPECCION',
      metadata: { motivo: 'DEFECTUOSA' },
    },
    entrega: {
      tipo: 'ENTREGA',
      producto: input.producto,
      cantidad: input.cantidad,
      origen: 'VEHICULO',
      destino: 'CLIENTE',
    },
  }
}
