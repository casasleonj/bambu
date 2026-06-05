import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { EstadoEmbarque } from '@prisma/client'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { executeSerializableWithRetry } from '@/lib/serializable'

const GastoEmbarqueSchema = z.object({
  categoria: z.string().min(1),
  monto: z.coerce.number().positive(),
  nota: z.string().max(500).optional(),
})

type CrearGastoResult =
  | { kind: 'not_found' }
  | { kind: 'embarque_cerrado'; estado: EstadoEmbarque }
  | { kind: 'created'; gasto: Awaited<ReturnType<typeof prisma.gasto.create>> }

/**
 * POST /api/embarques/[id]/gastos
 *
 * FIX F-N2: race condition en creación de gastos.
 *
 * Antes: el endpoint hacía findUnique embarque + create gasto en
 * operaciones auto-commit. Si entre el findUnique (línea 33) y el
 * create (línea 48) el embarque pasaba a CERRADO/CANCELADO, se podía
 * agregar un gasto a un embarque cerrado.
 *
 * Ahora: el check de estado y el create corren dentro de una
 * transacción Serializable. PostgreSQL SSI detecta el write-write
 * conflict si otro proceso modifica el embarque concurrentemente.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }

  // FIX #22: Verify ownership before allowing gasto creation
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)

  // Parsear body ANTES de la tx para fallar rápido con 400
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('Body inválido', 400)
  }
  const parsed = GastoEmbarqueSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('Datos inválidos', 400)
  }

  try {
    const result = await executeSerializableWithRetry<CrearGastoResult>(
      async (tx) => {
        // 1. findUnique embarque (dentro de tx)
        const embarque = await tx.embarque.findUnique({
          where: { id },
        })

        if (!embarque) return { kind: 'not_found' }
        if (embarque.estado === EstadoEmbarque.CERRADO || embarque.estado === EstadoEmbarque.CANCELADO) {
          return { kind: 'embarque_cerrado', estado: embarque.estado }
        }

        // 2. create gasto (dentro de tx)
        const gasto = await tx.gasto.create({
          data: {
            categoria: parsed.data.categoria,
            descripcion: parsed.data.nota || parsed.data.categoria,
            monto: parsed.data.monto,
            responsable: embarque.trabajadorId,
            notas: parsed.data.nota,
            embarqueId: id,
            createdById: session.user?.id,
          },
        })

        return { kind: 'created', gasto }
      },
      `embarques/gastos:create:${id}`,
    )

    if (result.kind === 'not_found') {
      return apiError('Embarque no encontrado', 404)
    }
    if (result.kind === 'embarque_cerrado') {
      return apiError(
        `No se pueden agregar gastos a embarques ${result.estado.toLowerCase()}`,
        400,
      )
    }

    // result.kind === 'created'
    const gasto = result.gasto
    logAudit({
      entidad: 'Gasto',
      registroId: gasto.id,
      accion: 'CREATE',
      datos: { embarqueId: id, categoria: gasto.categoria, monto: gasto.monto },
      usuarioId: session.user?.id,
    }).catch(() => {})

    return apiSuccess({ gasto }, 201)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: msg }, 'Error creando gasto:')
    return apiError('Error creando gasto', 500)
  }
}

/**
 * DELETE /api/embarques/[id]/gastos
 *
 * NOTA: este endpoint NO usa Serializable porque:
 * 1. El where compuesto { id: gastoId, embarqueId: id } ya garantiza
 *    que solo se borra un gasto que pertenece al embarque correcto.
 * 2. La eliminación de gastos en embarques cerrados es una operación
 *    contable legítima (corrección de errores), no una violación de
 *    invariante de negocio.
 * 3. No hay race que pueda resultar en estado inconsistente.
 *
 * Si en el futuro se necesita validar el estado del embarque antes de
 * eliminar, agregar Serializable aquí siguiendo el patrón del POST.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params

  const { searchParams } = new URL(request.url)
  const gastoId = searchParams.get('gastoId')
  if (!gastoId) return apiError('gastoId requerido', 400)

  try {
    await prisma.gasto.delete({
      where: { id: gastoId, embarqueId: id },
    })

    return apiSuccess({ message: 'Gasto eliminado' })
  } catch (error) {
    return apiError('Error eliminando gasto', 500)
  }
}
