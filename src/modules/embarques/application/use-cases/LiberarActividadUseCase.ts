/**
 * LiberarActividadUseCase (N2, AGUA_BAMBU_N2_ALS_v2.0.md §3.5, Caso J).
 *
 * Cancela una gestión de pendiente ANTES de que se ejecute (contrato de
 * "cancelar/liberar" ya descrito en `ADR-OBLIGACION-001`/Plan Maestro V11.1
 * §7, nunca implementado — este es el primer caller real).
 *
 *   LOCK OBLIGACION:{obligacionId}
 *     → dedup por offlineId
 *     → leer Actividad (debe estar ASIGNADA o EN_PROGRESO; si ya está
 *       CANCELADA, dedup por estado; si CUMPLIDA, rechaza)
 *     → revertir lo que un diferencial anterior haya sumado a Pedido.total
 *       (mismo helper que CambiarModoActividadUseCase — nunca reclama lo ya
 *       acreditado a Cliente.saldoFavor)
 *     → Actividad.estado = CANCELADA, embarqueId = null
 *     → ObligacionPendiente.cantidadAsignada -= actividad.cantidad
 *     → si no queda ninguna otra Actividad activa y cantidadCumplida === 0
 *       → ObligacionPendiente.estado = ANULADA
 *     → logAudit
 *     → COMMIT
 *
 * Tras liberar: el remanente vuelve a ser 100% responsabilidad de
 * `Pedido`/`PedidoItem` (nunca cambiaron durante la gestión, `I-4`) — no
 * queda cantidad "atrapada" en una Obligación cancelada.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { logAudit } from '@/lib/audit'
import { revertirDiferencialEnPedido } from '../services/aplicar-diferencial-economico.service'

export interface LiberarActividadInput {
  actividadId: string
  motivo: string
  actorId: string
  offlineId?: string
}

export interface LiberarActividadResult {
  actividadId: string
  obligacionId: string
  obligacionAnulada: boolean
  montoRevertido: number
  deduped: boolean
}

export class LiberarActividadUseCase {
  async execute(input: LiberarActividadInput): Promise<LiberarActividadResult> {
    const ref = await this.leerObligacionId(input.actividadId)
    return withAdvisoryLock('OBLIGACION', ref.obligacionId, async (tx) => {
      // Dedup por offlineId DENTRO del lock — un replay no debe re-liberar
      // ni revertir el diferencial dos veces.
      if (input.offlineId) {
        const marca = await tx.pedidoCantidadAjuste.findUnique({
          where: { offlineId: `${input.offlineId}:liberar` },
        })
        if (marca) {
          return { actividadId: input.actividadId, obligacionId: ref.obligacionId, obligacionAnulada: false, montoRevertido: 0, deduped: true }
        }
      }

      const actual = await tx.actividad.findUniqueOrThrow({
        where: { id: input.actividadId },
        include: { obligacion: { include: { pedido: true } } },
      })

      // Ya liberada por un intento anterior (sin offlineId que hiciera match
      // arriba, p.ej. un doble-click en la UI) — dedup por estado, no error.
      if (actual.estado === 'CANCELADA') {
        return { actividadId: actual.id, obligacionId: actual.obligacionId, obligacionAnulada: actual.obligacion.estado === 'ANULADA', montoRevertido: 0, deduped: true }
      }
      if (actual.estado !== 'ASIGNADA' && actual.estado !== 'EN_PROGRESO') {
        throw new Error(`ACTIVIDAD_NO_MODIFICABLE: estado actual ${actual.estado}`)
      }

      const obligacion = actual.obligacion
      const pedido = obligacion.pedido
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // Revertir lo aplicado a Pedido.total (nunca lo acreditado a saldoFavor
      // — ver nota en CambiarModoActividadUseCase, mismo límite documentado).
      const montoRevertido = await revertirDiferencialEnPedido(tx, {
        pedidoId: pedido.id,
        obligacionId: obligacion.id,
        producto: obligacion.producto,
        cantidadPendiente: actual.cantidad,
        motivo: `Liberar gestión de pendiente: ${input.motivo}`,
        autorizadoPorId: input.actorId,
      })

      await tx.actividad.update({
        where: { id: actual.id },
        data: { estado: 'CANCELADA', embarqueId: null },
      })

      // Decrementar solo la porción de ESTA Actividad que seguía "asignada"
      // (no cumplida) — `actual.cantidadCumplida` es lo que un futuro
      // CumplirActividadUseCase ya habría trasladado del balde "asignada" al
      // balde "cumplida" de la Obligación. Decrementar por `actual.cantidad`
      // completo ignoraría ese traslado y violaría
      // `chk_obligacion_cantidades_no_negativas` en cuanto hay cumplimiento
      // parcial real.
      const cantidadAunAsignada = actual.cantidad - actual.cantidadCumplida
      await tx.obligacionPendiente.update({
        where: { id: obligacion.id },
        data: { cantidadAsignada: { decrement: cantidadAunAsignada } },
      })

      const otrasActivas = await tx.actividad.count({
        where: { obligacionId: obligacion.id, id: { not: actual.id }, estado: { in: ['ASIGNADA', 'EN_PROGRESO'] } },
      })
      let obligacionAnulada = false
      if (otrasActivas === 0 && obligacion.cantidadCumplida === 0) {
        await tx.obligacionPendiente.update({ where: { id: obligacion.id }, data: { estado: 'ANULADA' } })
        obligacionAnulada = true
      }

      if (input.offlineId) {
        await tx.pedidoCantidadAjuste.create({
          data: {
            pedidoId: pedido.id,
            obligacionId: obligacion.id,
            producto: obligacion.producto,
            cantidadOriginal: actual.cantidad,
            cantidadNueva: actual.cantidad,
            delta: 0,
            motivo: 'Marca de idempotencia de LiberarActividadUseCase',
            autorizadoPorId: input.actorId,
            montoDiferencial: 0,
            offlineId: `${input.offlineId}:liberar`,
          },
        })
      }

      await logAudit({
        entidad: 'ObligacionPendiente',
        registroId: obligacion.id,
        accion: 'UPDATE',
        datos: {
          accion: 'LIBERAR_ACTIVIDAD',
          actividadId: actual.id,
          motivo: input.motivo,
          montoRevertido,
          obligacionAnulada,
        },
        usuarioId: input.actorId,
      }, tx)

      return { actividadId: actual.id, obligacionId: obligacion.id, obligacionAnulada, montoRevertido, deduped: false }
    })
  }

  private async leerObligacionId(actividadId: string) {
    const { prisma } = await import('@/lib/prisma')
    const actividad = await prisma.actividad.findUnique({ where: { id: actividadId }, select: { obligacionId: true } })
    if (!actividad) throw new Error('ACTIVIDAD_NOT_FOUND')
    return actividad
  }
}
