import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'

export type MostrarNegocio = 'todos' | 'con' | 'sin'

export type ClientesSearchParams = {
  openCliente?: string
  bloqueado?: string
  reclamaciones?: string
  noVerificado?: string
  mostrarNegocio?: MostrarNegocio
  todosNegociosConLink?: 'true'
  clienteConLink?: 'true'
}

/**
 * Construye el where de Prisma para listar clientes, compartido entre
 * el Server Component de /clientes y el endpoint GET /api/clientes.
 *
 * Reglas:
 * - Siempre excluye clientes inactivos y el canónico CONSUMIDOR_FINAL.
 * - "mostrarNegocio=con" → cliente con al menos un Negocio formal activo
 *   O con nombreNegocio legacy no vacío.
 * - "mostrarNegocio=sin" → sin negocios formales activos Y sin nombreNegocio legacy.
 * - "todosNegociosConLink=true" → aplica SOLO a clientes con Negocio formal;
 *   fuerza al menos un negocio activo y que TODOS los activos tengan link de Maps.
 * - "clienteConLink=true" → Cliente.linkUbicacion no es null ni vacío.
 */
export function buildClientesWhere(params: ClientesSearchParams): Record<string, unknown> {
  const where: Record<string, unknown> = {
    activo: true,
    NOT: { id: CANONICAL_CONSUMIDOR_FINAL_ID },
  }

  // Filtros de riesgo preexistentes
  if (params.bloqueado === 'true') {
    where.bloqueado = true
  }
  if (params.reclamaciones === 'gte3') {
    where.reclamaciones = { gte: 3 }
  }
  if (params.noVerificado === 'true') {
    where.verificado = false
  }

  // Filtro: con/sin negocio
  if (params.mostrarNegocio === 'con') {
    where.OR = [
      { negocios: { some: { activo: true } } },
      { nombreNegocio: { not: '' } },
    ]
  } else if (params.mostrarNegocio === 'sin') {
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as Record<string, unknown>[]) : []),
      { NOT: { negocios: { some: { activo: true } } } },
      { OR: [{ nombreNegocio: null }, { nombreNegocio: '' }] },
    ]
  }

  // Filtro: todos los negocios formales activos tienen link de Maps
  if (params.todosNegociosConLink === 'true') {
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as Record<string, unknown>[]) : []),
      // Fuerza que exista al menos un Negocio formal activo
      { negocios: { some: { activo: true } } },
      // Niega la existencia de un negocio activo sin link
      {
        NOT: {
          negocios: {
            some: {
              activo: true,
              OR: [{ linkUbicacion: null }, { linkUbicacion: '' }],
            },
          },
        },
      },
    ]
  }

  // Filtro: el cliente tiene link de Maps propio
  if (params.clienteConLink === 'true') {
    where.linkUbicacion = { not: '' }
  }

  return where
}

/**
 * Devuelve la condición SQL cruda (fragmento WHERE) para los filtros de negocio/ubicación.
 * Se usa en el path raw SQL de GET /api/clientes (search con 2+ caracteres).
 *
 * IMPORTANTE: este fragmento debe mantenerse en sincronía con buildClientesWhere.
 */
export function buildClientesRawWhere(
  params: Pick<ClientesSearchParams, 'mostrarNegocio' | 'todosNegociosConLink' | 'clienteConLink'>
): string {
  const conditions: string[] = []

  if (params.mostrarNegocio === 'con') {
    conditions.push(`(
      EXISTS (SELECT 1 FROM "Negocio" n WHERE n."clienteId" = c.id AND n.activo = true)
      OR NULLIF(c."nombreNegocio", '') IS NOT NULL
    )`)
  } else if (params.mostrarNegocio === 'sin') {
    conditions.push(`(
      NOT EXISTS (SELECT 1 FROM "Negocio" n WHERE n."clienteId" = c.id AND n.activo = true)
      AND NULLIF(c."nombreNegocio", '') IS NULL
    )`)
  }

  if (params.todosNegociosConLink === 'true') {
    conditions.push(`(
      EXISTS (SELECT 1 FROM "Negocio" n WHERE n."clienteId" = c.id AND n.activo = true)
      AND NOT EXISTS (
        SELECT 1 FROM "Negocio" n
        WHERE n."clienteId" = c.id
          AND n.activo = true
          AND (n."linkUbicacion" IS NULL OR n."linkUbicacion" = '')
      )
    )`)
  }

  if (params.clienteConLink === 'true') {
    conditions.push(`(NULLIF(c."linkUbicacion", '') IS NOT NULL)`)
  }

  return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''
}

type ClienteConNegocios = {
  nombreNegocio?: string | null
  linkUbicacion?: string | null
  negocios?: Array<{ activo?: boolean | null; linkUbicacion?: string | null }>
}

export interface NegocioSearchMatch {
  id: string
  nombre: string
}

export interface NegocioSearchMatchResult {
  matchedNegocios: NegocioSearchMatch[]
}

interface NegocioSearchMatchInput {
  id: string
  nombre: string
  tipoNegocio?: string | null
  direccion?: string | null
  barrio?: string | null
  referencia?: string | null
}

/**
 * Devuelve los negocios formales del cliente que coinciden con el término de búsqueda.
 * Coincide insensible a mayúsculas en nombre, tipo, dirección, barrio o referencia.
 *
 * NOTA: usa toLowerCase() simple para mantener consistencia con la búsqueda
 * client-side de la lista de clientes (src/app/(app)/clientes/clientes-client/index.tsx).
 * Si en el futuro se normalizan acentos en esa búsqueda, este helper debe actualizarse.
 */
export function getNegocioSearchMatch(
  cliente: { negocios?: NegocioSearchMatchInput[] | null },
  search: string
): NegocioSearchMatchResult {
  const term = search.trim().toLowerCase()
  if (!term) return { matchedNegocios: [] }

  const negocios = cliente.negocios ?? []
  const matched = negocios.filter((neg) => {
    const fields = [neg.nombre, neg.tipoNegocio, neg.direccion, neg.barrio, neg.referencia]
    return fields.some((field) => typeof field === 'string' && field.toLowerCase().includes(term))
  })

  return { matchedNegocios: matched.map(({ id, nombre }) => ({ id, nombre })) }
}

/**
 * Calcula el estado de negocios y ubicación de un cliente para la UI.
 * Función pura, testeable; no toca Prisma.
 */
export function getClienteNegocioStatus(cliente: ClienteConNegocios) {
  const negociosActivos = (cliente.negocios ?? []).filter(
    (n) => n.activo !== false && n.activo !== null
  )
  const negociosConLink = negociosActivos.filter(
    (n) => typeof n.linkUbicacion === 'string' && n.linkUbicacion !== ''
  )
  const hasLegacy = typeof cliente.nombreNegocio === 'string' && cliente.nombreNegocio !== ''

  return {
    tieneNegocioFormal: negociosActivos.length > 0,
    tieneNegocioLegacy: hasLegacy,
    tieneNegocio: negociosActivos.length > 0 || hasLegacy,
    totalNegociosActivos: negociosActivos.length,
    negociosConLink: negociosConLink.length,
    negociosSinLink: negociosActivos.length - negociosConLink.length,
    clienteConLink: typeof cliente.linkUbicacion === 'string' && cliente.linkUbicacion !== '',
  }
}
