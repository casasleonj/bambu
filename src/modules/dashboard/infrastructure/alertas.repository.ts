/**
 * Alertas Repository.
 *
 * Wraps Prisma queries for risk alerts, cases, and stock alerts.
 */

import { prisma } from '@/shared/infrastructure'
import type { AlertasRiesgo, CasosActivos, InsumoAlerta } from '../domain'

export interface AlertasRepository {
  getRiskAlerts(): Promise<AlertasRiesgo>
  getActiveCases(): Promise<CasosActivos>
  getStockAlertas(limit?: number): Promise<InsumoAlerta[]>
  countClientesConFiado(): Promise<number>
}

export class PrismaAlertasRepository implements AlertasRepository {
  async getRiskAlerts(): Promise<AlertasRiesgo> {
    const [
      disputasAbiertas,
      clientesBloqueados,
      clientesConflictivos,
      promesasProximasVencer,
      clientesNoVerificados,
    ] = await Promise.all([
      prisma.pedido.count({ where: { disputaAbierta: true } }),
      prisma.cliente.count({ where: { bloqueado: true, activo: true } }),
      prisma.cliente.count({ where: { reclamaciones: { gte: 3 }, activo: true } }),
      prisma.pedido.count({
        where: {
          promesaPagoFecha: { gte: new Date(), lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
          estadoPago: { notIn: ['PAGADO', 'ANULADO'] },
        },
      }),
      prisma.cliente.count({
        where: {
          verificado: false,
          activo: true,
          createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ])

    return {
      disputasAbiertas,
      clientesBloqueados,
      clientesConflictivos,
      promesasProximasVencer,
      clientesNoVerificados,
    }
  }

  async getActiveCases(): Promise<CasosActivos> {
    const [total, criticos, sinResolver48h] = await Promise.all([
      prisma.caso.count({ where: { status: { in: ['ABIERTO', 'EN_PROCESO'] } } }),
      prisma.caso.count({ where: { status: { in: ['ABIERTO', 'EN_PROCESO'] }, severidad: 'ALTA' } }),
      prisma.caso.count({
        where: {
          status: { in: ['ABIERTO', 'EN_PROCESO'] },
          createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
      }),
    ])

    return { total, criticos, sinResolver48h }
  }

  async getStockAlertas(limit = 5): Promise<InsumoAlerta[]> {
    const insumos = await prisma.insumo.findMany({
      where: { stock: { lte: prisma.insumo.fields.stockMin } },
      take: limit,
    })

    return insumos.map(s => ({
      id: s.id,
      nombre: s.nombre,
      stock: Number(s.stock),
      unidad: s.unidad,
    }))
  }

  async countClientesConFiado(): Promise<number> {
    return prisma.cliente.count({
      where: {
        activo: true,
        pedidos: {
          some: {
            saldo: { gt: 0 },
            estadoEntrega: 'ENTREGADO',
          },
        },
      },
    })
  }
}
