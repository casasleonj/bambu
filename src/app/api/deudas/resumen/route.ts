import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    // Get total pending debt per worker
    const deudasPorTrabajador = await prisma.deudaTrabajador.groupBy({
      by: ['trabajadorId'],
      where: { montoPendiente: { gt: 0 } },
      _sum: { montoPendiente: true, montoOriginal: true },
      _count: { id: true },
    })

    // Enrich with worker names
    const trabajadorIds = deudasPorTrabajador.map(d => d.trabajadorId)
    const trabajadores = await prisma.trabajador.findMany({
      where: { id: { in: trabajadorIds } },
      select: { id: true, nombre: true, rol: true },
    })
    const trabajadorMap = Object.fromEntries(trabajadores.map(t => [t.id, t]))

    const resumen = deudasPorTrabajador.map(d => ({
      trabajadorId: d.trabajadorId,
      nombre: trabajadorMap[d.trabajadorId]?.nombre || 'Desconocido',
      rol: trabajadorMap[d.trabajadorId]?.rol || '',
      totalPendiente: Number(d._sum.montoPendiente || 0),
      totalOriginal: Number(d._sum.montoOriginal || 0),
      cantidadDeudas: d._count.id,
    }))

    const totalGeneral = resumen.reduce((sum, r) => sum + r.totalPendiente, 0)

    return apiSuccess({
      resumen,
      totalGeneral,
      trabajadoresConDeuda: resumen.length,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching resumen deudas:')
    return apiError('Error fetching resumen de deudas', 500)
  }
}
