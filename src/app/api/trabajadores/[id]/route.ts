import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { TrabajadorCreateSchema, TrabajadorUpdateSchema, normalizeTrabajador } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { publishRealtimeEvent } from '@/lib/realtime'
import { logger } from '@/lib/logger'
import { datosPagoTrabajador } from '@/lib/trabajadores-auditoria'

class EdicionTrabajadorError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const trabajador = await prisma.trabajador.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            embarques: true,
            nominas: true,
            deudas: true,
          },
        },
      },
    })
    if (!trabajador) {
      return apiError('Trabajador no encontrado', 404)
    }
    return apiSuccess({ trabajador })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching trabajador:')
    return apiError('Error cargando trabajador')
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = TrabajadorUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }
    const raw = parsed.data
    const trabajador = await prisma.$transaction(async tx => {
      // #671: leer después de bloquear la fila evita perder otra edición parcial.
      await tx.$queryRaw`SELECT id FROM "Trabajador" WHERE id = ${id} FOR UPDATE`
      const actual = await tx.trabajador.findUnique({ where: { id } })
      if (!actual) throw new EdicionTrabajadorError(404, 'Trabajador no encontrado')
      let data = raw
      // Cambiar un dato de contacto no normaliza ni borra configuración salarial
      // histórica, incluso cuando esa configuración anterior era incoherente.
      if (Object.keys(raw).some(campo => campo !== 'nombre' && campo !== 'telefono')) {
        const completo = TrabajadorCreateSchema.safeParse({
          ...actual, ...datosPagoTrabajador(actual), telefono: actual.telefono ?? undefined, ...raw,
        })
        if (!completo.success) throw new EdicionTrabajadorError(400, formatZodError(completo.error))
        data = normalizeTrabajador(completo.data)
      }
      // #644: la vigencia solo cambia si cambió el plan completo.
      const frecuencia = data.frecuenciaPago === undefined ? actual.frecuenciaPago : data.frecuenciaPago
      const dias = data.diasPago ?? actual.diasPago
      const cambioPlan = frecuencia !== actual.frecuenciaPago
        || dias.length !== actual.diasPago.length
        || dias.some((d, i) => d !== actual.diasPago[i])
      const guardado = await tx.trabajador.update({ where: { id }, data: {
        ...data,
        telefono: raw.telefono === undefined ? undefined : data.telefono,
        ...(cambioPlan ? { frecuenciaDesde: data.frecuenciaPago ? new Date() : null } : {}),
      } })
      const antes = datosPagoTrabajador(actual), despues = datosPagoTrabajador(guardado)
      await logAudit({
        entidad: 'Trabajador', registroId: id, accion: 'UPDATE',
        datos: { nombre: guardado.nombre, rol: guardado.rol, antes, despues,
          vigenteDesde: JSON.stringify(antes) === JSON.stringify(despues) ? null : guardado.updatedAt.toISOString() },
        usuarioId: (authResult.user as { id?: string } | undefined)?.id,
      }, tx)
      return guardado
    })

    publishRealtimeEvent('trabajador.updated', trabajador.id).catch(() => {})

    return apiSuccess({ trabajador })
  } catch (error) {
    if (error instanceof EdicionTrabajadorError) return apiError(error.message, error.status, { formErrors: [error.message] })
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('PUT trabajador error:', msg)
    return apiError('Error actualizando trabajador')
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    // FIX F-N18 (hallazgo 31): read+check+update DENTRO de tx.
    //
    // Antes: el read del trabajdor y el count de embarques activos
    // se hacían FUERA de tx. Dos requests casi simultáneos podían:
    //   T0: Admin A lee trabajdor (activo=true), count embarques=0
    //   T0: Admin B crea embarque para ese trabajdor (ABIERTO)
    //   T1: Admin A update trabajdor (activo=false)
    //   Estado final: trabajdor inactivo con embarque abierto
    //
    // Ahora: prisma.$transaction con row lock implícito. Si B hace
    // un INSERT en embarque entre el count y el update, A espera
    // el row lock del trabajdor (re-lee) y ve count>0 → rechaza.
    const result = await prisma.$transaction(async (tx) => {
      const trabajador = await tx.trabajador.findUnique({ where: { id } })
      if (!trabajador) {
        throw new Error('TRABAJADOR_NOT_FOUND')
      }
      if (!trabajador.activo) {
        throw new Error('TRABAJADOR_YA_DESACTIVADO')
      }

      const embarquesActivos = await tx.embarque.count({
        where: { trabajadorId: id, estado: { in: ['ABIERTO', 'EN_RUTA'] } },
      })
      if (embarquesActivos > 0) {
        throw new Error(`EMBARQUES_ACTIVOS:${embarquesActivos}`)
      }

      return tx.trabajador.update({
        where: { id },
        data: { activo: false },
      })
    })

    logAudit({
      entidad: 'Trabajador',
      registroId: result.id,
      accion: 'DELETE',
      datos: { nombre: result.nombre, rol: result.rol },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    publishRealtimeEvent('trabajador.deleted', result.id).catch(() => {})

    return apiSuccess({})
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TRABAJADOR_NOT_FOUND') return apiError('Trabajador no encontrado', 404)
      if (error.message === 'TRABAJADOR_YA_DESACTIVADO') return apiError('El trabajador ya esta desactivado', 409)
      if (error.message.startsWith('EMBARQUES_ACTIVOS:')) {
        const count = error.message.split(':')[1]
        return apiError(
          `No se puede desactivar: tiene ${count} embarque(s) activo(s) (abierto o en ruta). Cierrellos primero.`,
          400
        )
      }
    }
    return apiError('Error eliminando trabajador')
  }
}
