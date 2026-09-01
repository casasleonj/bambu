/**
 * MaterializarPlanUseCase (ADR-PLANIFICADOR-003).
 *
 * Frontera Planificador → Embarques. Por cada PlanGrupo sin embarque:
 *   1. carga = suma de snapshotCantidades de sus actividades tipo=ENTREGA
 *   2. CrearEmbarqueUseCase (EXISTENTE — no se toca el dominio congelado)
 *   3. asignar los pedidos → estado EN_RUTA (mismo patrón que /api/embarques/auto)
 *   4. PlanGrupo.embarqueId = embarque creado
 *
 * Idempotente: offlineId = hash(planId, version, grupoId). Fallo parcial → saga
 * simple: los grupos ya materializados quedan; el confirmar es reintentable.
 */

import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'
import { CrearEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CrearEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTrabajadorEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaTrabajadorEmbarqueRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { StockValidator } from '@/modules/embarques/infrastructure/stock/StockValidator'
import { PrismaPlanificadorRepository } from '../../infrastructure/PrismaPlanificadorRepository'
import type { Producto } from '../../domain/services/capacidad.service'

export interface MaterializarPlanInput {
  planId: string
  version: number
  maxUnidades: number
  createdById?: string
}

export interface MaterializarResultado {
  creados: Array<{ grupoId: string; embarqueId: string; numero: number; pedidos: number }>
  fallidos: Array<{ grupoId: string; nombre: string; error: string }>
  completo: boolean
}

function offlineIdGrupo(planId: string, version: number, grupoId: string): string {
  return createHash('sha256').update(`plan:${planId}:${version}:${grupoId}`).digest('hex').slice(0, 32)
}

function horaSalidaToDate(fecha: string, hhmm: string | null): Date | undefined {
  if (!hhmm) return undefined
  const d = new Date(`${fecha}T${hhmm}:00-05:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export class MaterializarPlanUseCase {
  constructor(private readonly planRepo = new PrismaPlanificadorRepository()) {}

  private buildUseCase() {
    return new CrearEmbarqueUseCase(
      new PrismaEmbarqueRepository(),
      new PrismaTrabajadorEmbarqueRepository(),
      new StockValidator(),
      new PrismaEmbarqueProductoRepository(),
      new PrismaTransactionManager(),
    )
  }

  async execute(input: MaterializarPlanInput): Promise<MaterializarResultado> {
    const grupos = await this.planRepo.gruposParaMaterializar(input.planId)
    const plan = await prisma.planDia.findUnique({
      where: { id: input.planId },
      select: { fecha: true },
    })
    const fechaStr = plan
      ? plan.fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

    const useCase = this.buildUseCase()
    const creados: MaterializarResultado['creados'] = []
    const fallidos: MaterializarResultado['fallidos'] = []

    for (const g of grupos) {
      if (g.embarqueId) continue // ya materializado (reintento)

      const actividades = g.paradas.flatMap((p) => p.actividades).filter((a) => a.tipo === 'ENTREGA')
      const pedidoIds = [...new Set(actividades.flatMap((a) => a.pedidoIds))]
      if (pedidoIds.length === 0) continue

      // carga agregada desde los snapshots.
      const carga: Record<Producto, number> = {
        PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0,
      }
      for (const a of actividades) {
        const snap = (a.snapshotCantidades ?? {}) as Partial<Record<Producto, number>>
        for (const k of Object.keys(carga) as Producto[]) carga[k] += snap[k] ?? 0
      }

      const trabajadorId = g.trabajadorFinalId ?? g.trabajadorPropuestoId
      if (!trabajadorId) {
        fallidos.push({ grupoId: g.id, nombre: g.nombreLogico, error: 'Sin repartidor asignado' })
        continue
      }

      try {
        const result = await useCase.execute({
          trabajadorId,
          rutaId: g.rutaId ?? undefined,
          carga,
          baseDinero: 0,
          horaSalida: horaSalidaToDate(fechaStr, g.horaSalidaPropuesta),
          obs: `Plan ${input.planId} — ${g.nombreLogico}`,
          createdById: input.createdById,
          verificarStock: true,
          maxUnidades: input.maxUnidades,
          offlineId: offlineIdGrupo(input.planId, input.version, g.id),
        })

        // Verificar que los pedidos siguen libres antes de asignarlos.
        const libres = await prisma.pedido.findMany({
          where: { id: { in: pedidoIds }, embarqueId: null },
          select: { id: true },
        })
        const idsLibres = libres.map((p) => p.id)
        if (idsLibres.length > 0) {
          await prisma.pedido.updateMany({
            where: { id: { in: idsLibres } },
            data: { embarqueId: result.id, estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA' },
          })
        }

        await this.planRepo.marcarGrupoMaterializado(g.id, result.id)
        creados.push({ grupoId: g.id, embarqueId: result.id, numero: result.numero, pedidos: idsLibres.length })

        publishRealtimeEvent('embarque.created', result.id).catch(() => {})
        idsLibres.forEach((pid) => publishRealtimeEvent('pedido.updated', pid).catch(() => {}))
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido'
        fallidos.push({ grupoId: g.id, nombre: g.nombreLogico, error: msg })
        logger.error({ err: msg, grupoId: g.id, planId: input.planId }, 'Error materializando grupo del plan')
      }
    }

    return { creados, fallidos, completo: fallidos.length === 0 }
  }
}
