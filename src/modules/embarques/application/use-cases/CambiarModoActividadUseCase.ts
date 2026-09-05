/**
 * CambiarModoActividadUseCase (N2, AGUA_BAMBU_N2_ALS_v2.0.md §3.2, Caso E).
 *
 * Cambia el modo de una `Actividad` YA existente (creada por
 * `GestionarPendienteUseCase`) ANTES de que se ejecute. Nunca inferido
 * automáticamente — solo desde una acción explícita del usuario.
 *
 *   LOCK OBLIGACION:{actividad.obligacionId}
 *     → leer Actividad (debe estar ASIGNADA o EN_PROGRESO)
 *     → si modo == modoDestino → no-op idempotente
 *     → REVERTIR lo que un cambio de modo anterior hubiera sumado a
 *       Pedido.total (si lo hubo) — nunca queda "flotando" un cargo de un
 *       modo que ya no es el vigente
 *     → recalcular el diferencial FRESCO contra el modo destino (nunca el
 *       valor de un preview mostrado antes — hallazgo adversarial #2 de la
 *       especificación) y aplicarlo con la misma lógica que
 *       GestionarPendienteUseCase (positivo → Pedido.total, negativo →
 *       Cliente.saldoFavor)
 *     → logAudit con modo anterior/nuevo/actor/motivo
 *     → actualizar Actividad.modo
 *     → COMMIT
 *
 * Límite conocido y documentado (MVP): si un cambio ANTERIOR generó un
 * diferencial NEGATIVO (ya acreditado a `Cliente.saldoFavor`, un balance de
 * propósito general), este caso de uso NO lo revierte automáticamente al
 * volver a cambiar de modo — solo revierte lo que quedó reflejado en
 * `Pedido.total` (siempre reversible sin tocar histórico, `chk_pedido_
 * montopagado_le_total` lo garantiza). Reclamar de vuelta un crédito ya
 * fusionado al saldo general del cliente violaría "no autocorregir
 * silenciosamente" (Plan Maestro V11.1 §12) y no es el caso común de la
 * Fase 1 (una sola decisión de modo por gestión). Si el negocio necesita
 * flip-flops repetidos de modo con reversión completa, es un ADR aparte.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { logAudit } from '@/lib/audit'
import { calcularDiferencial } from '../../domain/services/diferencial.service'
import { aplicarConsecuenciaEconomicaDiferencial, revertirDiferencialEnPedido } from '../services/aplicar-diferencial-economico.service'
import type { Canal, ProductCode } from '@/lib/pricing'

export interface CambiarModoActividadInput {
  actividadId: string
  modoDestino: Canal
  actorId: string
  motivo?: string
  offlineId?: string
}

export interface CambiarModoActividadResult {
  actividadId: string
  modoAnterior: Canal
  modoNuevo: Canal
  deduped: boolean
  diferencial?: { valorHistorico: number; valorActual: number; diferencial: number }
}

export class CambiarModoActividadUseCase {
  async execute(input: CambiarModoActividadInput): Promise<CambiarModoActividadResult> {
    const actividad = await this.leerActividad(input.actividadId)
    return withAdvisoryLock('OBLIGACION', actividad.obligacionId, async (tx) => {
      const actual = await tx.actividad.findUniqueOrThrow({
        where: { id: input.actividadId },
        include: { obligacion: { include: { pedido: { include: { items: true } } } } },
      })

      if (actual.estado !== 'ASIGNADA' && actual.estado !== 'EN_PROGRESO') {
        throw new Error(`ACTIVIDAD_NO_MODIFICABLE: estado actual ${actual.estado}`)
      }
      if (!actual.modo) {
        throw new Error('ACTIVIDAD_SIN_MODO: la Actividad no tiene un modo inicial asignado')
      }
      const modoAnterior = actual.modo as Canal

      // No-op idempotente: mismo modo destino, nada que hacer.
      if (modoAnterior === input.modoDestino) {
        return { actividadId: actual.id, modoAnterior, modoNuevo: modoAnterior, deduped: true }
      }

      // Dedup por offlineId — un replay no debe re-aplicar el cambio ni el diferencial dos veces.
      if (input.offlineId) {
        const evento = await tx.pedidoCantidadAjuste.findUnique({
          where: { offlineId: `${input.offlineId}:cambio-modo` },
        })
        if (evento) {
          return { actividadId: actual.id, modoAnterior, modoNuevo: input.modoDestino, deduped: true }
        }
      }

      const obligacion = actual.obligacion
      const pedido = obligacion.pedido
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')
      const item = pedido.items.find((i) => i.producto === obligacion.producto)
      if (!item) throw new Error(`PEDIDO_ITEM_NOT_FOUND: ${obligacion.producto}`)

      // Revertir lo que un cambio de modo ANTERIOR haya sumado a Pedido.total
      // (nunca lo que se acreditó a saldoFavor — ver límite documentado arriba).
      await revertirDiferencialEnPedido(tx, {
        pedidoId: pedido.id,
        obligacionId: obligacion.id,
        producto: obligacion.producto,
        cantidadPendiente: actual.cantidad,
        motivo: `Reversión del diferencial del modo anterior (${modoAnterior}) al cambiar a ${input.modoDestino}`,
        autorizadoPorId: input.actorId,
      })

      // Recalcular FRESCO contra el modo destino — nunca reusar un valor de preview.
      const calculo = await calcularDiferencial({
        producto: obligacion.producto as ProductCode,
        precioHistorico: Number(item.precio),
        cantidadPendiente: actual.cantidad,
        modoDestino: input.modoDestino,
        clienteId: pedido.clienteId,
        negocioId: pedido.negocioId,
      })

      // Se aplica siempre (incluso diferencial === 0) para que quede un
      // PedidoCantidadAjuste anclado al `offlineId` del comando — es la
      // marca de idempotencia de ESTE `CambiarModoActividadUseCase`, no solo
      // del movimiento de dinero.
      await aplicarConsecuenciaEconomicaDiferencial(tx, {
        pedidoId: pedido.id,
        clienteId: pedido.clienteId,
        obligacionId: obligacion.id,
        producto: obligacion.producto,
        cantidadPendiente: actual.cantidad,
        diferencial: calculo.diferencial,
        motivo: input.motivo ?? `Cambio de modo ${modoAnterior} → ${input.modoDestino}`,
        autorizadoPorId: input.actorId,
        offlineId: input.offlineId ? `${input.offlineId}:cambio-modo` : undefined,
      })

      await tx.actividad.update({
        where: { id: actual.id },
        data: { modo: input.modoDestino },
      })

      await logAudit({
        entidad: 'Actividad',
        registroId: actual.id,
        accion: 'UPDATE',
        datos: {
          accion: 'CAMBIAR_MODO',
          modoAnterior,
          modoNuevo: input.modoDestino,
          motivo: input.motivo ?? null,
          diferencial: calculo.diferencial,
        },
        usuarioId: input.actorId,
      }, tx)

      return {
        actividadId: actual.id,
        modoAnterior,
        modoNuevo: input.modoDestino,
        deduped: false,
        diferencial: calculo,
      }
    })
  }

  private async leerActividad(actividadId: string) {
    const { prisma } = await import('@/lib/prisma')
    const actividad = await prisma.actividad.findUnique({ where: { id: actividadId }, select: { obligacionId: true } })
    if (!actividad) throw new Error('ACTIVIDAD_NOT_FOUND')
    return actividad
  }
}
