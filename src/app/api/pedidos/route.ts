import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/nextjs'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { PedidoCreateSchema } from '@/lib/validators'
import { getPaginationParams, buildPaginationResponse } from '@/lib/pagination'
import { getTodayRange, buildDateRangeFilter, startOfDayBogota } from '@/lib/dates'
import { normalizeCanalFilter } from '@/lib/pedido-canal'
import { ROLES } from '@/lib/constants'
import { getAnonymousClientDisplayName } from '@/lib/cliente-canonical'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import {
  crearPedidoUseCase,
  listarPedidosUseCase,
} from '@/modules/pedidos'
import { findPedidosHoyEnRiesgoIds } from '@/lib/pedidos-sin-asignar'
import { publishRealtimeEvent } from '@/lib/realtime'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { NotificationEventType } from '@/lib/notifications/event-types'
import { pickCoords } from '@/lib/geo/pedido-coords'
import { pickDireccionTexto } from '@/lib/geo/pedido-direccion'

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
    // G6: filtro por `canal`; acepta el param legacy `?tipo=ENVIO|PUNTO`.
    const canalFilter = normalizeCanalFilter([...searchParams.getAll('canal'), ...searchParams.getAll('tipo')])
    const scopeFilter = searchParams.get('scope')
    // "Sin asignar de días anteriores" — ver src/lib/pedidos-sin-asignar.ts.
    // No aplica a REPARTIDOR (solo ve pedidos ya asignados a él por diseño,
    // más arriba se fuerza embarqueId: { not: null } para ese rol).
    const atrasadosMode = searchParams.get('atrasados') === 'true' && session.user?.role !== 'REPARTIDOR'
    // "En riesgo de hoy" — ver findPedidosHoyEnRiesgoIds en pedidos-sin-asignar.ts.
    // Mismo motivo que atrasadosMode: no aplica a REPARTIDOR.
    const enRiesgoMode = searchParams.get('enRiesgo') === 'true' && session.user?.role !== 'REPARTIDOR'

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
    } else {
      const dateFilter = buildDateRangeFilter(desde, hasta)
      if (dateFilter) {
        if (dateFilter.gte) filter.desde = dateFilter.gte
        if (dateFilter.lte) filter.hasta = dateFilter.lte
      } else {
        const { startOfDay, endOfDay } = getTodayRange()
        filter.desde = startOfDay
        filter.hasta = endOfDay
      }
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
    if (canalFilter.length > 0) {
      filter.canal = canalFilter
    }
    if (scopeFilter === 'fiados' || scopeFilter === 'alertas') {
      filter.scope = scopeFilter
    }

    // Gana sobre cualquier estadoEntrega/desde/hasta que haya llegado por
    // URL — atrasados=true es una vista autocontenida (mismo criterio que
    // ya siguen scope=fiados/alertas), no se combina con otros filtros.
    if (atrasadosMode) {
      // FIX: incluir NO_ENTREGADO — mismo criterio que whereAtrasadosSinAsignar
      // en pedidos-sin-asignar.ts (un pedido despachado y no entregado, sin
      // reasignar, queda embarqueId:null y nunca vuelve a PENDIENTE por sí
      // solo, así que quedaba invisible en esta vista).
      filter.estadoEntrega = ['PENDIENTE', 'NO_ENTREGADO']
      filter.embarqueId = null
      filter.desde = undefined
      filter.hasta = startOfDayBogota()
    }

    // "En riesgo" no es un Prisma.PedidoWhereInput estático como atrasados
    // (depende de un cómputo de rutas/embarques/horas hábiles resuelto en
    // pedidos-sin-asignar.ts), así que se resuelve a una lista de IDs y se
    // filtra por `id: { in }`. Vista autocontenida igual que atrasadosMode:
    // gana sobre cualquier otro filtro. OJO: a diferencia de atrasadosMode,
    // NO se fuerza estadoEntrega/embarqueId aquí — findPedidosHoyEnRiesgoIds
    // puede devolver tanto PENDIENTE sin asignar como EN_RUTA sin entregar,
    // y forzar esos campos filtraría incorrectamente los EN_RUTA.
    if (enRiesgoMode) {
      const ids = await findPedidosHoyEnRiesgoIds()
      filter.id = ids
      filter.estadoEntrega = undefined
      filter.embarqueId = undefined
      filter.desde = undefined
      filter.hasta = undefined
    }

    // Cuando all=true, permitir un pageSize mayor al cap de 100 de
    // getPaginationParams (compartido con otros endpoints paginados) para
    // soportar el cache-driven UI de /pedidos. El tope duro de seguridad
    // (1000) vive en ListarPedidosUseCase, independiente de este valor.
    // BUG evitado: si all=true y NO viene pageSize explícito, NO debe caer
    // al default de paginación normal (20) — eso truncaba silenciosamente
    // a los callers preexistentes de all=true sin pageSize (fiados/alertas,
    // etc.) que antes recibían el default de 200 del use case. Se pasa
    // `undefined` en ese caso para que ListarPedidosUseCase aplique SU
    // propio default (200), preservando el comportamiento previo.
    const rawPageSizeParam = all === 'true' ? searchParams.get('pageSize') : null
    const rawPageSize = rawPageSizeParam ? parseInt(rawPageSizeParam, 10) : NaN
    const effectivePageSize = all === 'true'
      ? (Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : undefined)
      : (pagination.pageSize || 20)

    const result = await listarPedidosUseCase.execute({
      ...filter,
      page: pagination.page || 1,
      pageSize: effectivePageSize,
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
      const nombreNegocio = negocio?.nombre || null
      // Dirección de texto efectiva (regla única pickDireccionTexto): el
      // snapshot propio del pedido gana sobre negocio, que gana sobre cliente.
      const direccionEfectiva = pickDireccionTexto({
        cliente,
        negocio,
        overrideDireccion: p.direccionEntrega,
        overrideBarrio: p.barrioEntrega,
      })
      const horaApertura = negocio?.horaApertura || null
      const rutaNombre = negocio?.ruta?.nombre || cliente?.ruta?.nombre
      // Coords efectivas (regla única pickCoords: negocio gana, fallback cliente).
      const coordsEfectivas = pickCoords({ cliente, negocio })

      return {
        ...p,
        nombreCli: getAnonymousClientDisplayName(p.clienteId, 'short') ?? (cliente?.nombre || 'Desconocido'),
        apellidoCli: cliente?.apellido || null,
        telefonoCli: cliente?.telefono || '',
        zonaCli: direccionEfectiva.direccion,
        barrioCli: direccionEfectiva.barrio,
        nombreNegocioCli: nombreNegocio,
        horaAperturaCli: horaApertura,
        rutaNombre,
        lat: coordsEfectivas?.lat ?? null,
        lng: coordsEfectivas?.lng ?? null,
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
      direccionEntrega,
      barrioEntrega,
      origen,
      ventaRapida,
      entregado,
      offlineId,
    } = parsed.data

    // ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001: el toggle "entregar después" de la
    // venta rápida solo se respeta con el flag activo; sin él, se ignora y la
    // venta rápida fuerza ENTREGADO como siempre.
    const entregadoInput =
      process.env.NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR === 'true' ? entregado : undefined

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
      entregado: entregadoInput,
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
      direccionEntrega,
      barrioEntrega,
      createdById: authResult.user?.id ?? undefined,
      createdByRole: authResult.user?.role ?? undefined,
    })

    if (!result.deduped) {
      publishRealtimeEvent('pedido.created', result.pedido.id).catch(() => {})
      // Push notification for new pedido (replaces SSE for off-tab users).
      // Fire-and-forget: never block the request on push delivery.
      void notifyEvent(NotificationEventType.PEDIDO_CREADO, {
        title: 'Pedido nuevo',
        body: `Se creó un pedido nuevo.`,
        url: `/pedidos?openPedido=${result.pedido.id}`,
        tag: `pedido-${result.pedido.id}`,
      })

      // G5.1: "fiado" = queda saldo pendiente. Un pedido ANTICIPADO (pagado
      // completo, entrega posterior) NO es fiado.
      if (Number(result.pedido.saldo) > 0) {
        void notifyEvent(NotificationEventType.FIADO_GENERADO, {
          title: 'Fiado generado',
          body: `Pedido #${result.pedido.numero} quedó fiado (pendiente de pago).`,
          url: `/pedidos?openPedido=${result.pedido.id}`,
          tag: `fiado-${result.pedido.id}`,
        })
      }
    }

    // FIX M4-OFFLINE: devolver 200 + deduped=true cuando el pedido ya existía
    // (reintento offline). Antes siempre devolvía 201, rompiendo el contrato
    // offline-first con los hooks que esperan 200 para dedup.
    return apiSuccess({ pedido: result.pedido, deduped: result.deduped }, result.deduped ? 200 : 201)
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
