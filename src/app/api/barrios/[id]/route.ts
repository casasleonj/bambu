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
import { prismaErrorCode } from '@/lib/prisma-errors'
import { logger } from '@/lib/logger'
import { ZodError } from 'zod'
import type { Barrio } from '@prisma/client'

/**
 * GET /api/barrios/[id]
 *
 * Detalle de un Barrio con sus alias/referencias COMPLETOS (F4) — usado por
 * Cliente/Negocio para mostrar "También se conoce como" / "Referencias
 * comunes" del Barrio ya seleccionado, sin depender de que el texto
 * buscado siga vigente (a diferencia de `buscarBarrios`, que solo expone
 * las coincidencias del query activo).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params

  try {
    const barrio = await prisma.barrio.findUnique({
      where: { id },
      include: {
        aliases: { select: { id: true, texto: true }, orderBy: { texto: 'asc' } },
        referencias: { select: { id: true, texto: true }, orderBy: { texto: 'asc' } },
      },
    })
    if (!barrio) return apiError('Barrio no encontrado', 404)
    return apiSuccess({ barrio })
  } catch {
    return apiError('Error consultando el barrio')
  }
}

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
    // P2002 se detecta por duck-typing (`prismaErrorCode`), no por
    // `instanceof` — el error del motor de Prisma y la clase importada
    // acá pueden venir de copias distintas del módulo runtime (mismo bug
    // ya corregido en las rutas de alias/referencias, ver prisma-errors.ts).
    if (prismaErrorCode(error) === 'P2002') {
      return apiError('Ya existe un barrio con ese nombre', 409)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown', barrioId: id }, 'Error actualizando barrio')
    return apiError('Error actualizando barrio')
  }
}
