/**
 * GET /api/rutas/planes/[id]/versiones — histórico de versiones de la fecha del
 * plan (ADR-PLANIFICADOR-005 §3). Auth: view:rutas.
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { PrismaPlanificadorRepository } from '@/modules/planificador/infrastructure/PrismaPlanificadorRepository'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params

  try {
    const plan = await prisma.planDia.findUnique({ where: { id }, select: { fecha: true } })
    if (!plan) return apiError('Plan no encontrado', 404)
    const fecha = plan.fecha.toISOString().slice(0, 10)

    const { planes, versiones } = await new PrismaPlanificadorRepository().versionesDeFecha(fecha)
    return apiSuccess({
      fecha,
      planes: planes.map((p) => ({
        id: p.id,
        version: p.version,
        estado: p.estado,
        causa: p.causa,
        generadoEn: p.generadoEn.toISOString(),
        confirmadoEn: p.confirmadoEn?.toISOString() ?? null,
      })),
      versiones: versiones.map((v) => ({
        version: v.version,
        causa: v.causa,
        actorId: v.actorId,
        diff: v.diff,
        createdAt: v.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown', id }, 'Error obteniendo versiones')
    return apiError('Error al obtener las versiones', 500)
  }
}
