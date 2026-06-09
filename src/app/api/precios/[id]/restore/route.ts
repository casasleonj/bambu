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

    // FIX F-N23 (hallazgo 39): read+update DENTRO de tx.
    // Antes: findUnique FUERA de tx + update directo. Dos admins
    // podían restaurar el mismo tier casi simultáneo:
    //   T0: Admin A lee tier (activo=false)
    //   T0: Admin B lee tier (activo=false)
    //   T1: B restaura (activo=true)
    //   T1: A restaura (activo=true, idempotente, no error)
    //   Pero el problema real es el caso de restore + create casi
    //   simultáneos (audit menciona):
    //   T0: A: restore P1 (cantMin=10)
    //   T0: B: create P2 con cantMin=10
    //   T1: B pasa el check (P1 está inactivo)
    //   T2: A restaura P1 (activo=true)
    //   T3: B crea P2 → P2002 → 500
    //
    // Ahora: prisma.$transaction con row lock implícito sobre el
    // tier. Si otro request commiteó primero, A lo ve activo y
    // devuelve 409 limpio.
    const restored = await prisma.$transaction(async (tx) => {
      const existing = await tx.precioVolumen.findUnique({
        where: { id },
        include: { producto: true },
      })

      if (!existing) {
        throw new Error('TIER_NOT_FOUND')
      }

      if (existing.activo) {
        throw new Error('TIER_YA_ACTIVO')
      }

      return tx.precioVolumen.update({
        where: { id },
        data: { activo: true },
        include: { producto: true },
      })
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

    // FIX F-N23: mapear errores thrown desde la tx
    if (message === 'TIER_NOT_FOUND') {
      return apiError('Rango de precio no encontrado', 404)
    }
    if (message === 'TIER_YA_ACTIVO') {
      return apiError('Este rango ya esta activo', 409)
    }

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
