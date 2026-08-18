/**
 * AsignarActividadUseCase (FASE 3, ADR-OBLIGACION-001 / ADR-ACTIVIDAD-001).
 *
 * Incrementa `cantidadAsignada` de una ObligacionPendiente y crea una
 * Actividad, todo bajo el lock `OBLIGACION:{obligacionId}` (contrato §7):
 *
 *   LOCK(obligacionId) → leer → calcular disponible → validar → actualizar
 *   → crear Actividad → COMMIT
 *
 * Idempotencia (34C): un retry con el mismo `offlineId` retorna la Actividad
 * existente sin duplicar ni sobre-asignar.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { validarAsignacion } from '../../domain/services/obligacion.service'
import { incrementMetric } from '@/lib/metrics'
import type { ActividadTipo } from '@prisma/client'

export interface AsignarActividadInput {
  obligacionId: string
  producto: string
  cantidad: number
  embarqueId?: string
  tipo?: ActividadTipo
  offlineId?: string
}

export interface AsignarActividadResult {
  actividadId: string
  deduped: boolean
}

export class AsignarActividadUseCase {
  async execute(input: AsignarActividadInput): Promise<AsignarActividadResult> {
    return withAdvisoryLock('OBLIGACION', input.obligacionId, async (tx) => {
      // 34C: dedup por offlineId DENTRO del lock.
      if (input.offlineId) {
        const existente = await tx.actividad.findUnique({
          where: { offlineId: input.offlineId },
        })
        if (existente) {
          return { actividadId: existente.id, deduped: true }
        }
      }

      const obligacion = await tx.obligacionPendiente.findUnique({
        where: { id: input.obligacionId },
      })
      if (!obligacion) {
        throw new Error('OBLIGACION_NOT_FOUND')
      }

      const errores = validarAsignacion({
        cantidadOriginal: obligacion.cantidadOriginal,
        cantidadCumplida: obligacion.cantidadCumplida,
        cantidadAsignada: obligacion.cantidadAsignada,
        cantidadNueva: input.cantidad,
      })
      if (errores.length > 0) {
        if (errores.some((e) => e.includes('SOBRECONSUMO'))) {
          // Métrica §24: doble cumplimiento de una obligación rechazado.
          incrementMetric('obligacion_double_fulfillment_rejected_count')
        }
        throw new Error(errores.join('; '))
      }

      await tx.obligacionPendiente.update({
        where: { id: input.obligacionId },
        data: { cantidadAsignada: { increment: input.cantidad } },
      })

      const actividad = await tx.actividad.create({
        data: {
          obligacionId: input.obligacionId,
          embarqueId: input.embarqueId ?? null,
          tipo: input.tipo ?? 'ENTREGA',
          cantidad: input.cantidad,
          offlineId: input.offlineId ?? null,
        },
      })

      return { actividadId: actividad.id, deduped: false }
    })
  }
}
