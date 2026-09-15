/**
 * ReprogramarObligacionPendienteUseCase (F4, Plan Maestro §61 "reprogramación").
 *
 * Cambia la fecha objetivo de cumplimiento de una `ObligacionPendiente`
 * (remanente) ya existente. Decisiones del equipo (verbatim):
 *
 *   PEDIDO ORIGINAL → REMANENTE → fecha prevista actual → REPROGRAMAR
 *     → nueva fecha prevista
 *
 * Mismo Pedido, misma ObligacionPendiente — NUNCA crea un Pedido nuevo ni
 * otra ObligacionPendiente. NO asigna automáticamente a un plan/ruta futuro
 * (eso es responsabilidad posterior del Planificador, fuera de este caso de
 * uso — no importa nada de `src/modules/planificador/`). Un remanente ya
 * `CUMPLIDA`/`ANULADA` no es "pendiente" y no se puede reprogramar por esta
 * vía.
 *
 * Señales de "vencida"/"reprogramaciones repetidas" son informativas — se
 * devuelven en el resultado, nunca bloquean la operación ni se convierten
 * automáticamente en una conclusión de fraude/responsabilidad.
 *
 * Lock `OBLIGACION:{obligacionId}` — mismo namespace y mismo agregado que
 * `CambiarModoActividadUseCase` (reutilizado, no inventado): garantiza
 * "primera transición gana" ante dos reprogramaciones concurrentes.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { logAudit } from '@/lib/audit'

export class ObligacionNotFoundError extends Error {
  constructor(id: string) {
    super(`OBLIGACION_NOT_FOUND: ${id}`)
    this.name = 'ObligacionNotFoundError'
  }
}

export class ObligacionNoReprogramableError extends Error {
  constructor(estado: string) {
    super(`OBLIGACION_NO_REPROGRAMABLE: estado actual ${estado}`)
    this.name = 'ObligacionNoReprogramableError'
  }
}

export interface ReprogramarObligacionPendienteInput {
  obligacionId: string
  fechaNueva: Date
  actorId: string
  motivo?: string
  offlineId?: string
}

export interface ReprogramarObligacionPendienteResult {
  obligacionId: string
  fechaAnterior: Date | null
  fechaNueva: Date
  /** Conteo TOTAL de reprogramaciones tras esta operación — informativo, nunca bloquea. */
  vecesReprogramada: number
  /** fechaNueva < ahora — informativo, nunca bloquea. */
  fechaVencida: boolean
  deduped: boolean
}

export class ReprogramarObligacionPendienteUseCase {
  async execute(input: ReprogramarObligacionPendienteInput): Promise<ReprogramarObligacionPendienteResult> {
    return withAdvisoryLock('OBLIGACION', input.obligacionId, async (tx) => {
      if (input.offlineId) {
        const existente = await tx.obligacionPendienteReprogramacion.findUnique({
          where: { offlineId: input.offlineId },
          include: { obligacion: { include: { reprogramaciones: true } } },
        })
        if (existente) {
          return {
            obligacionId: existente.obligacionId,
            fechaAnterior: existente.fechaAnterior,
            fechaNueva: existente.fechaNueva,
            vecesReprogramada: existente.obligacion.reprogramaciones.length,
            fechaVencida: existente.fechaNueva < new Date(),
            deduped: true,
          }
        }
      }

      const obligacion = await tx.obligacionPendiente.findUnique({
        where: { id: input.obligacionId },
      })
      if (!obligacion) {
        throw new ObligacionNotFoundError(input.obligacionId)
      }
      if (obligacion.estado !== 'ABIERTA') {
        throw new ObligacionNoReprogramableError(obligacion.estado)
      }

      const fechaAnterior = obligacion.fechaObjetivo

      await tx.obligacionPendienteReprogramacion.create({
        data: {
          obligacionId: obligacion.id,
          fechaAnterior,
          fechaNueva: input.fechaNueva,
          motivo: input.motivo,
          reprogramadoPorId: input.actorId,
          offlineId: input.offlineId,
        },
      })

      // Única mutación sobre la obligación — no toca cantidades/estado/Pedido/Actividad.
      await tx.obligacionPendiente.update({
        where: { id: obligacion.id },
        data: { fechaObjetivo: input.fechaNueva },
      })

      const vecesReprogramada = await tx.obligacionPendienteReprogramacion.count({
        where: { obligacionId: obligacion.id },
      })

      await logAudit({
        entidad: 'ObligacionPendiente',
        registroId: obligacion.id,
        accion: 'UPDATE',
        datos: {
          reprogramacion: true,
          fechaAnterior,
          fechaNueva: input.fechaNueva,
          motivo: input.motivo ?? null,
          vecesReprogramada,
        },
        usuarioId: input.actorId,
      }, tx)

      return {
        obligacionId: obligacion.id,
        fechaAnterior,
        fechaNueva: input.fechaNueva,
        vecesReprogramada,
        fechaVencida: input.fechaNueva < new Date(),
        deduped: false,
      }
    })
  }
}
