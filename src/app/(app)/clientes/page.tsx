import type { ClientesClientProps } from './clientes-client/types'
import { headers } from 'next/headers'
import { LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import { getConfigInt } from '@/lib/config'
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

  // Reutilizar la lógica de paginación, búsqueda y filtros de la API
  // para mantener Server Component y Client Component perfectamente sincronizados.
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

  // El Server Component necesita una URL absoluta para fetch; Next.js no
  // acepta paths relativos en el runtime de Node.js en todos los casos.
  const reqHeaders = await headers()
  const host = reqHeaders.get('host') || 'localhost:3001'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const apiUrl = `${protocol}://${host}/api/clientes?${apiParams.toString()}`

  const apiRes = await fetch(apiUrl, { headers: { cookie: reqHeaders.get('cookie') || '' } })
  let clientes: ClientesClientProps['initialClientes'] = []
  let total = 0
  let totalPages = 1
  if (apiRes.ok) {
    const data = await apiRes.json()
    if (data.success) {
      clientes = (data.data as ClientesClientProps['initialClientes']) || (data.data?.clientes as ClientesClientProps['initialClientes']) || []
      total = (data.total as number) ?? 0
      totalPages = (data.totalPages as number) ?? 1
    }
  }

  const limiteGlobalFiados = await getConfigInt('LIMITE_PEDIDOS_FIADOS_DEFAULT', LIMITE_FIADOS_DEFAULT)

  const filtrosActivos = {
    mostrarNegocio: (resolvedSearchParams.mostrarNegocio ?? 'todos') as MostrarNegocio,
    ubicacionMaps: resolveUbicacionMaps(resolvedSearchParams),
  }

  return (
    <ClientesClient
      initialClientes={clientes}
      initialTotal={total}
      initialTotalPages={totalPages}
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
