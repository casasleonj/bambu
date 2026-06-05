import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { FacturaCreateSchema } from '@/lib/validators'
import { getNextNumero } from '@/lib/sequence'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getDateRange } from '@/lib/dates'
import { logAudit } from '@/lib/audit'
import { withAdvisoryLock } from '@/lib/locks'
import type { Factura } from '@prisma/client'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

async function getEmpresaSnapshot(): Promise<{
  empresaNombre: string
  empresaNit: string
  empresaDireccion: string
  empresaTelefono: string
  empresaEmail: string
}> {
  const configs = await prisma.config.findMany({
    where: {
      clave: { in: ['empresa_nombre', 'empresa_nit', 'empresa_direccion', 'empresa_telefono', 'empresa_email'] },
    },
  })
  const map: Record<string, string> = {}
  configs.forEach(c => { map[c.clave] = c.valor })
  return {
    empresaNombre: map.empresa_nombre || 'Agua Bambú SAS',
    empresaNit: map.empresa_nit || '900.123.456-7',
    empresaDireccion: map.empresa_direccion || '',
    empresaTelefono: map.empresa_telefono || '',
    empresaEmail: map.empresa_email || '',
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pendiente = searchParams.get('pendiente') === 'true'
  const pagination = getPaginationParams(searchParams)

  try {
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const all = searchParams.get('all')

    let where: Record<string, unknown> = pendiente ? { saldo: { gt: 0 } } : {}
    if (desde && hasta) {
      const { startDate, endDate } = getDateRange(desde, hasta)
      where.fecha = { gte: startDate, lt: endDate }
    }
    if (all === 'true') {
      delete where.fecha
    }
    const prismaPagination = getPrismaPagination(pagination)

    const [facturas, total] = await Promise.all([
      prisma.factura.findMany({
        where,
        orderBy: { fecha: 'desc' },
        include: { cliente: true, abonos: true, pedido: true },
        ...prismaPagination,
      }),
      prisma.factura.count({ where }),
    ])

    return apiSuccess(
      pagination.all
        ? { facturas, total }
        : buildPaginationResponse(facturas, total, pagination.page!, pagination.pageSize!)
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

    const empresaSnapshot = await getEmpresaSnapshot()

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
