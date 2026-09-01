/**
 * OverridePlanUseCase (ADR-PLANIFICADOR-001 §4 "revisión humana", -005 §4).
 *
 * Ediciones manuales del plan durante PROPOSED/REVIEW, **in situ** (no crean
 * versión — la versión sube solo en replan/confirm). Concurrencia por lock
 * optimista sobre `updatedAt` (mismo patrón que `PUT /api/rutas`).
 *
 * Ops soportadas en el MVP:
 *   - moverPedido:       pedidoId → grupo destino
 *   - asignarRepartidor: grupo → trabajadorFinalId
 *   - resolverExcepcion: excepcionId → RESUELTA | IGNORADA
 *
 * Todo override queda en `logAudit` (lo hace el route).
 */

import { withAdvisoryLock } from '@/lib/locks'
import { prisma } from '@/lib/prisma'

export type OverrideOp =
  | { tipo: 'moverPedido'; pedidoId: string; grupoDestinoId: string }
  | { tipo: 'moverParada'; paradaId: string; grupoDestinoId: string }
  | { tipo: 'asignarRepartidor'; grupoId: string; trabajadorId: string | null }
  | { tipo: 'resolverExcepcion'; excepcionId: string; resolucion: 'RESUELTA' | 'IGNORADA' }

export interface OverridePlanInput {
  planId: string
  /** ISO string de `PlanDia.updatedAt` que el cliente tenía. */
  expectedUpdatedAt: string
  op: OverrideOp
  actorId?: string
}

const EDITABLE = ['PROPOSED', 'REVIEW']

export class OverridePlanUseCase {
  async execute(input: OverridePlanInput): Promise<{ ok: true }> {
    const plan = await prisma.planDia.findUnique({
      where: { id: input.planId },
      select: { id: true, estado: true, updatedAt: true, fecha: true },
    })
    if (!plan) throw new Error('PLAN_NOT_FOUND')
    if (!EDITABLE.includes(plan.estado)) throw new Error('ESTADO_INVALIDO')
    if (plan.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error('VERSION_CONFLICT')

    const fechaKey = plan.fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

    await withAdvisoryLock('PLAN', fechaKey, async () => {
      // Re-chequear updatedAt dentro del lock (TOCTOU).
      const fresh = await prisma.planDia.findUnique({
        where: { id: input.planId },
        select: { updatedAt: true, estado: true },
      })
      if (!fresh || !EDITABLE.includes(fresh.estado)) throw new Error('ESTADO_INVALIDO')
      if (fresh.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error('VERSION_CONFLICT')

      switch (input.op.tipo) {
        case 'asignarRepartidor': {
          await prisma.planGrupo.update({
            where: { id: input.op.grupoId },
            data: { trabajadorFinalId: input.op.trabajadorId },
          })
          break
        }
        case 'resolverExcepcion': {
          await prisma.planExcepcion.update({
            where: { id: input.op.excepcionId },
            data: { estado: input.op.resolucion, resueltaPorId: input.actorId ?? null },
          })
          break
        }
        case 'moverPedido': {
          await this.moverPedido(input.planId, input.op.pedidoId, input.op.grupoDestinoId)
          break
        }
        case 'moverParada': {
          const parada = await prisma.planParada.findFirst({
            where: { id: input.op.paradaId, planGrupo: { planDiaId: input.planId } },
            select: { actividades: { where: { tipo: 'ENTREGA' }, select: { pedidoIds: true } } },
          })
          if (!parada) throw new Error('PARADA_NO_EN_PLAN')
          const pedidoIds = parada.actividades.flatMap((a) => a.pedidoIds)
          for (const pid of pedidoIds) {
            await this.moverPedido(input.planId, pid, input.op.grupoDestinoId)
          }
          break
        }
      }

      // Tocar el plan para invalidar el expectedUpdatedAt de otros clientes.
      await prisma.planDia.update({ where: { id: input.planId }, data: { causa: 'OVERRIDE' } })
    })

    return { ok: true }
  }

  private async moverPedido(planId: string, pedidoId: string, grupoDestinoId: string): Promise<void> {
    // Encontrar la actividad que contiene el pedido.
    const acts = await prisma.planActividad.findMany({
      where: { tipo: 'ENTREGA', pedidoIds: { has: pedidoId }, planParada: { planGrupo: { planDiaId: planId } } },
      select: { id: true, pedidoIds: true, snapshotCantidades: true, planParada: { select: { id: true, clienteId: true, negocioId: true, ubicacionUsada: true, planGrupoId: true } } },
    })
    const act = acts[0]
    if (!act) throw new Error('PEDIDO_NO_EN_PLAN')
    if (act.planParada.planGrupoId === grupoDestinoId) return // ya está ahí

    const destino = await prisma.planGrupo.findFirst({
      where: { id: grupoDestinoId, planDiaId: planId },
      select: { id: true },
    })
    if (!destino) throw new Error('GRUPO_DESTINO_INVALIDO')

    await prisma.$transaction(async (tx) => {
      // Quitar el pedido de su actividad de origen.
      const restantes = act.pedidoIds.filter((p) => p !== pedidoId)
      if (restantes.length === 0) {
        // La actividad queda vacía → borrarla; si la parada queda sin actividades, borrarla.
        await tx.planActividad.delete({ where: { id: act.id } })
        const hermanas = await tx.planActividad.count({ where: { planParadaId: act.planParada.id } })
        if (hermanas === 0) await tx.planParada.delete({ where: { id: act.planParada.id } })
      } else {
        await tx.planActividad.update({ where: { id: act.id }, data: { pedidoIds: restantes } })
      }

      // Buscar/crear parada del mismo cliente en el grupo destino.
      let paradaDestino = await tx.planParada.findFirst({
        where: { planGrupoId: grupoDestinoId, clienteId: act.planParada.clienteId, negocioId: act.planParada.negocioId },
        select: { id: true },
      })
      if (!paradaDestino) {
        const maxSeq = await tx.planParada.aggregate({ where: { planGrupoId: grupoDestinoId }, _max: { secuencia: true } })
        paradaDestino = await tx.planParada.create({
          data: {
            planGrupoId: grupoDestinoId,
            secuencia: (maxSeq._max.secuencia ?? -1) + 1,
            clienteId: act.planParada.clienteId,
            negocioId: act.planParada.negocioId,
            ubicacionUsada: act.planParada.ubicacionUsada ?? undefined,
            motivo: 'OVERRIDE_MANUAL',
          },
          select: { id: true },
        })
      }

      // Agregar el pedido a una actividad ENTREGA de la parada destino.
      const actDestino = await tx.planActividad.findFirst({
        where: { planParadaId: paradaDestino.id, tipo: 'ENTREGA' },
        select: { id: true, pedidoIds: true },
      })
      const snap = (act.snapshotCantidades ?? {}) as Record<string, number>
      if (actDestino) {
        await tx.planActividad.update({
          where: { id: actDestino.id },
          data: { pedidoIds: [...actDestino.pedidoIds, pedidoId] },
        })
      } else {
        await tx.planActividad.create({
          data: { planParadaId: paradaDestino.id, tipo: 'ENTREGA', pedidoIds: [pedidoId], snapshotCantidades: snap },
        })
      }
    })
  }
}
