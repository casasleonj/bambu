import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

/**
 * GET /api/casos/salud-antifraude
 *
 * commit 5 plan antifraude: panel de salud del sistema antifraude.
 * Devuelve:
 *  - distribution de Casos por alertaTipo en los ultimos 30 dias
 *  - distribution de Casos por status (ABIERTO, EN_PROCESO, RESUELTO, CERRADO_AUTO)
 *  - top 5 repartidores con mas Casos abiertos
 *  - top 5 clientes con mas Casos abiertos
 *  - tendencia: Casos creados por dia en los ultimos 14 dias
 *
 * Acceso: solo ADMIN/CONTADOR/ASISTENTE. REPARTIDOR no ve este panel.
 */
export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole(['ADMIN', 'CONTADOR', 'ASISTENTE'])
  if (roleCheck instanceof Response) return roleCheck

  try {
    const now = new Date()
    const hace30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const hace14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    const [porTipo, porStatus, topRepartidores, topClientes, tendencia] = await Promise.all([
      // 1. Distribucion por tipo de alerta (30d, cualquier status)
      prisma.caso.groupBy({
        by: ['alertaTipo'],
        where: { createdAt: { gte: hace30d } },
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      // 2. Distribucion por status (todos los Casos)
      prisma.caso.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      // 3. Top 5 repartidores con mas Casos ABIERTOS
      prisma.caso.groupBy({
        by: ['repartidorId'],
        where: {
          status: { in: ['ABIERTO', 'EN_PROCESO'] },
          repartidorId: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      // 4. Top 5 clientes con mas Casos ABIERTOS
      prisma.caso.groupBy({
        by: ['clienteId'],
        where: {
          status: { in: ['ABIERTO', 'EN_PROCESO'] },
          clienteId: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      // 5. Tendencia diaria: Casos creados en los ultimos 14 dias
      prisma.caso.findMany({
        where: { createdAt: { gte: hace14d } },
        select: { createdAt: true },
      }),
    ])

    // Hidratar nombres de repartidores/clientes (en lote para no N+1)
    const repartidorIds = topRepartidores
      .map((g) => g.repartidorId)
      .filter((id): id is string => id !== null)
    const clienteIds = topClientes
      .map((g) => g.clienteId)
      .filter((id): id is string => id !== null)

    const [repartidores, clientes] = await Promise.all([
      repartidorIds.length > 0
        ? prisma.trabajador.findMany({
            where: { id: { in: repartidorIds } },
            select: { id: true, nombre: true },
          })
        : Promise.resolve([]),
      clienteIds.length > 0
        ? prisma.cliente.findMany({
            where: { id: { in: clienteIds } },
            select: { id: true, nombre: true },
          })
        : Promise.resolve([]),
    ])

    const repartidorMap = new Map(repartidores.map((r) => [r.id, r.nombre]))
    const clienteMap = new Map(clientes.map((c) => [c.id, c.nombre]))

    // Tendencia: agrupar por dia
    const tendenciaPorDia = new Map<string, number>()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      tendenciaPorDia.set(d.toISOString().slice(0, 10), 0)
    }
    for (const c of tendencia) {
      const dia = c.createdAt.toISOString().slice(0, 10)
      tendenciaPorDia.set(dia, (tendenciaPorDia.get(dia) ?? 0) + 1)
    }

    return apiSuccess({
      ventanaDias: 30,
      porTipo: porTipo.map((g) => ({
        alertaTipo: g.alertaTipo,
        count: g._count._all,
      })),
      porStatus: porStatus.reduce(
        (acc, g) => {
          acc[g.status] = g._count._all
          return acc
        },
        {} as Record<string, number>,
      ),
      topRepartidores: topRepartidores.map((g) => ({
        repartidorId: g.repartidorId,
        nombre: g.repartidorId ? (repartidorMap.get(g.repartidorId) ?? 'Desconocido') : null,
        count: g._count._all,
      })),
      topClientes: topClientes.map((g) => ({
        clienteId: g.clienteId,
        nombre: g.clienteId ? (clienteMap.get(g.clienteId) ?? 'Desconocido') : null,
        count: g._count._all,
      })),
      tendencia: Array.from(tendenciaPorDia.entries()).map(([fecha, count]) => ({
        fecha,
        count,
      })),
    })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown' },
      'Error cargando salud antifraude:',
    )
    return apiError('Error cargando salud antifraude', 500)
  }
}
