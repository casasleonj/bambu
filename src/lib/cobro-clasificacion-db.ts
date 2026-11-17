// #796 — Lector de datos del clasificador de cobros: reúne por pedido sus cobros y sus entregas y delega
// la regla en `cobro-clasificacion.ts`. Solo lectura. Un pago y su abono espejo son el MISMO cobro
// (se clasifica el Pago); un abono independiente es un cobro más, en orden cronológico.
import type { Prisma } from '@prisma/client'
import { exigiblesActivos } from '@/lib/exigibles-flag'
import { clasificarCobrosDePedido, type ClasificacionCobro, type CobroDePedido } from '@/lib/cobro-clasificacion'

type Db = Pick<Prisma.TransactionClient, 'pedido'>

/** Clave de cobro: el id del Pago, o `abono:<id>` para un abono independiente (sin Pago de origen). */
export const claveAbonoIndependiente = (abonoId: string): string => `abono:${abonoId}`

export interface ClasificacionDePedidos {
  /** Por id de pedido → por clave de cobro. */
  porPedido: Map<string, Map<string, ClasificacionCobro>>
  /** Atajo: clasificación por clave de cobro (los ids de Pago y de abono no se repiten entre sí). */
  porCobro: Map<string, ClasificacionCobro>
}

export async function clasificarCobrosDePedidos(db: Db, pedidoIds: readonly string[]): Promise<ClasificacionDePedidos> {
  const porPedido = new Map<string, Map<string, ClasificacionCobro>>()
  const porCobro = new Map<string, ClasificacionCobro>()
  const ids = [...new Set(pedidoIds)]
  if (ids.length === 0) return { porPedido, porCobro }
  const pedidos = await db.pedido.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, fecha: true, estadoEntrega: true, total: true, entregadoAt: true,
      pagos: { where: { regularizacionId: null }, select: { id: true, createdAt: true, monto: true } },
      abonos: { where: { pagoOrigenId: null }, select: { id: true, fecha: true, monto: true } },
      // Abonos legados sin `pedidoId` propio: su pedido es el de la factura.
      factura: { select: { abonos: { where: { pedidoId: null, pagoOrigenId: null }, select: { id: true, fecha: true, monto: true } } } },
      // Con la capacidad apagada no se lee la tabla de hechos (contrato del #656).
      ...(exigiblesActivos() ? { entregasExigibles: { select: { entregadoAt: true, valorEntregado: true } } } : {}),
    },
  })
  for (const p of pedidos) {
    const cobros: CobroDePedido[] = [
      ...p.pagos.map((g) => ({ id: g.id, at: g.createdAt, monto: g.monto })),
      ...[...p.abonos, ...(p.factura?.abonos ?? [])].map((a) => ({ id: claveAbonoIndependiente(a.id), at: a.fecha, monto: a.monto })),
    ]
    const porciones = 'entregasExigibles' in p && Array.isArray(p.entregasExigibles)
      ? p.entregasExigibles.map((e: { entregadoAt: Date; valorEntregado: unknown }) => ({ entregadoAt: e.entregadoAt, valor: e.valorEntregado }))
      : []
    const r = clasificarCobrosDePedido(
      { fecha: p.fecha, estadoEntrega: p.estadoEntrega, total: p.total, entregadoAt: p.entregadoAt, porciones },
      cobros,
    )
    porPedido.set(p.id, r)
    for (const [k, v] of r) porCobro.set(k, v)
  }
  return { porPedido, porCobro }
}
