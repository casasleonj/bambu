import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { apiError, apiSuccess } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'
import { formatZodError } from '@/lib/utils'
import { acquireAdvisoryLockTx } from '@/lib/locks'
import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'

const CategoriaOperativa = z.enum([
  'ARRIENDO', 'SERVICIOS', 'INSUMOS', 'MANTENIMIENTO', 'TRANSPORTE', 'OTRO',
])

const Concurrency = {
  version: z.number().int().min(0),
  motivo: z.string().trim().min(5).max(500),
}

const EditarSchema = z.object({
  accion: z.literal('EDITAR'),
  ...Concurrency,
  categoria: CategoriaOperativa,
  descripcion: z.string().trim().min(1).max(200),
  monto: z.coerce.number().positive().max(99_999_999.99).refine(
    value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    'El monto acepta máximo dos decimales.',
  ),
  responsable: z.string().trim().max(100).nullish(),
  notas: z.string().trim().max(500).nullish(),
}).strict()

const AnularSchema = z.object({
  accion: z.literal('ANULAR'),
  ...Concurrency,
  motivoOrigen: z.enum(['REGISTRO_DUPLICADO', 'DINERO_NO_SALIO']),
  // Solo se anula si NO corresponde a una salida adicional de efectivo.
  // Si el dinero realmente salió, se requiere gestionar un reintegro real,
  // nunca fabricar dinero disponible mediante una anulación.
  confirmarOperacionNoReal: z.literal(true),
}).strict()

const ActualizarSchema = z.discriminatedUnion('accion', [EditarSchema, AnularSchema])

function esMovimientoDeOtroModulo(gasto: {
  categoria: string
  descripcion: string
  esPagoPersonal: boolean
  trabajadorId: string | null
  embarqueId: string | null
}): boolean {
  return gasto.categoria === 'NOMINA' ||
    gasto.esPagoPersonal ||
    gasto.trabajadorId !== null ||
    gasto.embarqueId !== null ||
    gasto.descripcion.startsWith('Reversión nómina anulada -')
}

/**
 * #755 fase 2A: ediciones o anulaciones de datos OPERATIVOS en días ABIERTOS.
 * No se cambia fecha de un gasto aquí: mover A->B requiere dos locks y una
 * conciliación de cierres histórica; será una fase independiente.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ADMIN', 'CONTADOR'])
  if (auth instanceof Response) return auth
  const actorId = (auth.user as { id?: string } | undefined)?.id
  if (!actorId) return apiError('Sesión no válida para corregir gastos', 401)

  let input: z.infer<typeof ActualizarSchema>
  try {
    const body: unknown = await request.json()
    const result = ActualizarSchema.safeParse(body)
    if (!result.success) return apiError(formatZodError(result.error), 400)
    input = result.data
  } catch {
    return apiError('La solicitud debe contener un JSON válido', 400)
  }

  const { id } = await params
  if (!id?.trim()) return apiError('Gasto no encontrado', 404)

  try {
    const result = await prisma.$transaction(async tx => {
      const indice = await tx.gasto.findUnique({ where: { id }, select: { fecha: true } })
      if (!indice) return { estado: 'NO_ENCONTRADO' } as const

      // Mismo lock que POST /api/cierre (y que la creación de #753).
      // Las mutaciones de un gasto y el snapshot de su fecha no se cruzan.
      const dia = startOfDayInBogota(dayInBogota(indice.fecha))
      await acquireAdvisoryLockTx(tx, 'CIERRE', dia.toISOString())
      const [gasto, cierre] = await Promise.all([
        tx.gasto.findUnique({ where: { id } }),
        tx.cierreDia.findUnique({ where: { fecha: dia }, select: { id: true } }),
      ])
      if (!gasto) return { estado: 'NO_ENCONTRADO' } as const
      if (esMovimientoDeOtroModulo(gasto)) return { estado: 'OTRO_MODULO' } as const
      if (cierre) return { estado: 'DIA_CERRADO' } as const
      if (gasto.anuladoAt) return { estado: 'YA_ANULADO' } as const

      const update = await tx.gasto.updateMany({
        where: { id, version: input.version, anuladoAt: null },
        data: input.accion === 'EDITAR'
          ? {
            categoria: input.categoria,
            descripcion: input.descripcion,
            monto: input.monto,
            responsable: input.responsable || null,
            notas: input.notas || null,
            version: { increment: 1 },
          }
          : {
            montoAntesAnular: gasto.monto,
            monto: 0,
            anuladoAt: new Date(),
            motivoAnulacion: `${input.motivoOrigen}: ${input.motivo}`,
            version: { increment: 1 },
          },
      })
      if (update.count !== 1) return { estado: 'VERSION_CAMBIO' } as const
      const actualizado = await tx.gasto.findUniqueOrThrow({ where: { id } })

      await logAudit({
        entidad: 'Gasto',
        registroId: id,
        accion: input.accion === 'EDITAR' ? 'UPDATE' : 'DELETE',
        usuarioId: actorId,
        datos: {
          tipo: input.accion === 'EDITAR' ? 'CORRECCION_DIA_ABIERTO' : 'ANULACION_DIA_ABIERTO',
          motivo: input.motivo,
          ...(input.accion === 'ANULAR' ? { motivoOrigen: input.motivoOrigen, confirmarOperacionNoReal: true } : {}),
          antes: {
            categoria: gasto.categoria, descripcion: gasto.descripcion,
            monto: Number(gasto.monto), responsable: gasto.responsable,
            notas: gasto.notas, fecha: gasto.fecha.toISOString(),
            version: gasto.version,
          },
          despues: {
            categoria: actualizado.categoria, descripcion: actualizado.descripcion,
            monto: Number(actualizado.monto), responsable: actualizado.responsable,
            notas: actualizado.notas, fecha: actualizado.fecha.toISOString(),
            version: actualizado.version, anuladoAt: actualizado.anuladoAt?.toISOString() ?? null,
          },
        },
      }, tx)
      return { estado: 'OK', gasto: actualizado } as const
    })
    switch (result.estado) {
      case 'NO_ENCONTRADO':
        return apiError('Gasto no encontrado', 404)
      case 'OTRO_MODULO':
        return apiError('Este movimiento se administra en Nómina o Embarques.', 422, { code: 'GASTO_OTRO_MODULO' })
      case 'DIA_CERRADO':
        return apiError('Este día tiene cierre guardado. No se puede modificar; se requiere ajuste separado.', 409, { code: 'GASTO_DIA_CERRADO' })
      case 'YA_ANULADO':
        return apiError('Este gasto ya fue anulado.', 409, { code: 'GASTO_YA_ANULADO' })
      case 'VERSION_CAMBIO':
        return apiError('Este gasto fue modificado por otra persona. Vuelve a cargarlo.', 409, { code: 'GASTO_CONFLICTO' })
      case 'OK':
        publishRealtimeEvent('gasto.updated', id).catch(() => {})
        return apiSuccess({ gasto: result.gasto })
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error al corregir gasto')
    return apiError('No fue posible guardar la corrección del gasto', 500)
  }
}
