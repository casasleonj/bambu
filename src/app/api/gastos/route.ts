import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { GastoCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getDateRange } from '@/lib/dates'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'

export async function GET(request: NextRequest) {
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
    } else if (desde && hasta) {
      const { startDate, endDate } = getDateRange(desde, hasta)
      where = { fecha: { gte: startDate, lt: endDate } }
    } else if (fecha) {
      where = {
        fecha: {
          gte: new Date(`${fecha}T00:00:00.000Z`),
          lt: new Date(`${fecha}T23:59:59.999Z`),
        },
      }
    }

    const prismaPagination = getPrismaPagination(pagination)

    const [gastos, total] = await Promise.all([
      prisma.gasto.findMany({
        where,
        orderBy: { fecha: 'desc' },
        ...prismaPagination,
      }),
      prisma.gasto.count({ where }),
    ])

    return apiSuccess(
      pagination.all
        ? { gastos, total }
        : buildPaginationResponse(gastos, total, pagination.page!, pagination.pageSize!)
    )
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
  try {
    const body = await request.json()
    const parsed = GastoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { categoria, descripcion, monto, responsable, notas, fecha } = parsed.data

    const gasto = await prisma.gasto.create({
      data: {
        categoria,
        descripcion,
        monto,
        responsable,
        notas,
        fecha: fecha ? new Date(fecha) : new Date(),
      },
    })

    logAudit({
      entidad: 'Gasto',
      registroId: gasto.id,
      accion: 'CREATE',
      datos: { categoria, descripcion, monto },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    publishRealtimeEvent('gasto.created', gasto.id).catch(() => {})

    return apiSuccess({ gasto }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating gasto:')
    return apiError('Error creating gasto', 500)
  }
}