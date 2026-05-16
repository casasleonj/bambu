import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'ASISTENTE'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { id } = await params
    const body = await request.json()
    const userId = (authResult.user as { id?: string } | undefined)?.id

    if (body.action === 'PAGAR') {
      const result = await prisma.$transaction(async (tx) => {
        const nomina = await tx.nomina.findUnique({
          where: { id },
          include: { trabajador: true },
        })

        if (!nomina) throw new Error('Nómina no encontrada')
        if (nomina.estado === 'PAGADA') throw new Error('La nómina ya está pagada')
        if (nomina.estado === 'ANULADA') throw new Error('No se puede pagar una nómina anulada')

        const updated = await tx.nomina.update({
          where: { id },
          data: { estado: 'PAGADA', fechaPago: new Date() },
          include: { trabajador: true },
        })

        const periodo = `${new Date(nomina.fechaInicio).toLocaleDateString()} - ${new Date(nomina.fechaFin).toLocaleDateString()}`
        await tx.gasto.create({
          data: {
            categoria: 'NOMINA',
            descripcion: `Pago nómina - ${nomina.trabajador.nombre} (${periodo})`,
            monto: Number(nomina.total),
            responsable: nomina.trabajador.nombre,
            fecha: new Date(),
          },
        })

        return updated
      })

      logAudit({
        entidad: 'Nomina',
        registroId: id,
        accion: 'UPDATE',
        datos: { total: result.total, trabajador: result.trabajador.nombre, action: 'PAGAR' },
        usuarioId: userId,
      }).catch(() => {})

      return apiSuccess({ nomina: result })
    }

    if (body.action === 'ANULAR') {
      const result = await prisma.$transaction(async (tx) => {
        const nomina = await tx.nomina.findUnique({
          where: { id },
          include: { trabajador: true },
        })

        if (!nomina) throw new Error('Nómina no encontrada')
        if (nomina.estado === 'ANULADA') throw new Error('La nómina ya está anulada')

        // Si estaba pagada, revertir el gasto correspondiente
        if (nomina.estado === 'PAGADA') {
          const periodo = `${new Date(nomina.fechaInicio).toLocaleDateString()} - ${new Date(nomina.fechaFin).toLocaleDateString()}`
          await tx.gasto.create({
            data: {
              categoria: 'OTRO',
              descripcion: `Reversión nómina anulada - ${nomina.trabajador.nombre} (${periodo})`,
              monto: -Number(nomina.total),
              responsable: nomina.trabajador.nombre,
              fecha: new Date(),
            },
          })
        }

        const updated = await tx.nomina.update({
          where: { id },
          data: { estado: 'ANULADA' },
          include: { trabajador: true },
        })

        // Revertir descuentos aplicados
        await tx.descuentoRepartidor.updateMany({
          where: { trabajadorId: nomina.trabajadorId, aplicadoEnNomina: true },
          data: { aplicadoEnNomina: false },
        })

        return updated
      })

      logAudit({
        entidad: 'Nomina',
        registroId: id,
        accion: 'UPDATE',
        datos: { total: result.total, trabajador: result.trabajador.nombre, action: 'ANULAR' },
        usuarioId: userId,
      }).catch(() => {})

      return apiSuccess({ nomina: result })
    }

    return apiError('Acción no válida', 400)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: msg }, 'Error en nomina PUT:')
    if (msg === 'Nómina no encontrada') return apiError(msg, 404)
    if (msg === 'La nómina ya está pagada' || msg === 'La nómina ya está anulada' || msg === 'No se puede pagar una nómina anulada') {
      return apiError(msg, 409)
    }
    return apiError('Error procesando nómina', 500)
  }
}
