import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { BarrioUpdateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'
import { prisma } from '@/lib/prisma'
import {
  BarrioNoEncontradoError,
  archivarBarrio,
  reactivarBarrio,
  renombrarBarrio,
} from '@/lib/barrios/barrio-service'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { ZodError } from 'zod'
import type { Barrio } from '@prisma/client'

/**
 * PATCH /api/barrios/[id]
 *
 * Cubre las tres mutaciones de F1: rename, archivado y reactivación.
 * `nombre` y `activo` pueden enviarse juntos o por separado; cada uno
 * queda auditado por separado (RENAME vs ARCHIVE/RESTORE) para que el
 * historial sea legible.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const usuarioId = (authResult.user as { id?: string } | undefined)?.id

  try {
    const body = await request.json()
    const data = BarrioUpdateSchema.parse(body)

    const existente = await prisma.barrio.findUnique({ where: { id } })
    if (!existente) return apiError('Barrio no encontrado', 404)

    let barrio: Barrio = existente

    if (data.nombre !== undefined && data.nombre !== existente.nombre) {
      const resultado = await renombrarBarrio(id, data.nombre)
      barrio = resultado.barrio

      logAudit({
        entidad: 'Barrio',
        registroId: id,
        accion: 'UPDATE',
        datos: {
          cambios: { nombre: barrio.nombre },
          antes: { nombre: existente.nombre },
          clientesSincronizados: resultado.clientesSincronizados,
          negociosSincronizados: resultado.negociosSincronizados,
        },
        usuarioId,
      }).catch(() => {})
    }

    if (data.activo !== undefined && data.activo !== existente.activo) {
      barrio = data.activo ? await reactivarBarrio(id) : await archivarBarrio(id)

      logAudit({
        entidad: 'Barrio',
        registroId: id,
        accion: data.activo ? 'RESTORE' : 'DELETE',
        datos: { activo: barrio.activo },
        usuarioId,
      }).catch(() => {})
    }

    return apiSuccess({ barrio })
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(error)] })
    }
    if (error instanceof BarrioNoEncontradoError) {
      return apiError('Barrio no encontrado', 404)
    }
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('Ya existe un barrio con ese nombre', 409)
    }
    return apiError('Error actualizando barrio')
  }
}
