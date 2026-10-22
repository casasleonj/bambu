/**
 * Clientes Repository — capa de acceso a datos compartida entre page.tsx
 * (Server Component) y route.ts (API Route). Reemplaza el fetch HTTP interno
 * de page.tsx a su propia API, eliminando el cold start duplicado.
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  buildClientesWhere,
  buildClientesRawWhere,
  type MostrarNegocio,
  type UbicacionMapsFilter,
} from '@/lib/cliente-filters'
import { getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import { extraerDigitos } from '@/lib/telefono'
import { scoreCliente, esPalabraTelefono, type ClienteSearchable } from '@/lib/cliente-search'

export type ClienteListParams = {
  page?: number
  pageSize?: number
  all?: boolean
  search?: string
  bloqueado?: string
  reclamaciones?: string
  noVerificado?: string
  mostrarNegocio?: string
  ubicacionMaps?: string
  todosNegociosConLink?: string
  clienteConLink?: string
}

export type ClienteListResult = {
  clientes: unknown[]
  total: number
  totalPages: number
  page: number
}

/**
 * Parsea params de un objeto URLSearchParams-compatible.
 */
export function parseClienteListParams(sp: URLSearchParams): ClienteListParams {
  return {
    page: sp.get('page') ? parseInt(sp.get('page')!, 10) : undefined,
    pageSize: sp.get('pageSize') ? parseInt(sp.get('pageSize')!, 10) : undefined,
    all: sp.get('all') === 'true' ? true : undefined,
    search: sp.get('search') || undefined,
    bloqueado: sp.get('bloqueado') || undefined,
    reclamaciones: sp.get('reclamaciones') || undefined,
    noVerificado: sp.get('noVerificado') || undefined,
    mostrarNegocio: sp.get('mostrarNegocio') || undefined,
    ubicacionMaps: sp.get('ubicacionMaps') || undefined,
    todosNegociosConLink: sp.get('todosNegociosConLink') || undefined,
    clienteConLink: sp.get('clienteConLink') || undefined,
  }
}

/**
 * Obtiene la lista de clientes con los filtros especificados.
 * Soporta dos caminos según la longitud del search:
 * - >= 2 caracteres: raw SQL con pg_trgm word_similarity (mejor relevancia)
 * - < 2 caracteres o vacío: Prisma findMany con includes
 */
export async function fetchClientesList(params: ClienteListParams): Promise<ClienteListResult> {
  const pagination = {
    page: params.page || 1,
    pageSize: params.pageSize || 25,
    all: params.all || false,
  }

  try {
    const { search, bloqueado, reclamaciones, noVerificado, mostrarNegocio, ubicacionMaps, todosNegociosConLink, clienteConLink } = params

    const where = buildClientesWhere({
      bloqueado: bloqueado || undefined,
      reclamaciones: reclamaciones || undefined,
      noVerificado: noVerificado || undefined,
      mostrarNegocio: (mostrarNegocio || undefined) as MostrarNegocio | undefined,
      ubicacionMaps: (ubicacionMaps || undefined) as UbicacionMapsFilter | undefined,
      todosNegociosConLink: todosNegociosConLink === 'true' ? 'true' : undefined,
      clienteConLink: clienteConLink === 'true' ? 'true' : undefined,
    })

    // Raw SQL path for 2+ char search
    if (search && search.trim().length >= 2) {
      return fetchSearchRaw({
        search: search.trim(),
        where,
        mostrarNegocio,
        ubicacionMaps,
        todosNegociosConLink,
        clienteConLink,
        pagination,
      })
    }

    // Prisma search for 0-1 char
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search, mode: 'insensitive' } },
        { direccion: { contains: search, mode: 'insensitive' } },
        { barrio: { contains: search, mode: 'insensitive' } },
        { notas: { contains: search, mode: 'insensitive' } },
        { contactos: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
        { contactos: { some: { telefono: { contains: search, mode: 'insensitive' } } } },
        { negocios: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
        { negocios: { some: { direccion: { contains: search, mode: 'insensitive' } } } },
        { negocios: { some: { barrio: { contains: search, mode: 'insensitive' } } } },
        { negocios: { some: { tipoNegocio: { contains: search, mode: 'insensitive' } } } },
        { negocios: { some: { referencia: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    return fetchPrismaList({ where, pagination })
  } catch (error) {
    console.error('[clientes-repo] fetchClientesList error', error)
    throw error
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────

/** Relaciones que acompañan a cada cliente en la lista y en la búsqueda. */
const INCLUDE_LISTA = {
  _count: { select: { pedidos: true } },
  pedidos: {
    where: { saldo: { gt: 0 }, estadoEntrega: 'ENTREGADO' },
    select: { saldo: true },
  },
  negocios: {
    where: { activo: true },
    orderBy: { nombre: 'asc' },
    select: {
      id: true, nombre: true, tipoNegocio: true, direccion: true,
      barrio: true, barrioId: true, referencia: true, linkUbicacion: true,
    },
  },
  plantillaRecurrente: true,
  contactos: true,
} satisfies Prisma.ClienteInclude

type PaginationInfo = { page: number; pageSize: number; all: boolean }

async function fetchPrismaList({ where, pagination }: { where: Record<string, unknown>; pagination: PaginationInfo }) {
  const prismaPagination = getPrismaPagination(pagination)
  const [clientesRaw, total] = await Promise.all([
    prisma.cliente.findMany({
      where,
      orderBy: { nombre: 'asc' },
      include: INCLUDE_LISTA,
      ...prismaPagination,
    }),
    prisma.cliente.count({ where }),
  ])

  const clientes = clientesRaw.map(c => ({
    ...c,
    clienteId: c.id,
    saldoPendiente: c.pedidos.reduce((sum, p) => sum + Number(p.saldo), 0),
  }))

  // Serialize for server component (Prisma Decimal → Number, Date → string)
  const serialized = JSON.parse(JSON.stringify(clientes))

  if (pagination.all) {
    return { clientes: serialized, total, totalPages: 1, page: 1 }
  }
  const paged = buildPaginationResponse(serialized, total, pagination.page, pagination.pageSize!)
  return { clientes: paged.data, total: paged.total, totalPages: paged.totalPages, page: paged.page }
}

// ─── Búsqueda ─────────────────────────────────────────────────────────────
//
// Paridad con la búsqueda local (src/lib/cliente-search.ts, `scoreCliente`):
// - varias palabras: TODAS deben coincidir, cada una en ALGÚN campo;
// - sin acentos ni mayúsculas, en cliente, contactos y negocios;
// - celular comparado por dígitos ("300 123 4567", "+57 300 123 4567");
// - incluye la relación del contacto ("esposa"), el tipo de negocio, notas y fuente;
// - orden por relevancia ANTES de paginar.
//
// Cómo: el SQL trae un conjunto amplio de candidatos (alguna palabra coincide en
// algún campo, o hay parecido por trigramas = tolerancia a erratas) y el orden y
// el criterio final los decide `scoreCliente`, el mismo de la lista local. Las
// coincidencias solo difusas (score 0) van después, por parecido.

/** Tope de candidatos que se puntúan en memoria (la base ronda los cientos). */
export const MAX_CANDIDATOS_BUSQUEDA = 500

const ACENTOS_ORIGEN = 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ'
const ACENTOS_DESTINO = 'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'

/** Misma normalización que `cliente-search.ts`: minúsculas y sin diacríticos. */
function normalizarPalabra(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function palabrasDeBusqueda(search: string): string[] {
  return normalizarPalabra(search.trim()).split(/\s+/).filter(Boolean)
}

function escaparLike(p: string): string {
  return p.replace(/[\\%_]/g, '\\$&')
}

/** `translate` quita acentos y `lower` pasa a minúsculas; `expr` es un identificador fijo, nunca entrada del usuario. */
function texto(expr: string, patron: string): Prisma.Sql {
  return Prisma.sql`lower(translate(coalesce(${Prisma.raw(expr)}, ''), ${ACENTOS_ORIGEN}, ${ACENTOS_DESTINO})) LIKE ${patron}`
}

function digitosSql(expr: string): Prisma.Sql {
  return Prisma.sql`regexp_replace(coalesce(${Prisma.raw(expr)}, ''), '[^0-9]', '', 'g')`
}

/** ¿La palabra aparece en algún campo buscable del cliente, de sus contactos o de sus negocios activos? */
export function condicionPalabra(palabra: string): Prisma.Sql {
  const patron = `%${escaparLike(palabra)}%`
  const partes: Prisma.Sql[] = [
    texto('c.nombre', patron),
    texto('c.apellido', patron),
    texto('c.barrio', patron),
    texto('c.direccion', patron),
    texto('c.notas', patron),
    texto('c.fuente', patron),
    Prisma.sql`EXISTS (
      SELECT 1 FROM "ContactoCliente" cc
      WHERE cc."clienteId" = c.id
        AND (${texto('cc.nombre', patron)} OR ${texto('cc.relacion', patron)})
    )`,
    Prisma.sql`EXISTS (
      SELECT 1 FROM "Negocio" n
      WHERE n."clienteId" = c.id AND n.activo = true
        AND (${Prisma.join([
          texto('n.nombre', patron), texto('n."tipoNegocio"', patron), texto('n.direccion', patron),
          texto('n.barrio', patron), texto('n.referencia', patron),
        ], ' OR ')})
    )`,
  ]
  if (esPalabraTelefono(palabra)) {
    const patronDigitos = `%${extraerDigitos(palabra)}%`
    // `normalizarTelefono` antepone el indicativo 57 a los números locales: se acepta con y sin él.
    partes.push(
      Prisma.sql`${digitosSql('c.telefono')} LIKE ${patronDigitos}`,
      Prisma.sql`('57' || ${digitosSql('c.telefono')}) LIKE ${patronDigitos}`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM "ContactoCliente" cc
        WHERE cc."clienteId" = c.id
          AND (${digitosSql('cc.telefono')} LIKE ${patronDigitos} OR ('57' || ${digitosSql('cc.telefono')}) LIKE ${patronDigitos})
      )`,
    )
  }
  return Prisma.sql`(${Prisma.join(partes, ' OR ')})`
}

async function fetchSearchRaw({
  search, mostrarNegocio, ubicacionMaps, todosNegociosConLink, clienteConLink, pagination,
}: {
  search: string
  where?: Record<string, unknown>
  mostrarNegocio?: string
  ubicacionMaps?: string
  todosNegociosConLink?: string
  clienteConLink?: string
  pagination: PaginationInfo
}) {
  const adminFilter = Prisma.sql`AND c.id != ${CANONICAL_CONSUMIDOR_FINAL_ID}`
  const filtrosNegocioRaw = Prisma.raw(
    buildClientesRawWhere({
      mostrarNegocio: (mostrarNegocio || undefined) as MostrarNegocio | undefined,
      ubicacionMaps: (ubicacionMaps || undefined) as UbicacionMapsFilter | undefined,
      todosNegociosConLink: todosNegociosConLink === 'true' ? 'true' : undefined,
      clienteConLink: clienteConLink === 'true' ? 'true' : undefined,
    })
  )

  const palabras = palabrasDeBusqueda(search)
  const algunaPalabra = Prisma.join(palabras.map(condicionPalabra), ' OR ')

  // 1) Candidatos: coincidencia por palabra en cualquier campo, o parecido por trigramas.
  const candidatos = await prisma.$queryRaw<Array<{ id: string; sim: number; difuso: boolean }>>`
    SELECT c.id,
      (
        c.nombre <% ${search}
        OR COALESCE(c.apellido, '') <% ${search}
        OR COALESCE(c.barrio, '') <% ${search}
        OR COALESCE(c.direccion, '') <% ${search}
      ) AS difuso,
      GREATEST(
        word_similarity(${search}, c.nombre),
        word_similarity(${search}, COALESCE(c.apellido, '')),
        word_similarity(${search}, COALESCE(c.barrio, '')),
        word_similarity(${search}, COALESCE(c.direccion, ''))
      )::float AS sim
    FROM "Cliente" c
    WHERE c.activo = true
      ${adminFilter}
      ${filtrosNegocioRaw}
      AND (
        ${algunaPalabra}
        OR c.nombre <% ${search}
        OR COALESCE(c.apellido, '') <% ${search}
        OR COALESCE(c.barrio, '') <% ${search}
        OR COALESCE(c.direccion, '') <% ${search}
      )
    ORDER BY sim DESC, c.nombre ASC
    LIMIT ${MAX_CANDIDATOS_BUSQUEDA}
  `

  const simPorId = new Map(candidatos.map((r) => [r.id, r.sim]))
  const difusoPorId = new Map(candidatos.map((r) => [r.id, r.difuso]))
  const ordenSql = new Map(candidatos.map((r, i) => [r.id, i]))

  // 2) Datos completos de los candidatos (misma forma que la lista sin búsqueda).
  const filas = await prisma.cliente.findMany({
    where: { id: { in: candidatos.map((r) => r.id) } },
    include: INCLUDE_LISTA,
  })

  // 3) Relevancia: primero lo que `scoreCliente` reconoce (mayor puntaje primero);
  //    después lo que solo coincide por parecido (erratas), en el orden de similitud
  //    del SQL. Un candidato que ni `scoreCliente` reconoce ni es parecido se descarta:
  //    solo coincidía en una de varias palabras.
  const puntuados = filas
    .map((c) => ({
      c,
      score: scoreCliente(c as unknown as ClienteSearchable, search),
      orden: ordenSql.get(c.id) ?? 0,
    }))
  // Los difusos (erratas) solo se muestran si no hay coincidencia exacta: con exactas
  // son ruido (p. ej. un homónimo de otro negocio al buscar "panaderia juan").
  const hayExactas = puntuados.some(({ score }) => score > 0)
  const finales = puntuados.filter(({ c, score }) =>
    score > 0 || (!hayExactas && difusoPorId.get(c.id) === true))
  const total = finales.length
  finales.sort((a, b) => {
    if ((a.score > 0) !== (b.score > 0)) return a.score > 0 ? -1 : 1
    if (a.score !== b.score) return b.score - a.score
    return a.orden - b.orden
  })

  const completos = finales.map(({ c, score }) => ({
    ...c,
    clienteId: c.id,
    saldoPendiente: c.pedidos.reduce((sum, p) => sum + Number(p.saldo), 0),
    similarity_score: score > 0 ? score : simPorId.get(c.id) ?? 0,
  }))

  const pagina = pagination.page || 1
  const tamano = pagination.pageSize || 20
  const recorte = pagination.all
    ? completos.slice(0, 1000)
    : completos.slice((pagina - 1) * tamano, pagina * tamano)

  const clientes = JSON.parse(JSON.stringify(recorte))

  if (pagination.all) {
    return { clientes, total, totalPages: 1, page: 1 }
  }
  const paged = buildPaginationResponse(clientes, total, pagina, tamano)
  return { clientes: paged.data, total: paged.total, totalPages: paged.totalPages, page: paged.page }
}
