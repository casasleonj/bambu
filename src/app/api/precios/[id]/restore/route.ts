import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { id } = await params

    // Fetch the tier to verify it exists and is inactive
    const existing = await prisma.precioVolumen.findUnique({
      where: { id },
      include: { producto: true },
    })

    if (!existing) {
      return apiError('Rango de precio no encontrado', 404)
    }

    if (existing.activo) {
      return apiError('Este rango ya esta activo', 400)
    }

    // Restore: set activo back to true
    const restored = await prisma.precioVolumen.update({
      where: { id },
      data: { activo: true },
      include: { producto: true },
    })

    logAudit({
      entidad: 'PrecioVolumen',
      registroId: id,
      accion: 'RESTORE',
      datos: {
        productoId: restored.productoId,
        productoCodigo: restored.producto.codigo,
        cantMin: restored.cantMin,
        cantMax: restored.cantMax,
        precio: Number(restored.precio),
      },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    logger.info({ id, productoId: restored.productoId }, 'PrecioVolumen restored')

    return apiSuccess({ tier: restored })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: message }, 'Error restoring precio:')

    if (message.includes('Record to update not found') || message.includes('P2025')) {
      return apiError('Rango de precio no encontrado', 404)
    }

    // Check for unique constraint collision (another active tier with same cantMin was created)
    if (message.includes('unique constraint') || message.includes('P2002')) {
      return apiError(
        'No se puede restaurar: ya existe otro rango activo con la misma cantidad minima. Elimina el rango conflictivo primero.',
        409
      )
    }

    return apiError('Error restaurando rango de precio', 500)
  }
}
