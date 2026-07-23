import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'

export type MostrarNegocio = 'todos' | 'con' | 'sin'

export type UbicacionMapsFilter =
  | 'todos'
  | 'cliente'
  | 'clienteSin'
  | 'negocios'
  | 'negociosSin'

export type ClientesSearchParams = {
  openCliente?: string
  bloqueado?: string
  reclamaciones?: string
  noVerificado?: string
  mostrarNegocio?: MostrarNegocio
  ubicacionMaps?: UbicacionMapsFilter
  /** @deprecated Use ubicacionMaps='negocios' instead. */
  todosNegociosConLink?: 'true'
  /** @deprecated Use ubicacionMaps='cliente' instead. */
  clienteConLink?: 'true'
}

/**
 * Resuelve el filtro de ubicación de Maps, mapeando los params legacy
 * a la nueva categoría única.
 */
export function resolveUbicacionMaps(
  params: Pick<ClientesSearchParams, 'ubicacionMaps' | 'clienteConLink' | 'todosNegociosConLink'>
): UbicacionMapsFilter {
  if (params.ubicacionMaps) return params.ubicacionMaps
  if (params.clienteConLink === 'true') return 'cliente'
  if (params.todosNegociosConLink === 'true') return 'negocios'
  return 'todos'
}

/**
 * Construye el where de Prisma para listar clientes, compartido entre
 * el Server Component de /clientes y el endpoint GET /api/clientes.
 *
 * Reglas:
 * - Siempre excluye clientes inactivos y el canónico CONSUMIDOR_FINAL.
 * - "mostrarNegocio=con" → cliente con al menos un Negocio formal activo.
 * - "mostrarNegocio=sin" → sin ningún Negocio formal activo (nombreNegocio legacy
 *   se ignora; el filtro es exclusivamente por negocios formales).
 * - "ubicacionMaps=cliente" → Cliente.linkUbicacion no es null ni vacío.
 * - "ubicacionMaps=clienteSin" → Cliente.linkUbicacion es null o vacío.
 * - "ubicacionMaps=negocios" → al menos un Negocio formal activo tiene link de Maps.
 * - "ubicacionMaps=negociosSin" → al menos un Negocio formal activo NO tiene link de Maps.
 * - "todosNegociosConLink=true" (legacy) → todos los negocios formales activos tienen link.
 * - "clienteConLink=true" (legacy) → Cliente.linkUbicacion no es null ni vacío.
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

  // Filtro: con/sin negocio (formal Negocio solamente; no considera
  // nombreNegocio legacy).
  if (params.mostrarNegocio === 'con') {
    where.OR = [{ negocios: { some: { activo: true } } }]
  } else if (params.mostrarNegocio === 'sin') {
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as Record<string, unknown>[]) : []),
      { NOT: { negocios: { some: { activo: true } } } },
    ]
  }

  // Filtro: ubicación de Maps del cliente (casa/dueño)
  if (params.ubicacionMaps === 'cliente' || params.clienteConLink === 'true') {
    where.linkUbicacion = { not: '' }
  } else if (params.ubicacionMaps === 'clienteSin') {
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as Record<string, unknown>[]) : []),
      { OR: [{ linkUbicacion: null }, { linkUbicacion: '' }] },
    ]
  }

  // Filtro: ubicación de Maps de los negocios formales
  if (params.ubicacionMaps === 'negocios') {
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as Record<string, unknown>[]) : []),
      {
        negocios: {
          some: {
            activo: true,
            linkUbicacion: { not: '' },
          },
        },
      },
    ]
  } else if (params.ubicacionMaps === 'negociosSin') {
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as Record<string, unknown>[]) : []),
      {
        negocios: {
          some: {
            activo: true,
            OR: [{ linkUbicacion: null }, { linkUbicacion: '' }],
          },
        },
      },
    ]
  }

  // Legacy: "todos los negocios formales activos tienen link de Maps"
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

  return where
}

/**
 * Devuelve la condición SQL cruda (fragmento WHERE) para los filtros de negocio/ubicación.
 * Se usa en el path raw SQL de GET /api/clientes (search con 2+ caracteres).
 *
 * IMPORTANTE: este fragmento debe mantenerse en sincronía con buildClientesWhere.
 */
export function buildClientesRawWhere(
  params: Pick<ClientesSearchParams, 'mostrarNegocio' | 'ubicacionMaps' | 'todosNegociosConLink' | 'clienteConLink'>
): string {
  const conditions: string[] = []

  if (params.mostrarNegocio === 'con') {
    conditions.push(`(
      EXISTS (SELECT 1 FROM "Negocio" n WHERE n."clienteId" = c.id AND n.activo = true)
    )`)
  } else if (params.mostrarNegocio === 'sin') {
    conditions.push(`(
      NOT EXISTS (SELECT 1 FROM "Negocio" n WHERE n."clienteId" = c.id AND n.activo = true)
    )`)
  }

  if (params.ubicacionMaps === 'cliente' || params.clienteConLink === 'true') {
    conditions.push(`(NULLIF(c."linkUbicacion", '') IS NOT NULL)`)
  } else if (params.ubicacionMaps === 'clienteSin') {
    conditions.push(`(NULLIF(c."linkUbicacion", '') IS NULL)`)
  } else if (params.ubicacionMaps === 'negocios') {
    conditions.push(`(
      EXISTS (
        SELECT 1 FROM "Negocio" n
        WHERE n."clienteId" = c.id
          AND n.activo = true
          AND NULLIF(n."linkUbicacion", '') IS NOT NULL
      )
    )`)
  } else if (params.ubicacionMaps === 'negociosSin') {
    conditions.push(`(
      EXISTS (
        SELECT 1 FROM "Negocio" n
        WHERE n."clienteId" = c.id
          AND n.activo = true
          AND NULLIF(n."linkUbicacion", '') IS NULL
      )
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
