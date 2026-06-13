/**
 * GET /api/casos/[id]/auditoria
 *
 * Devuelve los registros de Historial (audit log) vinculados a un Caso.
 *
 * La vinculacion se hace por `datos._casoId` — el commit 0e agrega este
 * campo a los `logAudit()` que se disparan desde los endpoints PATCH
 * que el flujo de auto-resolver toca (clientes/[id], pedidos/[id]).
 *
 * Esto permite al admin ver, en la pantalla del caso, que cambios
 * automaticos se dispararon y quien los origino.
 *
 * Auth: requireAuth. Cualquier usuario autenticado puede ver la
 * auditoria (el caso ya estaba en su lista de casos).
 *
 * NOTA: PostgreSQL no soporta query directo por `datos->>'_casoId'`
 * con indice eficiente cuando `datos` es `text` (no `jsonb`). Para
 * el volumen actual (decenas de casos con auditoria), un scan de
 * tabla es aceptable. Si crece, considerar migrar `datos` a `jsonb`
 * y agregar indice GIN.
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id: casoId } = await params

  // Verificar que el caso existe (404 vs lista vacia)
  const caso = await prisma.caso.findUnique({
    where: { id: casoId },
    select: { id: true },
  })
  if (!caso) return apiError('Caso no encontrado', 404)

  try {
    // Buscar todos los registros de Historial que tengan _casoId = casoId
    // en su JSON `datos`. Postgres LIKE es la opcion mas portable.
    // Limit: 200 (suficiente para vista, paginacion es follow-up).
    const allEntries = await prisma.historial.findMany({
      where: {
        datos: { contains: `"_casoId":"${casoId}"` },
      },
      orderBy: { fecha: 'desc' },
      take: 200,
    })

    // Enriquecer con el username (User lookup batch)
    const userIds = [...new Set(allEntries.map((e) => e.usuarioId).filter((id): id is string => !!id))]
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, nombre: true },
        })
      : []
    const userMap = new Map(users.map((u) => [u.id, u]))

    const entries = allEntries.map((e) => {
      // Parsear `datos` para exponer summary (sin el _casoId/ip/userAgent meta)
      let datosParsed: Record<string, unknown> = {}
      try {
        datosParsed = JSON.parse(e.datos) as Record<string, unknown>
      } catch {
        // datos corrupto: lo exponemos vacio
      }
      const { _ip: _ipMeta, _userAgent: _uaMeta, _casoId: _casoIdMeta, ...summary } = datosParsed

      return {
        id: e.id,
        entidad: e.entidad,
        registroId: e.registroId,
        accion: e.accion,
        summary, // datos sin meta-campos
        fecha: e.fecha.toISOString(),
        usuario: e.usuarioId ? userMap.get(e.usuarioId) ?? null : null,
      }
    })

    return apiSuccess({ entries })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown'
    return apiError(`Error leyendo auditoria: ${errMsg}`, 500)
  }
}
