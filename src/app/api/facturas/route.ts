import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { FacturaCreateSchema } from '@/lib/validators'
import { getNextNumero } from '@/lib/sequence'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { buildDateRangeFilter } from '@/lib/dates'
import { logAudit } from '@/lib/audit'
import { withAdvisoryLock } from '@/lib/locks'
import type { Factura } from '@prisma/client'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getFacturaEmpresaSnapshot } from '@/lib/factura-empresa'

export async function GET(request: NextRequest) {
  // FIX CRITICAL (C-SEC-1): Only ADMIN/CONTADOR can read facturas
  // Previously: requireAuth() only — any logged-in user (incl. REPARTIDOR) could read all financial data
  const authResult = await requireRole(['ADMIN', 'CONTADOR'])
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pendiente = searchParams.get('pendiente') === 'true'
  const pagination = getPaginationParams(searchParams)

  try {
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const all = searchParams.get('all')

    let where: Record<string, unknown> = pendiente ? { saldo: { gt: 0 } } : {}
    if (all !== 'true') {
      const dateFilter = buildDateRangeFilter(desde, hasta)
      if (dateFilter) {
        where.fecha = dateFilter
      }
    }
    const prismaPagination = getPrismaPagination(pagination)

    const [facturas, total, agregados] = await Promise.all([
      prisma.factura.findMany({
        where,
        orderBy: { fecha: 'desc' },
        select: {
          id: true,
          numero: true,
          fecha: true,
          subtotal: true,
          total: true,
          saldo: true,
          montoPagado: true,
          estado: true,
          empresaNombre: true,
          empresaNit: true,
          empresaDireccion: true,
          empresaTelefono: true,
          empresaEmail: true,
          cliente: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              direccion: true,
              barrio: true,
              nombreNegocio: true,
            },
          },
          pedido: {
            select: { id: true, numero: true },
          },
        },
        ...prismaPagination,
      }),
      prisma.factura.count({ where }),
      prisma.factura.aggregate({
        where,
        _sum: { total: true, saldo: true, montoPagado: true },
        _count: { _all: true },
      }),
    ])

    const totales = {
      totalFacturado: Number(agregados._sum.total ?? 0),
      totalCobrado: Number(agregados._sum.montoPagado ?? 0),
      totalPorCobrar: Number(agregados._sum.saldo ?? 0),
      count: agregados._count._all,
    }

    return apiSuccess(
      pagination.all
        ? { facturas, total, totales }
        : { ...buildPaginationResponse(facturas, total, pagination.page!, pagination.pageSize!), totales }
    )
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching facturas:')
    return apiError('Error fetching facturas', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = FacturaCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { pedidoId, clienteId } = parsed.data

    const empresaSnapshot = await getFacturaEmpresaSnapshot()

    const factura = await withAdvisoryLock<Factura>('FACTURA_NUM', async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id: pedidoId },
        include: { cliente: true, factura: true },
      })

      if (!pedido) {
        throw new Error('Pedido no encontrado')
      }

      if (pedido.factura) {
        throw new Error('El pedido ya tiene una factura')
      }

      if (pedido.clienteId !== clienteId) {
        throw new Error('CLIENTE_NO_COINCIDE')
      }

      const nextNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })

      return tx.factura.create({
        data: {
          numero: `FAC-${nextNum.toString().padStart(5, '0')}`,
          clienteId,
          pedidoId,
          subtotal: pedido.total,
          total: pedido.total,
          saldo: pedido.total,
          ...empresaSnapshot,
        },
      })
    })

    logAudit({
      entidad: 'Factura',
      registroId: factura.id,
      accion: 'CREATE',
      datos: { numero: factura.numero, pedidoId, total: Number(factura.total) },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({ factura }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    if (message === 'Pedido no encontrado') {
      return apiError('Pedido no encontrado', 404)
    }
    if (message === 'El pedido ya tiene una factura') {
      return apiError('El pedido ya tiene una factura', 409)
    }
    if (message === 'CLIENTE_NO_COINCIDE') {
      return apiError('El cliente del body no coincide con el cliente del pedido', 400)
    }
    logger.error({ err: message }, 'Error creating factura:')
    return apiError('Error creating factura', 500)
  }
}
