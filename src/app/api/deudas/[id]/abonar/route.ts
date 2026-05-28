import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'
import { AbonoDeudaSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const userId = (authResult as { user?: { id?: string } })?.user?.id

  try {
    const body = await request.json()
    const parsed = AbonoDeudaSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { monto, nota } = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      const deuda = await tx.deudaTrabajador.findUnique({
        where: { id },
        include: { trabajador: { select: { id: true, nombre: true } } },
      })
      if (!deuda) throw new Error('DEUDA_NOT_FOUND')

      const montoPendienteActual = Number(deuda.montoPendiente)
      if (monto > montoPendienteActual) {
        throw new Error(`El abono (${monto}) excede la deuda pendiente (${montoPendienteActual})`)
      }

      const nuevoPendiente = montoPendienteActual - monto

      // Create abono record
      const abono = await tx.abonoDeuda.create({
        data: {
          deudaId: id,
          monto,
          nota: nota || null,
        },
      })

      // Update deuda
      const updatedDeuda = await tx.deudaTrabajador.update({
        where: { id },
        data: {
          montoPendiente: nuevoPendiente,
        },
        include: {
          trabajador: { select: { id: true, nombre: true, rol: true } },
        },
      })

      logAudit({
        entidad: 'AbonoDeuda',
        registroId: abono.id,
        accion: 'CREATE',
        datos: { deudaId: id, monto, nuevoPendiente },
        usuarioId: userId,
      }).catch(() => {})

      return { abono, deuda: updatedDeuda }
    })

    return apiSuccess(result, 201)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: msg }, 'Error abonando deuda:')
    if (msg === 'DEUDA_NOT_FOUND') return apiError('Deuda no encontrada', 404)
    if (msg.startsWith('El abono')) return apiError(msg, 400)
    return apiError('Error registrando abono', 500)
  }
}
