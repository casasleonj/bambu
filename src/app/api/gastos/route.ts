import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { GastoCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { buildDateRangeFilter } from '@/lib/dates'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { NotificationEventType } from '@/lib/notifications/event-types'
import { parseFechaGasto } from '@/lib/fecha-gasto'
import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'
import { acquireAdvisoryLockTx } from '@/lib/locks'
import { esCategoriaPersonal } from '@/lib/gastos-categorias'

export async function GET(request: NextRequest) {
  const peticionInicio = performance.now()
  // FIX CRITICAL (C-SEC-4): Only ADMIN/CONTADOR can read gastos
  // Previously: requireAuth() only — any user could read internal cost data
  const authResult = await requireRole(['ADMIN', 'CONTADOR'])
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pagination = getPaginationParams(searchParams)

  try {
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const fecha = searchParams.get('fecha')
    const all = searchParams.get('all')

    let where: Record<string, unknown> = {}
    if (all === 'true') {
      where = {}
    } else {
      const dateFilter = buildDateRangeFilter(desde, hasta)
      if (dateFilter) {
        where = { fecha: dateFilter }
      } else if (fecha) {
        where = { fecha: buildDateRangeFilter(fecha, fecha) }
      }
    }

    // La vista de Gastos administra SOLO egresos operativos. Nómina y
    // Embarques se gestionan en su módulo original, aunque Cierre continúe
    // contabilizando todos los movimientos físicos/contables.
    if (searchParams.get('origen') === 'OPERATIVO') {
      where = {
        ...where,
        NOT: [
          { categoria: 'NOMINA' },
          { esPagoPersonal: true },
          { trabajadorId: { not: null } },
          { embarqueId: { not: null } },
          // En registros anteriores la anulación de Nómina usó categoría OTRO
          // y carece de vínculo: no ofrecerla como gasto operativo editable.
          { descripcion: { startsWith: 'Reversión nómina anulada -' } },
        ],
      }
    }

    const prismaPagination = getPrismaPagination(pagination)
    const consultaInicio = performance.now()

    // #755: paginar filas NO debe paginar el importe total del período.
    // El mismo snapshot PostgreSQL garantiza que lista, cantidad e importe
    // coincidan aunque se registre un gasto mientras se ejecuta la consulta.
    const [gastos, total, importes] = await prisma.$transaction([
      prisma.gasto.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        ...prismaPagination,
      }),
      prisma.gasto.count({ where }),
      prisma.gasto.aggregate({ where, _sum: { monto: true } }),
    ], { isolationLevel: 'RepeatableRead' })

    const consultaMs = Math.round(performance.now() - consultaInicio)
    const peticionMs = Math.round(performance.now() - peticionInicio)
    if (consultaMs > 1000 || peticionMs > 1500) {
      // Diagnóstico de latencia sin registrar importes, conceptos ni identidades.
      // La API mantiene la transacción que concilia filas, conteo y suma.
      logger.warn({ consultaMs, peticionMs, filas: gastos.length, pagina: pagination.page, origenOperativo: searchParams.get('origen') === 'OPERATIVO' }, 'Consulta de Gastos lenta')
    }
    const montoTotal = Number(importes._sum.monto ?? 0)
    const respuesta = apiSuccess(
      pagination.all
        ? { gastos, total, montoTotal }
        : { ...buildPaginationResponse(gastos, total, pagination.page!, pagination.pageSize!), montoTotal }
    )
    // Permite distinguir tiempo de PostgreSQL/Prisma de red, autenticación
    // y renderizado en herramientas de desarrollo sin alterar el JSON.
    respuesta.headers.set('Server-Timing', `gastos-db;dur=${consultaMs}, gastos-api;dur=${peticionMs}`)
    return respuesta
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching gastos:')
    return apiError('Error fetching gastos', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const actorId = (authResult.user as { id?: string } | undefined)?.id
  if (!actorId) return apiError('No se pudo identificar al usuario que registra el gasto', 401)
  try {
    const body = await request.json()
    const parsed = GastoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { categoria, descripcion, monto, responsable, notas, fecha } = parsed.data

    // #641: los pagos al personal se registran con «Pagar» en Nómina (con su medio de pago). Como gasto
    // manual se contarían dos veces en el cierre de caja.
    if (esCategoriaPersonal(categoria)) {
      return apiError(
        'Los pagos al personal se registran con «Pagar» en Nómina, no como gasto.',
        422,
        { code: 'NOMINA_NO_ES_GASTO' },
      )
    }

    // Fecha efectiva validada: YYYY-MM-DD pertenece a Bogotá, no a UTC.
    const fechaEfectiva = fecha ? parseFechaGasto(fecha) : new Date()
    if (!fechaEfectiva) return apiError('Fecha de gasto inválida', 400)
    const diaContable = startOfDayInBogota(dayInBogota(fechaEfectiva))

    // Mismo lock que POST /api/cierre: ninguna creación de gasto puede cruzarse
    // con el snapshot de un día ya cerrado. No reescribir cierres históricos.
    const gasto = await prisma.$transaction(async (tx) => {
      await acquireAdvisoryLockTx(tx, 'CIERRE', diaContable.toISOString())
      const cerrado = await tx.cierreDia.findUnique({ where: { fecha: diaContable }, select: { id: true } })
      if (cerrado) return null
      const creado = await tx.gasto.create({
        data: { categoria, descripcion, monto, responsable, notas, fecha: fechaEfectiva, createdById: actorId },
      })
      // #755: un gasto no queda registrado si falla su evidencia de autoría.
      // Misma transacción del cierre y del alta: sin auditorías fantasma.
      await logAudit({
        entidad: 'Gasto',
        registroId: creado.id,
        accion: 'CREATE',
        datos: { categoria, descripcion, monto, fecha: fechaEfectiva.toISOString() },
        usuarioId: actorId,
      }, tx)
      return creado
    })
    if (!gasto) {
      return apiError('Este día ya tiene cierre. Se requiere un ajuste contable autorizado.', 409, {
        code: 'GASTO_DIA_CERRADO',
      })
    }

    publishRealtimeEvent('gasto.created', gasto.id).catch(() => {})

    void notifyEvent(NotificationEventType.GASTO_CREADO, {
      title: 'Gasto registrado',
      body: `${categoria}: $${Number(monto).toLocaleString()}${descripcion ? ` — ${descripcion}` : ''}.`,
      url: `/gastos?openGasto=${gasto.id}`,
      tag: `gasto-${gasto.id}`,
    })

    return apiSuccess({ gasto }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating gasto:')
    return apiError('Error creating gasto', 500)
  }
}