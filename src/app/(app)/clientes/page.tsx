import type { ClientesClientProps } from './clientes-client/types'
import { LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import { getConfigInt } from '@/lib/config'
import {
  fetchClientesList,
  parseClienteListParams,
} from '@/lib/clientes-repo'
import ClientesClient from './clientes-client'
import {
  resolveUbicacionMaps,
  type ClientesSearchParams,
  type MostrarNegocio,
} from '@/lib/cliente-filters'

export type FiltroRiesgo = 'bloqueado' | 'reclamaciones' | 'noVerificado' | null

const DEFAULT_PAGE_SIZE = 25

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

  const page = Math.max(1, parseInt(resolvedSearchParams.page || '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(resolvedSearchParams.pageSize || String(DEFAULT_PAGE_SIZE), 10)))
  const search = resolvedSearchParams.search || ''

  // Consulta directa a la base de datos (sin HTTP interno) usando el
  // mismo repositorio que GET /api/clientes. Elimina el cold start duplicado.
  const apiParams = new URLSearchParams()
  apiParams.set('page', String(page))
  apiParams.set('pageSize', String(pageSize))
  if (search) apiParams.set('search', search)
  if (resolvedSearchParams.bloqueado) apiParams.set('bloqueado', resolvedSearchParams.bloqueado)
  if (resolvedSearchParams.reclamaciones) apiParams.set('reclamaciones', resolvedSearchParams.reclamaciones)
  if (resolvedSearchParams.noVerificado) apiParams.set('noVerificado', resolvedSearchParams.noVerificado)
  if (resolvedSearchParams.mostrarNegocio) apiParams.set('mostrarNegocio', resolvedSearchParams.mostrarNegocio)
  if (resolvedSearchParams.ubicacionMaps) apiParams.set('ubicacionMaps', resolvedSearchParams.ubicacionMaps)
  if (resolvedSearchParams.todosNegociosConLink === 'true') apiParams.set('todosNegociosConLink', 'true')
  if (resolvedSearchParams.clienteConLink === 'true') apiParams.set('clienteConLink', 'true')

  const result = await fetchClientesList(parseClienteListParams(apiParams))

  const limiteGlobalFiados = await getConfigInt('LIMITE_PEDIDOS_FIADOS_DEFAULT', LIMITE_FIADOS_DEFAULT)

  const clientes = (result.clientes ?? []) as ClientesClientProps['initialClientes']

  const filtrosActivos = {
    mostrarNegocio: (resolvedSearchParams.mostrarNegocio ?? 'todos') as MostrarNegocio,
    ubicacionMaps: resolveUbicacionMaps(resolvedSearchParams),
  }

  return (
    <ClientesClient
      initialClientes={clientes}
      initialTotal={result.total}
      initialTotalPages={result.totalPages}
      initialPage={page}
      initialPageSize={pageSize}
      initialSearch={search}
      initialLimiteFiados={limiteGlobalFiados}
      openClienteId={resolvedSearchParams.openCliente}
      filtroActivo={filtroActivo}
      filtrosActivos={filtrosActivos}
    />
  )
}
