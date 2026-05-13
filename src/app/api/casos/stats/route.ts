import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const userId = (authResult.user as { id?: string } | undefined)?.id

  try {
    const now = new Date()
    const hace48h = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    const [
      totalAbiertos,
      criticos,
      asignadosAMi,
      sinResolver48h,
      porSeveridad,
    ] = await Promise.all([
      prisma.caso.count({
        where: { status: { in: ['ABIERTO', 'EN_PROCESO'] } },
      }),
      prisma.caso.count({
        where: {
          status: { in: ['ABIERTO', 'EN_PROCESO'] },
          severidad: 'ALTA',
        },
      }),
      userId
        ? prisma.caso.count({
            where: {
              status: { in: ['ABIERTO', 'EN_PROCESO'] },
              asignadoAId: userId,
            },
          })
        : Promise.resolve(0),
      prisma.caso.count({
        where: {
          status: { in: ['ABIERTO', 'EN_PROCESO'] },
          createdAt: { lt: hace48h },
        },
      }),
      prisma.caso.groupBy({
        by: ['severidad'],
        where: { status: { in: ['ABIERTO', 'EN_PROCESO'] } },
        _count: { severidad: true },
      }),
    ])

    const stats = {
      totalAbiertos,
      criticos,
      asignadosAMi,
      sinResolver48h,
      porSeveridad: porSeveridad.reduce(
        (acc, g) => {
          acc[g.severidad] = g._count.severidad
          return acc
        },
        {} as Record<string, number>,
      ),
    }

    return apiSuccess(stats)
  } catch (error) {
    return apiError('Error cargando estadisticas de casos')
  }
}
