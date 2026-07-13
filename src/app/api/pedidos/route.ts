import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/nextjs'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { PedidoCreateSchema } from '@/lib/validators'
import { getPaginationParams, buildPaginationResponse } from '@/lib/pagination'
import { getTodayRange, getDateRange } from '@/lib/dates'
import { ROLES } from '@/lib/constants'
import { getAnonymousClientDisplayName } from '@/lib/cliente-canonical'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import {
  crearPedidoUseCase,
  listarPedidosUseCase,
} from '@/modules/pedidos'
import { publishRealtimeEvent } from '@/lib/realtime'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pagination = getPaginationParams(searchParams)
  const session = authResult as { user?: { id?: string; role?: string } }

  try {
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const all = searchParams.get('all')
    const clienteFilter = searchParams.get('clienteId')
    const estadoEntregaFilter = searchParams.getAll('estadoEntrega')
    const estadoPagoFilter = searchParams.getAll('estadoPago')
    const origenFilter = searchParams.getAll('origen')
    const tipoFilter = searchParams.getAll('tipo')
    const scopeFilter = searchParams.get('scope')

    // Build filter for use case
    const filter: Record<string, unknown> = {}

    if (session.user?.role === 'REPARTIDOR') {
      // REPARTIDOR logic remains in handler (auth concern)
      // For now, fallback to simple date filter; repartidor-specific filtering
      // would require a dedicated use case with trabajador lookup.
      // To maintain exact backward compatibility, we keep the Prisma query for role filtering.
      // TODO: Move REPARTIDOR filter to a dedicated query object in infrastructure.
      const { prisma } = await import('@/lib/prisma')
      const trabajador = await prisma.trabajador.findFirst({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (trabajador) {
        (filter as Record<string, unknown>).embarqueId = { not: null }
      } else {
        return apiSuccess({ pedidos: [], total: 0 })
      }
    }

    if (all === 'true') {
      if (session.user?.role !== 'REPARTIDOR') {
        // No filter
      }
    } else if (desde && hasta) {
      const { startDate, endDate } = getDateRange(desde, hasta)
      filter.desde = startDate
      filter.hasta = endDate
    } else {
      const { startOfDay, endOfDay } = getTodayRange()
      filter.desde = startOfDay
      filter.hasta = endOfDay
    }

    if (clienteFilter) {
      filter.clienteId = clienteFilter
    }
    if (estadoEntregaFilter.length > 0) {
      filter.estadoEntrega = estadoEntregaFilter
    }
    if (estadoPagoFilter.length > 0) {
      filter.estadoPago = estadoPagoFilter
    }
    if (origenFilter.length > 0) {
      filter.origen = origenFilter
    }
    if (tipoFilter.length > 0) {
      filter.tipo = tipoFilter
    }
    if (scopeFilter === 'fiados' || scopeFilter === 'alertas') {
      filter.scope = scopeFilter
    }

    const result = await listarPedidosUseCase.execute({
      ...filter,
      page: pagination.page || 1,
      pageSize: pagination.pageSize || 20,
      all: all === 'true',
    })

    // NEGOCIO COMPATIBILITY: enrich with legacy fields
    // FIX N+1: batch-fetch clientes and negocios in two queries instead of
    // one findUnique per pedido.
    const { prisma } = await import('@/lib/prisma')
    const clienteIds = [...new Set(result.pedidos.map(p => p.clienteId))]
    const negocioIds = [
      ...new Set(result.pedidos.map(p => p.negocioId).filter((id): id is string => Boolean(id))),
    ]
    const [clientes, negocios] = await Promise.all([
      prisma.cliente.findMany({
        where: { id: { in: clienteIds } },
        include: { ruta: { select: { nombre: true } } },
      }),
      negocioIds.length > 0
        ? prisma.negocio.findMany({
            where: { id: { in: negocioIds } },
            include: { ruta: { select: { nombre: true } } },
          })
        : Promise.resolve([]),
    ])
    const clienteById = new Map(clientes.map(c => [c.id, c]))
    const negocioById = new Map(negocios.map(n => [n.id, n]))

    const enriched = result.pedidos.map(p => {
      const cliente = clienteById.get(p.clienteId)
      const negocio = p.negocioId ? negocioById.get(p.negocioId) : undefined
      const nombreNegocio = negocio?.nombre || cliente?.nombreNegocio || null
      const direccion = negocio?.direccion ?? cliente?.direccion
      const barrio = negocio?.barrio ?? cliente?.barrio
      const horaApertura = negocio?.horaApertura ?? cliente?.horaApertura
      const rutaNombre = negocio?.ruta?.nombre || cliente?.ruta?.nombre

      return {
        ...p,
        nombreCli: getAnonymousClientDisplayName(p.clienteId, 'short') ?? (cliente?.nombre || 'Desconocido'),
        apellidoCli: cliente?.apellido || null,
        telefonoCli: cliente?.telefono || '',
        zonaCli: direccion || '',
        barrioCli: barrio || '',
        nombreNegocioCli: nombreNegocio,
        horaAperturaCli: horaApertura || null,
        rutaNombre,
        fecha: p.fecha,
      }
    })

    return apiSuccess(
      pagination.all
        ? { pedidos: enriched, total: result.total }
        : buildPaginationResponse(enriched, result.total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching pedidos:')
    return apiError('Error cargando pedidos')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = PedidoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const {
      clienteId,
      negocioId,
      items,
      productos,
      obs,
      fechaEntrega,
      canal,
      preciosManuales,
      clienteNuevo,
      actualizarCliente,
      origen,
      ventaRapida,
      offlineId,
    } = parsed.data

    const pagosData = parsed.data.pagos || []

    // FIX F-N10: el dedup por offlineId se movió al CrearPedidoUseCase
    // (dentro del lock 'PEDIDO'). Antes este check estaba aquí, pero
    // dos requests idénticos (mismo offlineId) podían ambos pasar el
    // check (findUnique retorna null porque el primero no había
    // commiteado), ambos entrar al use case, y el segundo chocaba con
    // la unique constraint de Pedido.offlineId → P2002 → 500.
    //
    // Ahora: el use case corre el check DENTRO del lock. Si el pedido
    // ya existe, retorna { deduped: true } sin hacer trabajo.

    // Normalize items (support both new items[] and legacy productos{})
    const itemsInput = items && items.length > 0
      ? items.filter((i: { cantidad: number }) => i.cantidad > 0).map((i: { producto: string; cantidad: number; precioManual?: number }) => ({
          producto: i.producto as import('@/shared/domain').ProductCode,
          cantidad: i.cantidad,
          precioManual: i.precioManual,
        }))
      : productos
        ? [
            { producto: 'PACA_AGUA' as const, cantidad: productos.pacaAgua || 0, precioManual: preciosManuales?.['PACA_AGUA'] },
            { producto: 'PACA_HIELO' as const, cantidad: productos.pacaHielo || 0, precioManual: preciosManuales?.['PACA_HIELO'] },
            { producto: 'BOTELLON' as const, cantidad: productos.botellon || 0, precioManual: preciosManuales?.['BOTELLON'] },
            { producto: 'BOLSA_AGUA' as const, cantidad: productos.bolsaAgua || 0, precioManual: preciosManuales?.['BOLSA_AGUA'] },
            { producto: 'BOLSA_HIELO' as const, cantidad: productos.bolsaHielo || 0, precioManual: preciosManuales?.['BOLSA_HIELO'] },
          ].filter(i => i.cantidad > 0)
        : []

    if (itemsInput.length === 0) {
      return apiError('Agrega al menos un producto', 400)
    }

    const result = await crearPedidoUseCase.execute({
      clienteId,
      negocioId,
      canal: (canal || 'DOMICILIO') as import('@/modules/pedidos/domain/types').Canal,
      origen: origen as import('@/modules/pedidos/domain/types').OrigenPedido | undefined,
      items: itemsInput,
      pagos: pagosData.map((p: { metodo: string; monto: number }) => ({
        metodo: p.metodo as import('@/modules/pedidos/domain/types').MetodoPago,
        monto: p.monto,
      })),
      obs,
      fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : undefined,
      ventaRapida,
      offlineId,
      clienteNuevo: clienteNuevo ? {
        nombre: clienteNuevo.nombre,
        apellido: clienteNuevo.apellido,
        telefono: clienteNuevo.telefono,
        direccion: clienteNuevo.direccion,
        barrio: clienteNuevo.barrio,
        fuente: clienteNuevo.fuente,
      } : undefined,
      actualizarCliente: actualizarCliente ? {
        direccion: actualizarCliente.direccion,
        barrio: actualizarCliente.barrio,
      } : undefined,
      createdById: authResult.user?.id ?? undefined,
      createdByRole: authResult.user?.role ?? undefined,
    })

    if (!result.deduped) {
      publishRealtimeEvent('pedido.created', result.pedido.id).catch(() => {})
    }

    return apiSuccess({ pedido: result.pedido }, 201)
  } catch (error) {
    Sentry.captureException(error, {
      extra: { route: 'POST /api/pedidos' },
    })

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return apiError('Datos duplicados. Verificá que no estés creando el mismo pedido dos veces.', 409)
      }
      if (error.code === 'P2003') {
        return apiError('Referencia inválida. Algun cliente o negocio no existe.', 400)
      }
      if (error.code === 'P2022') {
        return apiError('Error de base de datos: columna no encontrada. Contactá a soporte.', 500)
      }
      logger.error({ err: error.message, code: error.code }, 'Error creating pedido (Prisma):')
      return apiError('Error de base de datos. Contactá a soporte.', 500, { code: error.code })
    }

    if (error instanceof Error) {
      if (error.message === 'CLIENTE_NOT_FOUND') return apiError('Cliente no encontrado', 404)
      if (error.message.startsWith('CLIENTE_DEBE:')) return apiError(error.message.replace('CLIENTE_DEBE: ', ''), 400)
      if (error.message === 'SIN_PRODUCTOS') return apiError('Agrega al menos un producto', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating pedido:')
    return apiError('Error creando pedido')
  }
}
