import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { id } = await params

    // Fetch tier data before soft-deleting for complete audit log
    const existing = await prisma.precioVolumen.findUnique({
      where: { id },
      include: { producto: true },
    })

    if (!existing) {
      return apiError('Rango de precio no encontrado', 404)
    }

    await prisma.precioVolumen.update({
      where: { id },
      data: { activo: false },
    })

    logAudit({
      entidad: 'PrecioVolumen',
      registroId: id,
      accion: 'DELETE',
      datos: {
        id,
        productoId: existing.productoId,
        productoCodigo: existing.producto.codigo,
        cantMin: existing.cantMin,
        cantMax: existing.cantMax,
        precio: Number(existing.precio),
      },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({})
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error deleting precio:')
    return apiError('Error eliminando precio')
  }
}
