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
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { id } = await params
    const body = await request.json()
    const userId = (authResult.user as { id?: string } | undefined)?.id

    if (body.action === 'PAGAR') {
      const result = await prisma.$transaction(async (tx) => {
        // FIX F-N9 (hallazgo 15): atomic check-and-set.
        // Antes: findUnique + check + update (3 queries). Dos requests
        // simultáneos podían ambos leer estado=PENDIENTE, ambos pasar
        // el check, ambos ejecutar el update, y ambos crear un Gasto
        // con el mismo monto → doble egreso de caja (crítico: cobra
        // doble a la empresa).
        //
        // Ahora: updateMany con condición sobre estado. PostgreSQL
        // aplica row-lock implícito. Si dos requests llegan casi
        // simultáneos, uno commitea primero (count=1), el segundo
        // ve count=0 porque la fila ya no tiene estado PENDIENTE.
        const updateResult = await tx.nomina.updateMany({
          where: { id, estado: 'PENDIENTE' },
          data: { estado: 'PAGADA', fechaPago: new Date() },
        })

        if (updateResult.count === 0) {
          // Determinar la causa específica del 409
          const current = await tx.nomina.findUnique({ where: { id } })
          if (!current) throw new Error('Nómina no encontrada')
          if (current.estado === 'PAGADA') throw new Error('La nómina ya está pagada')
          if (current.estado === 'ANULADA') throw new Error('No se puede pagar una nómina anulada')
          throw new Error('Estado de nómina inválido')
        }

        // Re-leer la nómina con el trabajdor para crear el Gasto
        const updated = await tx.nomina.findUnique({
          where: { id },
          include: { trabajador: true },
        })
        if (!updated) throw new Error('Nómina no encontrada')  // no debería pasar

        const periodo = `${new Date(updated.fechaInicio).toLocaleDateString()} - ${new Date(updated.fechaFin).toLocaleDateString()}`
        await tx.gasto.create({
          data: {
            categoria: 'NOMINA',
            descripcion: `Pago nómina - ${updated.trabajador.nombre} (${periodo})`,
            monto: Number(updated.total),
            responsable: updated.trabajador.nombre,
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
        // FIX F-N9 (mismo patrón que PAGAR): atomic check-and-set.
        // updateMany con condición sobre estado previene doble anulación.
        // El update acepta PENDIENTE o PAGADA → ANULADA atómicamente.
        // Necesitamos saber el estado ANTERIOR para saber si crear
        // reversión de gasto, por eso hacemos findUnique + updateMany
        // dentro de la misma tx (la tx garantiza que el estado leído
        // es el mismo que se actualiza).
        const before = await tx.nomina.findUnique({
          where: { id },
          include: { trabajador: true },
        })

        if (!before) throw new Error('Nómina no encontrada')
        if (before.estado === 'ANULADA') throw new Error('La nómina ya está anulada')

        const updateResult = await tx.nomina.updateMany({
          where: { id, estado: { in: ['PENDIENTE', 'PAGADA'] } },
          data: { estado: 'ANULADA' },
        })

        if (updateResult.count === 0) {
          throw new Error('La nómina ya está anulada')
        }

        // Si estaba PAGADA, revertir el gasto correspondiente
        if (before.estado === 'PAGADA') {
          const periodo = `${new Date(before.fechaInicio).toLocaleDateString()} - ${new Date(before.fechaFin).toLocaleDateString()}`
          await tx.gasto.create({
            data: {
              categoria: 'OTRO',
              descripcion: `Reversión nómina anulada - ${before.trabajador.nombre} (${periodo})`,
              monto: -Number(before.total),
              responsable: before.trabajador.nombre,
              fecha: new Date(),
            },
          })
        }

        // Re-leer la nómina ya con estado ANULADA para devolver
        const updated = await tx.nomina.findUnique({
          where: { id },
          include: { trabajador: true },
        })
        if (!updated) throw new Error('Nómina no encontrada')

        // Revertir descuentos aplicados
        await tx.descuentoRepartidor.updateMany({
          where: { trabajadorId: updated.trabajadorId, aplicadoEnNomina: true },
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
