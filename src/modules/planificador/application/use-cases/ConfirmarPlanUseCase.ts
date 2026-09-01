/**
 * ConfirmarPlanUseCase (ADR-PLANIFICADOR-001 §4, -003, -005 §4).
 *
 *   PROPOSED|REVIEW → CONFIRMED  (chequeo de expectedVersion + idempotencyKey)
 *   → MaterializarPlanUseCase (crea embarques)
 *   → si algún grupo falló: estado INTEGRATION_PARTIAL (reintentable)
 *
 * Lock `PLAN:{fecha}` para serializar con generar/replan/otro confirmar.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { prisma } from '@/lib/prisma'
import { PrismaPlanificadorRepository } from '../../infrastructure/PrismaPlanificadorRepository'
import { MaterializarPlanUseCase, type MaterializarResultado } from './MaterializarPlanUseCase'

export interface ConfirmarPlanInput {
  planId: string
  expectedVersion: number
  maxUnidades: number
  userId?: string
  /** Clave idempotente del confirmar (ADR-PLANIFICADOR-005 §4). */
  idempotencyKey?: string
}

export interface ConfirmarPlanResult {
  estado: 'CONFIRMED' | 'INTEGRATION_PARTIAL'
  deduped: boolean
  materializacion: MaterializarResultado
}

export class ConfirmarPlanUseCase {
  constructor(
    private readonly repo = new PrismaPlanificadorRepository(),
    private readonly materializar = new MaterializarPlanUseCase(),
  ) {}

  async execute(input: ConfirmarPlanInput): Promise<ConfirmarPlanResult> {
    const plan = await prisma.planDia.findUnique({
      where: { id: input.planId },
      select: { fecha: true, estado: true },
    })
    if (!plan) throw new Error('PLAN_NOT_FOUND')
    const fechaKey = plan.fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

    // El lock PLAN solo protege la transición de estado (rápida). La
    // materialización usa el lock EMBARQUE_CARGA por grupo — NO puede anidarse
    // dentro de otra transacción de lock. Se corre fuera del lock PLAN.
    //
    // Concurrencia: tras la transición el estado es CONFIRMED; un confirmar
    // concurrente ve `desde` = [PROPOSED, REVIEW, INTEGRATION_PARTIAL] y falla
    // con ESTADO_INVALIDO. El retry idempotente entra por `confirmOfflineId`.
    const { deduped } = await withAdvisoryLock('PLAN', fechaKey, () =>
      this.repo.transicionar({
        id: input.planId,
        expectedVersion: input.expectedVersion,
        desde: ['PROPOSED', 'REVIEW', 'INTEGRATION_PARTIAL'],
        hacia: 'CONFIRMED',
        userId: input.userId,
        confirmOfflineId: input.idempotencyKey,
      }),
    )

    const materializacion = await this.materializar.execute({
      planId: input.planId,
      version: input.expectedVersion,
      maxUnidades: input.maxUnidades,
      createdById: input.userId,
    })

    const estadoFinal = materializacion.completo ? 'CONFIRMED' : 'INTEGRATION_PARTIAL'
    if (!materializacion.completo) {
      await this.repo.marcarEstado(input.planId, 'INTEGRATION_PARTIAL')
    }

    return { estado: estadoFinal, deduped, materializacion }
  }
}
