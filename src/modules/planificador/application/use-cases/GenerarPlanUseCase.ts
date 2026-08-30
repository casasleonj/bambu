/**
 * GenerarPlanUseCase (ADR-PLANIFICADOR-001 §3).
 *
 * Orquesta: cargar datos → construir propuesta (pipeline puro) → persistir como
 * PlanDia PROPOSED. Generación síncrona (evidencia F0: ~4 grupos / ~50 pedidos).
 * Si algo falla, NO se escribe una fila (el estado GENERATING/FAILED es de la API).
 *
 * Lock `PLAN:{fecha}` para que dos generaciones concurrentes de la misma fecha
 * no interleaven sus versiones.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { construirPropuesta } from '../construir-propuesta'
import { PrismaPlanificadorRepository } from '../../infrastructure/PrismaPlanificadorRepository'

export interface GenerarPlanInput {
  fecha: string // YYYY-MM-DD (Bogotá)
  /**
   * Tope de unidades por grupo. La lee el caller (route) vía
   * `getConfigInt('MAX_UNIDADES_EMBARQUE', ...)` — no acá, porque `unstable_cache`
   * no funciona fuera de un request de Next.
   */
  maxUnidades: number
  generadoPorId?: string
  /** 'GENERACION' (default) o 'REPLAN:<trigger>'. */
  causa?: string
}

export interface GenerarPlanResult {
  planId: string
  version: number
  resumen: unknown
  grupos: number
  excepciones: number
}

export class GenerarPlanUseCase {
  constructor(private readonly repo = new PrismaPlanificadorRepository()) {}

  async execute(input: GenerarPlanInput): Promise<GenerarPlanResult> {
    const causa = input.causa ?? 'GENERACION'

    return withAdvisoryLock('PLAN', input.fecha, async () => {
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

      const { id: planId, version } = await this.repo.persistirPropuesta(propuesta, {
        generadoPorId: input.generadoPorId,
        causa,
      })

      return {
        planId,
        version,
        resumen: propuesta.resumen,
        grupos: propuesta.grupos.length,
        excepciones: propuesta.excepciones.length,
      }
    })
  }
}
