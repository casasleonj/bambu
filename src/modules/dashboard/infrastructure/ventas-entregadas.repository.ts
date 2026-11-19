import type { Prisma } from '@prisma/client'
import type { ProductCode } from '@/shared/domain'
import type { VentaPorPrecio } from '../domain'
import { importeEntregaCentavos } from '@/shared/domain/unit-price'
import { detalleUnidadesEntregadasDelDia, type UnidadEntregadaDetalle, type UnidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'

type Db = Pick<Prisma.TransactionClient, 'pedido' | 'historial' | 'embarqueMovimiento'>
type PedidoPrecio = { id: string; canal: string | null; items: { producto: string; precio: unknown }[] }

export interface VentasEntregadasDia {
  unidades: UnidadesEntregadasDelDia
  desglose: VentaPorPrecio[]
  total: number
  sinPrecio: number
}

/**
 * #883: el periodo se decide por cumplimiento físico, nunca por creación ni pago.
 * El precio es el comercial vigente (misma semántica anterior de PedidoItem y
 * calcularExigibleVigente). No representa una fotografía histórica del contrato.
 * El redondeo incremental evita que dos parciales creen centavos adicionales.
 */
export function valorarEntregasDia(
  detalle: UnidadEntregadaDetalle[],
  pedidos: PedidoPrecio[],
): Pick<VentasEntregadasDia, 'desglose' | 'total' | 'sinPrecio'> {
  const porPedido = new Map(pedidos.map(p => [p.id, p]))
  const grupos = new Map<string, VentaPorPrecio>()
  let totalCents = 0
  let sinPrecio = 0
  for (const l of detalle) {
    const pedido = porPedido.get(l.pedidoId)
    const items = pedido?.items.filter(i => i.producto === l.producto) ?? []
    const precios = [...new Set(items.map(i => i.precio == null ? NaN : Number(i.precio)))]
    if (!pedido || precios.length !== 1 || !Number.isFinite(precios[0]) || precios[0] < 0) {
      sinPrecio += l.cantidad
      continue
    }
    const precio = precios[0]
    const canal = pedido.canal === 'PUNTO' ? 'PUNTO' : 'DOMICILIO'
    const cents = importeEntregaCentavos(precio, l.cantidad, l.cantidadPrevia)
    const key = JSON.stringify([l.producto, canal, precio])
    const grupo = grupos.get(key) ?? {
      producto: l.producto as ProductCode, canal, precio, cantidad: 0, subtotal: 0,
    }
    grupo.cantidad += l.cantidad
    grupo.subtotal = (Math.round(grupo.subtotal * 100) + cents) / 100
    grupos.set(key, grupo)
    totalCents += cents
  }
  const desglose = [...grupos.values()].sort((a, b) =>
    b.subtotal - a.subtotal || a.producto.localeCompare(b.producto) || a.canal.localeCompare(b.canal))
  return { desglose, total: totalCents / 100, sinPrecio }
}

export async function leerVentasEntregadasDia(db: Db, rango: { start: Date; end: Date }): Promise<VentasEntregadasDia> {
  const { unidades, detalle } = await detalleUnidadesEntregadasDelDia(db, {
    desde: rango.start, hasta: rango.end,
  })
  const ids = [...new Set(detalle.map(l => l.pedidoId))]
  const pedidos = ids.length ? await db.pedido.findMany({
    where: { id: { in: ids } },
    select: { id: true, canal: true, items: { select: { producto: true, precio: true } } },
  }) : []
  return { unidades, ...valorarEntregasDia(detalle, pedidos) }
}
