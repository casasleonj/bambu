import { prisma } from '@/lib/prisma'
import { LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import { getConfigInt } from '@/lib/config'
import { unstable_cache } from 'next/cache'
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

  // Determinar filtro de riesgo activo (legacy, exclusivo)
  let filtroActivo: FiltroRiesgo = null
  if (resolvedSearchParams.bloqueado === 'true') filtroActivo = 'bloqueado'
  else if (resolvedSearchParams.reclamaciones === 'gte3') filtroActivo = 'reclamaciones'
  else if (resolvedSearchParams.noVerificado === 'true') filtroActivo = 'noVerificado'

  // FIX prod-performance: no cargar pedidos/facturas/abonos/pagos en el listado.
  // El listado solo necesita datos superficiales + contactos + negocios +
  // plantilla recurrente. El detalle (modal) carga el resto vía API.
  // FIX prod-performance: cachear datos de listado por 60s para reducir
  // impacto de cold-start + latencia a Supabase en Vercel Pro.
  const getClientesCached = unstable_cache(
    async (searchParamsJson: string) => {
      const params = JSON.parse(searchParamsJson) as ClientesSearchParams
      const cachedWhere = buildClientesWhere(params)

      const cachedClientes = await prisma.cliente.findMany({
        where: cachedWhere,
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

      const cachedSaldos = await prisma.pedido.groupBy({
        by: ['clienteId'],
        where: {
          saldo: { gt: 0 },
          estadoEntrega: 'ENTREGADO',
        },
        _sum: { saldo: true },
      })
      const cachedSaldoById = new Map(
        cachedSaldos.map(s => [s.clienteId, Number(s._sum.saldo ?? 0)])
      )

      return JSON.parse(JSON.stringify(cachedClientes)).map(
        (c: Record<string, unknown>) => ({
          ...c,
          clienteId: c.id,
          saldoPendiente: cachedSaldoById.get(c.id as string) ?? 0,
          preciosEspeciales: c.preciosEspeciales || undefined,
        })
      )
    },
    ['clientes-list'],
    { revalidate: 60, tags: ['clientes-list'] }
  )

  const serialized = await getClientesCached(JSON.stringify(resolvedSearchParams))

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
