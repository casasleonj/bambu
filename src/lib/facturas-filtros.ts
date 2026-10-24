import type { Prisma } from '@prisma/client'
import { buildDateRangeFilter } from '@/lib/dates'

export const FACTURA_ESTADOS = ['EMITIDA', 'PARCIAL', 'PAGADA', 'ANULADA'] as const
export type FacturaEstado = (typeof FACTURA_ESTADOS)[number]

export const FACTURA_SORT_FIELDS = ['fecha', 'numero', 'cliente', 'total', 'saldo', 'estado'] as const
export type FacturaSortField = (typeof FACTURA_SORT_FIELDS)[number]
export type SortDir = 'asc' | 'desc'

export interface FacturasFiltros {
  desde: string | null
  hasta: string | null
  clienteId: string | null
  facturaId: string | null
  estado: FacturaEstado | null
  pendiente: boolean
  incluirAnuladas: boolean
}

export interface FacturasOrden {
  sort: FacturaSortField
  dir: SortDir
}

function limpio(value: string | null): string | null {
  const v = value?.trim()
  return v ? v : null
}

export function parseFacturasFiltros(searchParams: URLSearchParams): FacturasFiltros {
  const estadoParam = limpio(searchParams.get('estado'))?.toUpperCase()
  const estado = FACTURA_ESTADOS.find((e) => e === estadoParam) ?? null
  // `all=true` ya significaba "sin filtro de fechas" antes de estos filtros.
  const sinFechas = searchParams.get('all') === 'true'
  return {
    desde: sinFechas ? null : limpio(searchParams.get('desde')),
    hasta: sinFechas ? null : limpio(searchParams.get('hasta')),
    clienteId: limpio(searchParams.get('clienteId')),
    facturaId: limpio(searchParams.get('facturaId')),
    estado,
    pendiente: searchParams.get('pendiente') === 'true',
    incluirAnuladas: searchParams.get('incluirAnuladas') === 'true',
  }
}

export function parseFacturasOrden(searchParams: URLSearchParams): FacturasOrden {
  const sortParam = searchParams.get('sort')
  const sort = FACTURA_SORT_FIELDS.find((f) => f === sortParam) ?? 'fecha'
  const dir: SortDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
  return { sort, dir }
}

/**
 * Filtro base: todo salvo el estado. Los totales y los conteos por estado se
 * calculan sobre este filtro, de modo que no cambian al elegir una pestaña de
 * estado y siempre describen al cliente y al período seleccionados.
 */
export function buildFacturasBaseWhere(f: FacturasFiltros): Prisma.FacturaWhereInput {
  const where: Prisma.FacturaWhereInput = {}
  const fecha = buildDateRangeFilter(f.desde, f.hasta)
  if (fecha) where.fecha = fecha
  if (f.clienteId) where.clienteId = f.clienteId
  if (f.facturaId) where.id = f.facturaId
  if (f.pendiente) where.saldo = { gt: 0 }
  return where
}

/** Estados que entran en la lista y en los totales según el filtro y el interruptor. */
export function estadosIncluidos(f: Pick<FacturasFiltros, 'estado' | 'incluirAnuladas'>): FacturaEstado[] {
  if (f.estado) return [f.estado]
  return f.incluirAnuladas ? [...FACTURA_ESTADOS] : FACTURA_ESTADOS.filter((e) => e !== 'ANULADA')
}

export function buildFacturasListWhere(f: FacturasFiltros): Prisma.FacturaWhereInput {
  const base = buildFacturasBaseWhere(f)
  if (f.estado) return { ...base, estado: f.estado }
  return f.incluirAnuladas ? base : { ...base, estado: { not: 'ANULADA' } }
}

export function buildFacturasOrderBy(
  sort: FacturaSortField,
  dir: SortDir,
): Prisma.FacturaOrderByWithRelationInput[] {
  // El id al final desempata: sin él, la paginación puede repetir u omitir filas.
  const porFecha: Prisma.FacturaOrderByWithRelationInput[] = [{ fecha: 'desc' }, { id: 'desc' }]
  switch (sort) {
    case 'fecha':
      return [{ fecha: dir }, { id: dir }]
    case 'numero':
      return [{ numero: dir }]
    case 'cliente':
      return [{ cliente: { nombre: dir } }, { cliente: { apellido: dir } }, ...porFecha]
    case 'total':
      return [{ total: dir }, ...porFecha]
    case 'saldo':
      return [{ saldo: dir }, ...porFecha]
    case 'estado':
      return [{ estado: dir }, ...porFecha]
  }
}

export interface GrupoEstado {
  estado: FacturaEstado
  count: number
  total: number
  montoPagado: number
  saldo: number
}

export interface ResumenFacturas {
  totales: {
    totalFacturado: number
    totalCobrado: number
    totalPorCobrar: number
    count: number
    pagadas: number
    pendientes: number
  }
  conteosPorEstado: Record<FacturaEstado | 'TODAS', number>
  /** Total de filas de la lista (respeta la pestaña de estado). */
  totalLista: number
}

/**
 * Deriva totales, conteos y el tamaño de la lista desde un único `groupBy`
 * por estado, para no repetir consultas agregadas.
 */
export function resumirGrupos(
  grupos: GrupoEstado[],
  f: Pick<FacturasFiltros, 'estado' | 'incluirAnuladas'>,
): ResumenFacturas {
  const porEstado = new Map(grupos.map((g) => [g.estado, g]))
  const conteosPorEstado = { TODAS: 0, EMITIDA: 0, PARCIAL: 0, PAGADA: 0, ANULADA: 0 }
  for (const e of FACTURA_ESTADOS) conteosPorEstado[e] = porEstado.get(e)?.count ?? 0

  // Los totales ignoran la pestaña de estado: solo dependen del interruptor.
  const paraTotales = f.incluirAnuladas ? [...FACTURA_ESTADOS] : FACTURA_ESTADOS.filter((e) => e !== 'ANULADA')
  conteosPorEstado.TODAS = paraTotales.reduce((acc, e) => acc + conteosPorEstado[e], 0)

  let totalFacturado = 0
  let totalCobrado = 0
  let totalPorCobrar = 0
  for (const e of paraTotales) {
    const g = porEstado.get(e)
    if (!g) continue
    totalFacturado += g.total
    totalCobrado += g.montoPagado
    totalPorCobrar += g.saldo
  }

  const totalLista = estadosIncluidos(f).reduce((acc, e) => acc + conteosPorEstado[e], 0)
  return {
    totales: {
      totalFacturado,
      totalCobrado,
      totalPorCobrar,
      count: conteosPorEstado.TODAS,
      pagadas: conteosPorEstado.PAGADA,
      pendientes: conteosPorEstado.EMITIDA + conteosPorEstado.PARCIAL,
    },
    conteosPorEstado,
    totalLista,
  }
}
