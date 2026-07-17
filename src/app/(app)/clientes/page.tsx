import { prisma } from '@/lib/prisma'
import { LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import { getConfigInt } from '@/lib/config'
import ClientesClient from './clientes-client'
import {
  buildClientesWhere,
  type ClientesSearchParams,
  type MostrarNegocio,
} from '@/lib/cliente-filters'

export type FiltroRiesgo = 'bloqueado' | 'reclamaciones' | 'noVerificado' | null

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<ClientesSearchParams>
}) {
  const resolvedSearchParams = await searchParams
  const where = buildClientesWhere(resolvedSearchParams)

  // Determinar filtro de riesgo activo (legacy, exclusivo)
  let filtroActivo: FiltroRiesgo = null
  if (resolvedSearchParams.bloqueado === 'true') filtroActivo = 'bloqueado'
  else if (resolvedSearchParams.reclamaciones === 'gte3') filtroActivo = 'reclamaciones'
  else if (resolvedSearchParams.noVerificado === 'true') filtroActivo = 'noVerificado'

  // FIX prod-performance: no cargar pedidos/facturas/abonos/pagos en el listado.
  // El listado solo necesita datos superficiales + contactos + negocios +
  // plantilla recurrente. El detalle (modal) carga el resto vía API.
  // FIX prod-performance: limitar listado inicial a 100 clientes.
  // La búsqueda global de todos los clientes requiere server-side search o
  // paginación (follow-up); por ahora se prioriza que la página cargue en
  // producción en tiempos aceptables.
  const clientes = await prisma.cliente.findMany({
    where,
    orderBy: { nombre: 'asc' },
    take: 100,
    include: {
      _count: { select: { pedidos: true } },
      contactos: { orderBy: { nombre: 'asc' } },
      negocios: {
        where: { activo: true },
        select: {
          id: true,
          nombre: true,
          tipoNegocio: true,
          direccion: true,
          barrio: true,
          referencia: true,
          linkUbicacion: true,
        },
      },
      plantillaRecurrente: true,
    },
  })

  // Calcular saldoPendiente de todos los clientes en una sola query agregada
  // en lugar de traer todos los pedidos con facturas/abonos/pagos.
  const saldosPendientes = await prisma.pedido.groupBy({
    by: ['clienteId'],
    where: {
      saldo: { gt: 0 },
      estadoEntrega: 'ENTREGADO',
    },
    _sum: { saldo: true },
  })
  const saldoByClienteId = new Map(
    saldosPendientes.map(s => [s.clienteId, Number(s._sum.saldo ?? 0)])
  )

  // Serialize Prisma objects (Date, Decimal) for client component props.
  // Also map id -> clienteId to match the shape the client component expects.
  const serialized = JSON.parse(JSON.stringify(clientes)).map(
    (c: Record<string, unknown>) => ({
      ...c,
      clienteId: c.id,
      saldoPendiente: saldoByClienteId.get(c.id as string) ?? 0,
      preciosEspeciales: c.preciosEspeciales || undefined,
    })
  )

  const limiteGlobalFiados = await getConfigInt('LIMITE_PEDIDOS_FIADOS_DEFAULT', LIMITE_FIADOS_DEFAULT)

  const filtrosActivos = {
    mostrarNegocio: (resolvedSearchParams.mostrarNegocio ?? 'todos') as MostrarNegocio,
    todosNegociosConLink: resolvedSearchParams.todosNegociosConLink === 'true',
    clienteConLink: resolvedSearchParams.clienteConLink === 'true',
  }

  return (
    <ClientesClient
      initialClientes={serialized}
      initialLimiteFiados={limiteGlobalFiados}
      openClienteId={resolvedSearchParams.openCliente}
      filtroActivo={filtroActivo}
      filtrosActivos={filtrosActivos}
    />
  )
}
