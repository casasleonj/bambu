import { EstadoEntrega, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * #408 — aviso de posible venta repetida. Una venta del mismo cliente, con los mismos productos y
 * cantidades y el mismo total, registrada hace pocos segundos, suele ser alguien que volvió a cargar a
 * mano lo que ya estaba guardado. Es un AVISO, nunca un bloqueo: en el mostrador dos ventas iguales
 * seguidas son normales. Los dobles registros confirmados (#285/#286, #288/#289) llegaron con 9 y 16 s
 * de diferencia; las ventas reales de mostrador, entre 8 y 55 s, así que ningún umbral separa los dos
 * casos: por eso el usuario decide.
 */
export const VENTA_REPETIDA_VENTANA_SEG_DEFAULT = 60
export const VENTA_REPETIDA_CONFIG_KEY = 'VENTA_REPETIDA_VENTANA_SEG'

export interface VentaRepetida {
  numero: number
  haceSegundos: number
}

export interface BusquedaVentaRepetida {
  clienteId: string
  items: ReadonlyArray<{ producto: string; cantidad: number }>
  total: number
  ventanaSeg: number
  /** Clave del borrador: el reintento del MISMO borrador no es una venta repetida. */
  offlineId?: string
  ahora?: Date
}

/** Mismo contenido sin importar el orden de los renglones. */
function firma(items: ReadonlyArray<{ producto: string; cantidad: number }>): string {
  const porProducto = new Map<string, number>()
  for (const i of items) porProducto.set(i.producto, (porProducto.get(i.producto) ?? 0) + i.cantidad)
  return [...porProducto.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, c]) => `${p}:${c}`).join('|')
}

export async function buscarVentaRepetida(
  q: BusquedaVentaRepetida,
  db: Pick<typeof prisma, 'pedido'> = prisma,
): Promise<VentaRepetida | null> {
  if (q.ventanaSeg <= 0 || q.items.length === 0) return null
  const ahora = q.ahora ?? new Date()
  const desde = new Date(ahora.getTime() - q.ventanaSeg * 1000)
  const candidatas = await db.pedido.findMany({
    where: {
      clienteId: q.clienteId,
      createdAt: { gte: desde },
      total: new Prisma.Decimal(q.total),
      estadoEntrega: { notIn: [EstadoEntrega.CANCELADO, EstadoEntrega.ANULADO] },
      ...(q.offlineId ? { OR: [{ offlineId: null }, { offlineId: { not: q.offlineId } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { numero: true, createdAt: true, items: { select: { producto: true, cantPedido: true } } },
  })
  const buscada = firma(q.items)
  for (const c of candidatas) {
    if (firma(c.items.map((i) => ({ producto: i.producto, cantidad: i.cantPedido }))) === buscada) {
      return { numero: c.numero, haceSegundos: Math.max(0, Math.round((ahora.getTime() - c.createdAt.getTime()) / 1000)) }
    }
  }
  return null
}
