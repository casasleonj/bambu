import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { buildDateRangeFilter } from '@/lib/dates'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import type { Prisma } from '@prisma/client'
import { clasificarCobrosDePedidos, claveAbonoIndependiente } from '@/lib/cobro-clasificacion-db'
import { tipoDeCobro, type ClasificacionCobro, type TipoCobro } from '@/lib/cobro-clasificacion'

/**
 * GET /api/cartera/abonos — ADR-CORRECCION-MONETARIA-001 D.5.
 * Lista paginada de abonos para la sección "Cartera" (centro de corrección).
 * Roles: ADMIN + CONTADOR (`view:cartera`).
 *
 * Filtros: `clienteId`, `facturaId`, `metodo`, `desde`/`hasta` (YYYY-MM-DD),
 * `estado` = `corregido` | `sin-corregir`, `tipo` = `COBRO_DEL_DIA` | `CARTERA` (#796).
 *
 * #796: cada abono se clasifica por la fecha de ENTREGA de lo que cubre: el cobro de una entrega de la misma
 * jornada es «cobro del día» (ya está en las ventas de hoy), el de una entrega anterior es cartera recuperada.
 * El abono espejo de un Pago se clasifica como ese Pago. No se oculta ni se borra ninguna fila.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const sp = request.nextUrl.searchParams
    const pagination = getPaginationParams(sp)
    const clienteId = sp.get('clienteId')
    const facturaId = sp.get('facturaId')
    const metodo = sp.get('metodo')
    const estado = sp.get('estado')
    const q = sp.get('q')?.trim()
    const dateFilter = buildDateRangeFilter(sp.get('desde'), sp.get('hasta'))
    const tipoParam = sp.get('tipo')
    const tipoFiltro: 'COBRO_DEL_DIA' | 'CARTERA' | null = tipoParam === 'COBRO_DEL_DIA' || tipoParam === 'CARTERA' ? tipoParam : null

    const where: Prisma.AbonoWhereInput = {}
    if (clienteId) where.clienteId = clienteId
    if (facturaId) where.facturaId = facturaId
    if (metodo) where.metodoPago = metodo
    if (dateFilter) where.fecha = dateFilter
    if (estado === 'corregido') where.correcciones = { some: {} }
    if (estado === 'sin-corregir') where.correcciones = { none: {} }
    // búsqueda libre server-side: nº abono / nombre cliente / nº factura.
    if (q) {
      where.OR = [
        { numero: { contains: q, mode: 'insensitive' } },
        { cliente: { nombre: { contains: q, mode: 'insensitive' } } },
        { factura: { numero: { contains: q, mode: 'insensitive' } } },
      ]
    }

    // #796: clasificar TODOS los abonos del filtro (ligero) para filtrar por tipo y totalizar; si falla, la lista sigue sin tipo.
    const clasificacion = new Map<string, { tipo: TipoCobro; aproximado: boolean; clasif: ClasificacionCobro }>()
    const carteraYDia = { carteraCentavos: 0, ventaDiaCentavos: 0 }
    let clasificacionDisponible = true
    try {
      const ligeros = await prisma.abono.findMany({
        where,
        select: {
          id: true, monto: true, pagoOrigenId: true, pedidoId: true,
          factura: { select: { pedidoId: true } },
          correcciones: { select: { montoRevertido: true } },
        },
      })
      const clasificados = await clasificarCobrosDePedidos(
        prisma,
        ligeros.map((a) => a.pedidoId ?? a.factura.pedidoId),
      )
      for (const a of ligeros) {
        const clasif = clasificados.porCobro.get(a.pagoOrigenId ?? claveAbonoIndependiente(a.id))
        if (!clasif) continue
        const tipo = tipoDeCobro(clasif)
        clasificacion.set(a.id, { tipo, aproximado: clasif.aproximado, clasif })
        // Neto del abono repartido en la misma proporción que su cobro (centavos; el resto va a cartera).
        const neto = Math.round((Number(a.monto) - a.correcciones.reduce((t, c) => t + Number(c.montoRevertido), 0)) * 100)
        const base = clasif.ventaDiaCentavos + clasif.carteraCentavos
        const dia = base > 0 ? Math.round((neto * clasif.ventaDiaCentavos) / base) : 0
        carteraYDia.ventaDiaCentavos += dia
        carteraYDia.carteraCentavos += neto - dia
      }
    } catch (err) {
      clasificacionDisponible = false
      clasificacion.clear()
      logger.error({ err: err instanceof Error ? err.message : 'Unknown' }, 'cartera/abonos: no se pudo clasificar los cobros')
    }
    if (tipoFiltro && clasificacionDisponible) {
      const ids = [...clasificacion.entries()]
        .filter(([, v]) => v.tipo === tipoFiltro || v.tipo === 'MIXTO')
        .map(([id]) => id)
      where.id = { in: ids }
    }

    const [abonos, total, agg, revAgg] = await Promise.all([
      prisma.abono.findMany({
        where,
        orderBy: { fecha: 'desc' },
        select: {
          id: true,
          numero: true,
          monto: true,
          metodoPago: true,
          fecha: true,
          cliente: { select: { id: true, nombre: true, apellido: true, telefono: true } },
          factura: { select: { id: true, numero: true } },
          pedido: { select: { id: true, numero: true, estadoEntrega: true } },
          correcciones: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              numero: true,
              tipo: true,
              montoRevertido: true,
              motivo: true,
              createdAt: true,
              autorizadoPor: { select: { nombre: true, apellido: true, username: true } },
              responsibilityCaseId: true,
            },
          },
        },
        ...getPrismaPagination(pagination),
      }),
      prisma.abono.count({ where }),
      prisma.abono.aggregate({ where, _sum: { monto: true } }),
      prisma.correccionAbono.aggregate({ where: { abono: where }, _sum: { montoRevertido: true } }),
    ])

    // enriquecer con el neto revertido por abono (para la UI)
    const items = abonos.map((a) => {
      const revertido = a.correcciones.reduce((s, c) => s + Number(c.montoRevertido), 0)
      const clase = clasificacion.get(a.id)
      return {
        ...a,
        tipoCobro: clase?.tipo ?? null,
        fechaAproximada: clase?.aproximado ?? false,
        monto: Number(a.monto),
        montoRevertido: revertido,
        montoNeto: Number(a.monto) - revertido,
        corregido: a.correcciones.length > 0,
        correcciones: a.correcciones.map((c) => ({ ...c, montoRevertido: Number(c.montoRevertido) })),
      }
    })

    const totalAbonado = Number(agg._sum.monto ?? 0)
    const totalRevertido = Number(revAgg._sum.montoRevertido ?? 0)
    const totales = {
      totalAbonado,
      totalRevertido,
      totalNeto: totalAbonado - totalRevertido,
      count: total,
      clasificacionDisponible,
      // #796: del neto de TODO el filtro (sin el filtro de tipo), cuánto es cartera recuperada y cuánto cobro del día.
      carteraRecuperada: clasificacionDisponible ? carteraYDia.carteraCentavos / 100 : null,
      cobrosDelDia: clasificacionDisponible ? carteraYDia.ventaDiaCentavos / 100 : null,
    }

    return apiSuccess(
      pagination.all
        ? { data: items, total, totales }
        : { ...buildPaginationResponse(items, total, pagination.page!, pagination.pageSize!), totales },
    )
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching cartera/abonos')
    return apiError('Error listando abonos', 500)
  }
}
