import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listarPedidosUseCase } from '@/modules/pedidos'
import { buildDateRangeFilter, getTodayRange } from '@/lib/dates'
import { getAnonymousClientDisplayName } from '@/lib/cliente-canonical'
import { getPaginationParams } from '@/lib/pagination'
import type { PedidoResumenDTO } from '@/modules/pedidos/application/dto'
import { PedidosClient } from './pedidos-client'

export type { PedidoResumenDTO }

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role

  // Build URLSearchParams from the parsed searchParams for consistent filtering
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) {
      value.forEach(v => params.append(key, v))
    } else if (value !== undefined) {
      params.set(key, value)
    }
  }

  const pagination = getPaginationParams(params)
  const desde = params.get('desde')
  const hasta = params.get('hasta')
  const all = params.get('all') === 'true'

  // Build filter same as GET /api/pedidos
  const filter: Record<string, unknown> = {}

  // REPARTIDOR role filter
  if (role === 'REPARTIDOR') {
    const userId = session?.user?.id
    if (userId) {
      const trabajador = await prisma.trabajador.findFirst({
        where: { userId },
        select: { id: true },
      })
      if (trabajador) {
        filter.embarqueId = { not: null }
      } else {
        return <PedidosClient />
      }
    }
  }

  // Date filter
  if (all) {
    // No date filter for all=true
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

  // Scalar filters
  const clienteFilter = params.get('clienteId')
  if (clienteFilter) filter.clienteId = clienteFilter

  const estadoEntregaFilter = params.getAll('estadoEntrega')
  if (estadoEntregaFilter.length > 0) filter.estadoEntrega = estadoEntregaFilter

  const estadoPagoFilter = params.getAll('estadoPago')
  if (estadoPagoFilter.length > 0) filter.estadoPago = estadoPagoFilter

  const origenFilter = params.getAll('origen')
  if (origenFilter.length > 0) filter.origen = origenFilter

  const tipoFilter = params.getAll('tipo')
  if (tipoFilter.length > 0) filter.tipo = tipoFilter

  const scopeFilter = params.get('scope')
  if (scopeFilter === 'fiados' || scopeFilter === 'alertas') {
    filter.scope = scopeFilter
  }

  try {
    const result = await listarPedidosUseCase.execute({
      ...filter,
      page: pagination.page || 1,
      pageSize: pagination.pageSize || 20,
      all,
    })

    // Batch enrichment: load clientes + negocios for legacy display fields
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
      return {
        ...p,
        nombreCli: getAnonymousClientDisplayName(p.clienteId, 'short') ?? (cliente?.nombre || 'Desconocido'),
        apellidoCli: cliente?.apellido || null,
        telefonoCli: cliente?.telefono || '',
        zonaCli: (negocio?.direccion ?? cliente?.direccion) || '',
        barrioCli: (negocio?.barrio ?? cliente?.barrio) || '',
        nombreNegocioCli: negocio?.nombre || null,
        horaAperturaCli: negocio?.horaApertura || null,
        rutaNombre: negocio?.ruta?.nombre || cliente?.ruta?.nombre,
      }
    })

    // Serialize: handle Prisma Decimal/Date types
    const serialized = JSON.parse(JSON.stringify(enriched))

    return (
      <PedidosClient
        initialPedidos={serialized}
      />
    )
  } catch (error) {
    // On error, fall back to client-side fetching (graceful degradation)
    console.error('PedidosPage data fetch failed:', error)
    return <PedidosClient />
  }
}
