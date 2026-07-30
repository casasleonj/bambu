/**
 * Clientes Repository — capa de acceso a datos compartida entre page.tsx
 * (Server Component) y route.ts (API Route). Reemplaza el fetch HTTP interno
 * de page.tsx a su propia API, eliminando el cold start duplicado.
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { buildClientesWhere, buildClientesRawWhere } from '@/lib/cliente-filters'
import { getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'

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
      mostrarNegocio: (mostrarNegocio || undefined) as any,
      ubicacionMaps: (ubicacionMaps || undefined) as any,
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

type PaginationInfo = { page: number; pageSize: number; all: boolean }

async function fetchPrismaList({ where, pagination }: { where: any; pagination: PaginationInfo }) {
  const prismaPagination = getPrismaPagination(pagination as any)
  const [clientesRaw, total] = await Promise.all([
    prisma.cliente.findMany({
      where,
      orderBy: { nombre: 'asc' },
      include: {
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
            barrio: true, referencia: true, linkUbicacion: true,
          },
        },
        plantillaRecurrente: true,
        contactos: true,
      },
      ...prismaPagination,
    }),
    prisma.cliente.count({ where }),
  ])

  const clientes = clientesRaw.map(c => ({
    ...c,
    clienteId: c.id,
    saldoPendiente: c.pedidos.reduce((sum: number, p: any) => sum + Number(p.saldo), 0),
  }))

  // Serialize for server component (Prisma Decimal → Number, Date → string)
  const serialized = JSON.parse(JSON.stringify(clientes))

  if (pagination.all) {
    return { clientes: serialized, total, totalPages: 1, page: 1 }
  }
  const paged = buildPaginationResponse(serialized, total, pagination.page, pagination.pageSize!)
  return { clientes: paged.data, total: paged.total, totalPages: paged.totalPages, page: paged.page }
}

async function fetchSearchRaw({
  search, where: _where, mostrarNegocio, ubicacionMaps, todosNegociosConLink, clienteConLink, pagination,
}: {
  search: string
  where: any
  mostrarNegocio?: string
  ubicacionMaps?: string
  todosNegociosConLink?: string
  clienteConLink?: string
  pagination: PaginationInfo
}) {
  const adminFilter = Prisma.sql`AND c.id != ${CANONICAL_CONSUMIDOR_FINAL_ID}`
  const filtrosNegocioRaw = Prisma.raw(
    buildClientesRawWhere({
      mostrarNegocio: (mostrarNegocio || undefined) as any,
      ubicacionMaps: (ubicacionMaps || undefined) as any,
      todosNegociosConLink: todosNegociosConLink === 'true' ? 'true' : undefined,
      clienteConLink: clienteConLink === 'true' ? 'true' : undefined,
    })
  )

  const searchLike = `%${search}%`
  const skip = pagination.all ? 0 : ((pagination.page || 1) - 1) * (pagination.pageSize || 20)
  const take = pagination.all ? 1000 : (pagination.pageSize || 20)

  const searchConditions = Prisma.sql`
    (
      c.nombre <% ${search} OR
      COALESCE(c.apellido, '') <% ${search} OR
      COALESCE(c.barrio, '') <% ${search} OR
      COALESCE(c.direccion, '') <% ${search} OR
      c.nombre ILIKE ${searchLike} OR
      COALESCE(c.apellido, '') ILIKE ${searchLike} OR
      COALESCE(c.barrio, '') ILIKE ${searchLike} OR
      COALESCE(c.direccion, '') ILIKE ${searchLike} OR
      c.telefono ILIKE ${searchLike} OR
      EXISTS (
        SELECT 1 FROM "ContactoCliente" cc
        WHERE cc."clienteId" = c.id
          AND (cc.nombre ILIKE ${searchLike} OR cc.telefono ILIKE ${searchLike})
      ) OR
      EXISTS (
        SELECT 1 FROM "Negocio" n
        WHERE n."clienteId" = c.id
          AND n.activo = true
          AND (
            n.nombre ILIKE ${searchLike} OR
            COALESCE(n."tipoNegocio", '') ILIKE ${searchLike} OR
            COALESCE(n.direccion, '') ILIKE ${searchLike} OR
            COALESCE(n.barrio, '') ILIKE ${searchLike} OR
            COALESCE(n.referencia, '') ILIKE ${searchLike}
          )
      )
    )
  `

  const [clientesRaw, totalRaw] = await Promise.all([
    prisma.$queryRaw<unknown[]>`
      SELECT DISTINCT ON (c.id)
        c.id, c.nombre, c.apellido, c.telefono, c.direccion, c.barrio,
        c.notas, c.fuente, c.frecuencia,
        c."cadaNDias", c."ultEntrega", c."proxEntrega", c."habAgua", c."habHielo",
        c."habBotellon", c."habBolsaAgua", c."habBolsaHielo", c.verificado,
        c."verificadoEn", c."creadoPorRol", c.bloqueado, c.reclamaciones,
        c."limitePedidosFiados", c."negocioDefaultId", c.notas, c.activo,
        c."createdAt", c."updatedAt", c."createdById", c."rutaId", c.referencia,
        c."linkUbicacion", c."preciosEspeciales",
        c.lat, c.lng, c."geocodeOrigen", c."geocodeAt",
        COALESCE(
          (SELECT json_agg(json_build_object('nombre', cc.nombre, 'telefono', cc.telefono, 'relacion', cc.relacion))
           FROM "ContactoCliente" cc WHERE cc."clienteId" = c.id),
          '[]'::json
        ) AS contactos,
        GREATEST(
          word_similarity(${search}, c.nombre),
          word_similarity(${search}, COALESCE(c.apellido, '')),
          word_similarity(${search}, COALESCE(c.barrio, '')),
          word_similarity(${search}, COALESCE(c.direccion, ''))
        ) as similarity_score
      FROM "Cliente" c
      WHERE c.activo = true
        ${adminFilter}
        ${filtrosNegocioRaw}
        AND ${searchConditions}
      ORDER BY c.id, similarity_score DESC
      LIMIT ${take}
      OFFSET ${skip}
    `,
    prisma.$queryRaw<unknown[]>`
      SELECT COUNT(DISTINCT c.id) as total
      FROM "Cliente" c
      WHERE c.activo = true
        ${adminFilter}
        ${filtrosNegocioRaw}
        AND ${searchConditions}
    `,
  ])

  const clienteIds = clientesRaw.map((c: any) => c.id)
  const [negociosMap, countsMap] = await Promise.all([
    prisma.negocio.findMany({
      where: { clienteId: { in: clienteIds }, activo: true },
      select: { id: true, nombre: true, tipoNegocio: true, direccion: true, barrio: true, referencia: true, linkUbicacion: true, clienteId: true },
    }).then(negs => {
      const map = new Map<string, any[]>()
      for (const n of negs) {
        const existing = map.get(n.clienteId) || []
        existing.push(n)
        map.set(n.clienteId, existing)
      }
      return map
    }),
    prisma.pedido.findMany({
      where: { clienteId: { in: clienteIds }, saldo: { gt: 0 }, estadoEntrega: 'ENTREGADO' },
      select: { clienteId: true, saldo: true },
    }).then(pedidos => {
      const map = new Map<string, number>()
      for (const p of pedidos) {
        map.set(p.clienteId, (map.get(p.clienteId) || 0) + Number(p.saldo))
      }
      return map
    }),
  ])

  const total = Number((totalRaw[0] as any)?.total ?? 0)
  const clientes = JSON.parse(JSON.stringify(
    clientesRaw.map((c: any) => ({
      ...c,
      clienteId: c.id,
      saldoPendiente: countsMap.get(c.id) || 0,
      negocios: negociosMap.get(c.id) || [],
      _count: { pedidos: 0 },
    }))
  ))

  if (pagination.all) {
    return { clientes, total, totalPages: 1, page: 1 }
  }
  const paged = buildPaginationResponse(clientes, total, pagination.page || 1, pagination.pageSize || 20)
  return { clientes: paged.data, total: paged.total, totalPages: paged.totalPages, page: paged.page }
}
