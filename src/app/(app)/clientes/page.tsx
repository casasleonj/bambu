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

  const clientes = await prisma.cliente.findMany({
    where,
    orderBy: { nombre: 'asc' },
    include: {
      _count: { select: { pedidos: true } },
      pedidos: {
        where: {
          saldo: { gt: 0 },
          estadoEntrega: 'ENTREGADO',
        },
        include: {
          factura: {
            include: {
              abonos: true,
            },
          },
          pagos: true,
        },
      },
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
    },
  })

  // Serialize Prisma objects (Date, Decimal) for client component props.
  // Also map id -> clienteId to match the shape the client component expects.
  // Calculate saldoPendiente from pedidos with saldo > 0
  const serialized = JSON.parse(JSON.stringify(clientes)).map(
    (c: Record<string, unknown>) => ({
      ...c,
      clienteId: c.id,
      saldoPendiente: (c.pedidos as Array<{ saldo: number }>).reduce(
        (sum: number, p: { saldo: number }) => sum + Number(p.saldo), 0
      ),
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
