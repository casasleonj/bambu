/**
 * Dos reglas relacionadas de "pedido operacionalmente en riesgo por falta
 * de asignación", ambas viven aquí para que el dashboard, el badge de
 * Pedidos y el filtro de la API nunca muestren números distintos entre sí:
 *
 * 1. `whereAtrasadosSinAsignar` / `countPedidosAtrasadosSinAsignar` —
 *    pendiente, sin embarque, de un día ANTERIOR a hoy (Bogotá).
 * 2. `findPedidosHoyEnRiesgoIds` / `countPedidosHoyEnRiesgo` — pendiente,
 *    sin embarque, de HOY, cuya ruta ya tuvo 3+ embarques CERRADO hoy (o,
 *    si el pedido no tiene ruta resoluble, si CUALQUIER ruta ya tuvo 3+
 *    embarques cerrados — ver comentario en la función).
 *
 * Ver plan en docs/superpowers/... (o AGENTS.md) para el contexto completo.
 */
import { prisma } from '@/lib/prisma'
import { startOfDayBogota, endOfDayBogota } from '@/lib/dates'
import { pickRutaId } from '@/lib/pedido-ruta'
import type { Prisma } from '@prisma/client'

export function whereAtrasadosSinAsignar(): Prisma.PedidoWhereInput {
  return {
    estadoEntrega: 'PENDIENTE',
    embarqueId: null,
    fecha: { lt: startOfDayBogota() },
  }
}

export async function countPedidosAtrasadosSinAsignar(): Promise<number> {
  return prisma.pedido.count({ where: whereAtrasadosSinAsignar() })
}

/** Umbral de embarques CERRADO hoy a partir del cual un pedido de hoy sin
 *  asignar se considera "en riesgo" de un próximo ciclo también sin asignar. */
export const UMBRAL_EMBARQUES_RIESGO = 3

/**
 * Pedidos de HOY, PENDIENTE y sin embarque, cuya ruta ya tuvo
 * `UMBRAL_EMBARQUES_RIESGO` o más embarques CERRADO hoy.
 *
 * IMPORTANTE — un pedido asignado a un embarque y luego marcado
 * NO_ENTREGADO al cerrar ese embarque NO vuelve a PENDIENTE (queda en
 * estadoEntrega=NO_ENTREGADO, ver procesar-pedido.service.ts), así que esta
 * regla solo puede detectar pedidos NUNCA asignados hoy pese a N ciclos
 * cerrados de su ruta — no pedidos "ya saltados" explícitamente.
 *
 * IMPORTANTE — `Cliente.rutaId` no tiene flujo de escritura en la UI (solo
 * `Negocio.rutaId` es editable), así que la mayoría de pedidos de domicilio
 * no tendrán ruta resoluble vía `pickRutaId`. Para esos, en vez de quedar
 * invisibles (punto ciego), se usa un fallback más grueso: en riesgo si
 * CUALQUIER ruta ya tuvo `UMBRAL_EMBARQUES_RIESGO`+ embarques cerrados hoy.
 * Es una decisión consciente de más recall a costa de precisión.
 */
export async function findPedidosHoyEnRiesgoIds(): Promise<string[]> {
  const desde = startOfDayBogota()
  const hasta = endOfDayBogota()

  const candidatos = await prisma.pedido.findMany({
    where: {
      estadoEntrega: 'PENDIENTE',
      embarqueId: null,
      fecha: { gte: desde, lte: hasta },
    },
    select: {
      id: true,
      cliente: { select: { rutaId: true } },
      negocio: { select: { rutaId: true } },
    },
  })

  if (candidatos.length === 0) return []

  const conRuta = candidatos.map((c) => ({
    id: c.id,
    rutaId: pickRutaId({ cliente: c.cliente, negocio: c.negocio }),
  }))
  const rutaIds = [...new Set(conRuta.map((c) => c.rutaId).filter((r): r is string => r !== null))]

  const [porRuta, globalCerrados] = await Promise.all([
    rutaIds.length > 0
      ? prisma.embarque.groupBy({
          by: ['rutaId'],
          where: { rutaId: { in: rutaIds }, fecha: { gte: desde, lte: hasta }, estado: 'CERRADO' },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.embarque.count({ where: { fecha: { gte: desde, lte: hasta }, estado: 'CERRADO' } }),
  ])

  const cerradosPorRuta = new Map(porRuta.map((r) => [r.rutaId as string, r._count._all]))

  return conRuta
    .filter((c) => {
      const cerrados = c.rutaId !== null ? (cerradosPorRuta.get(c.rutaId) ?? 0) : globalCerrados
      return cerrados >= UMBRAL_EMBARQUES_RIESGO
    })
    .map((c) => c.id)
}

export async function countPedidosHoyEnRiesgo(): Promise<number> {
  const ids = await findPedidosHoyEnRiesgoIds()
  return ids.length
}
