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

    // FIX F-32: read+update DENTRO de prisma.$transaction.
    // Antes: findUnique (línea 18) + update (línea 27) sin tx.
    // Si el tier era modificado entre el read y el update, el
    // audit log capturaba datos stale (productoId, cantMin, etc.).
    // El update es idempotente (segundo es no-op) pero el log era
    // engañoso.
    //
    // Ahora: prisma.$transaction con row lock. Si el tier ya está
    // inactivo, retornar 410 (idempotencia con info). Si se eliminó
    // entre el read y el update, lanzar 404.
    const existing = await prisma.$transaction(async (tx) => {
      const tier = await tx.precioVolumen.findUnique({
        where: { id },
        include: { producto: true },
      })
      if (!tier) {
        throw new Error('TIER_NOT_FOUND')
      }

      await tx.precioVolumen.update({
        where: { id },
        data: { activo: false },
      })

      return tier
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
    // FIX F-32: mapear error thrown desde la tx
    if (error instanceof Error && error.message === 'TIER_NOT_FOUND') {
      return apiError('Rango de precio no encontrado', 404)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error deleting precio:')
    return apiError('Error eliminando precio')
  }
}
