import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { obtenerDeudasPendientes } from '@/lib/deuda-trabajador-resumen'

const VEN_TODAS = new Set<string>([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR])

/**
 * GET /api/trabajadores/[id]/deudas-pendientes — detalle de lo que debe un trabajador (#566).
 * ADMIN, ASISTENTE y CONTADOR ven cualquier trabajador; cualquier otro usuario (repartidor,
 * sellador…) solo el trabajador vinculado a su propio usuario. Solo lectura.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params

  const rol = (authResult.user as { role?: string } | undefined)?.role
  const userId = authResult.user?.id

  try {
    if (!rol || !VEN_TODAS.has(rol)) {
      const propio = await prisma.trabajador.findFirst({ where: { userId, id }, select: { id: true } })
      // Mismo 403 exista o no el trabajador: no se confirma a quién pertenece cada id.
      if (!propio) return apiError('No tiene permisos para esta acción', 403)
    }
    const deudas = (await obtenerDeudasPendientes(prisma, [id])).get(id)
    return apiSuccess({
      items: deudas?.items ?? [],
      totalPendiente: deudas?.totalPendiente ?? 0,
      cantidad: deudas?.cantidad ?? 0,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error leyendo deudas pendientes del trabajador:')
    return apiError('No se pudo cargar la deuda', 500)
  }
}
