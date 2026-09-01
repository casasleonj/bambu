/**
 * ReplanUseCase (ADR-PLANIFICADOR-005 §1, §3).
 *
 * Recalcula la propuesta de una fecha y la persiste como versión N+1 en estado
 * **REVIEW** (el motor NO auto-aplica — el humano confirma). Guarda el diff
 * legible contra la versión vigente. La versión vigente pasa a SUPERSEDED.
 *
 * No se puede replanificar un plan ya CONFIRMED/INTEGRATION_PARTIAL (esos ya
 * tienen embarques): primero se cancela el plan o se opera sobre los embarques.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { construirPropuesta } from '../construir-propuesta'
import { diffPlanes, toSnapshotLite, type PlanDiff } from '../../domain/services/diff.service'
import { PrismaPlanificadorRepository } from '../../infrastructure/PrismaPlanificadorRepository'

export interface ReplanInput {
  fecha: string
  maxUnidades: number
  actorId?: string
  /** Qué disparó la replanificación: 'MANUAL' | 'NUEVO_PEDIDO' | 'CANCELACION' | ... */
  trigger?: string
}

export interface ReplanResult {
  planId: string
  version: number
  estado: 'REVIEW'
  diff: PlanDiff
  resumen: unknown
}

export class ReplanUseCase {
  constructor(private readonly repo = new PrismaPlanificadorRepository()) {}

  async execute(input: ReplanInput): Promise<ReplanResult> {
    const trigger = input.trigger ?? 'MANUAL'

    return withAdvisoryLock('PLAN', input.fecha, async () => {
      const vigente = await this.repo.obtenerVigentePorFecha(input.fecha)
      if (!vigente) throw new Error('SIN_PLAN_VIGENTE')
      if (['CONFIRMED', 'INTEGRATION_PARTIAL'].includes(vigente.estado)) {
        throw new Error('PLAN_YA_CONFIRMADO')
      }

      const [datos, grupoAnteriorPorPedido] = await Promise.all([
        this.repo.cargarDatos(input.fecha),
        this.repo.grupoAnteriorPorPedido(input.fecha),
      ])

      const propuesta = construirPropuesta({
        fecha: input.fecha,
        candidatos: datos.candidatos,
        repartidoresDisponibles: datos.repartidoresDisponibles,
        maxUnidades: input.maxUnidades,
        nombresRuta: datos.nombresRuta,
        grupoAnteriorPorPedido,
      })

      // Diff contra la versión vigente.
      const anteriorLite = toSnapshotLite({
        grupos: vigente.grupos.map((g) => ({
          nombreLogico: g.nombreLogico,
          trabajadorPropuestoId: g.trabajadorPropuestoId,
          paradas: g.paradas.map((p) => ({
            clienteId: p.clienteId,
            actividades: p.actividades.map((a) => ({ pedidoIds: a.pedidoIds })),
          })),
        })),
      })
      const diff = diffPlanes(anteriorLite, toSnapshotLite(propuesta))

      const { id, version } = await this.repo.persistirPropuesta(propuesta, {
        generadoPorId: input.actorId,
        causa: `REPLAN:${trigger}`,
        estado: 'REVIEW',
        diff,
      })

      return { planId: id, version, estado: 'REVIEW', diff, resumen: propuesta.resumen }
    })
  }
}
