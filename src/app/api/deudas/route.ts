import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'
import { DeudaCreateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  // FIX CRITICAL (C-SEC-5): Only ADMIN/CONTADOR can read deudas
  // Previously: requireAuth() only — any user could read worker debt PII (HR privacy)
  const authResult = await requireRole(['ADMIN', 'CONTADOR'])
  if (authResult instanceof Response) return authResult

  const { searchParams } = new URL(request.url)
  const trabajadorId = searchParams.get('trabajadorId')
  const pendiente = searchParams.get('pendiente')

  try {
    const where: Record<string, unknown> = {}
    if (trabajadorId) where.trabajadorId = trabajadorId
    if (pendiente === 'true') {
      where.montoPendiente = { gt: 0 }
    }

    const deudas = await prisma.deudaTrabajador.findMany({
      where,
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      include: {
        trabajador: { select: { id: true, nombre: true, rol: true } },
        abonos: { orderBy: { fecha: 'desc' } },
        deducciones: { include: { nomina: { select: { id: true, fechaInicio: true, fechaFin: true, estado: true } } } },
      },
    })

    return apiSuccess({ deudas })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching deudas:')
    return apiError('Error fetching deudas', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = DeudaCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { trabajadorId, tipo, monto, descripcion, embarqueId } = parsed.data

    const userId = (authResult as { user?: { id?: string } })?.user?.id

    const result = await prisma.$transaction(async (tx) => {
      const trabajador = await tx.trabajador.findUnique({
        where: { id: trabajadorId },
        select: { id: true, nombre: true, activo: true },
      })
      if (!trabajador) throw new Error('TRABAJADOR_NOT_FOUND')
      if (!trabajador.activo) throw new Error('TRABAJADOR_INACTIVO')

      const deuda = await tx.deudaTrabajador.create({
        data: {
          createdById: userId,
          trabajadorId,
          tipo,
          montoOriginal: monto,
          montoPendiente: monto,
          descripcion,
          embarqueId: embarqueId || null,
        },
        include: {
          trabajador: { select: { id: true, nombre: true, rol: true } },
        },
      })

      logAudit({
        entidad: 'DeudaTrabajador',
        registroId: deuda.id,
        accion: 'CREATE',
        datos: { trabajadorId, tipo, monto, descripcion },
        usuarioId: userId,
      }).catch(() => {})

      return deuda
    })

    return apiSuccess({ deuda: result }, 201)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: msg }, 'Error creating deuda:')
    if (msg === 'TRABAJADOR_NOT_FOUND') return apiError('Trabajador no encontrado', 404)
    if (msg === 'TRABAJADOR_INACTIVO') return apiError('El trabajador esta inactivo', 400)
    return apiError('Error creando deuda', 500)
  }
}
