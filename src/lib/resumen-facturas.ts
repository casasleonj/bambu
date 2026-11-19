import type { FacturaEstado } from '@/lib/facturas-filtros'
import { FACTURA_ESTADOS } from '@/lib/facturas-filtros'
import { PRODUCT_LABELS, type ProductCode } from '@/shared/domain/value-objects'

/** Mínimo que necesita el resumen de cada factura (importes ya en número). */
export interface FacturaParaResumen {
  estado: FacturaEstado
  total: number
  montoPagado: number
  saldo: number
}

export interface TotalesResumen {
  total: number
  totalPagado: number
  saldo: number
  count: number
}

export interface AnuladasResumen {
  count: number
  /** Importe histórico. No es venta vigente ni deuda cobrable. */
  totalHistorico: number
}

export type ConteosPorEstado = Record<FacturaEstado, number>

/**
 * Totales del resumen consolidado: solo facturas vigentes. Las ANULADAS se
 * reportan aparte y NUNCA suman a ventas, pagado ni saldo (conservan
 * `montoPagado` histórico, que no es cobranza efectiva). Filas y totales salen
 * de la misma lista, así coinciden siempre con lo que ve el usuario.
 */
export function totalizarResumen(facturas: readonly FacturaParaResumen[]): {
  totales: TotalesResumen
  anuladas: AnuladasResumen
} {
  const totales: TotalesResumen = { total: 0, totalPagado: 0, saldo: 0, count: 0 }
  const anuladas: AnuladasResumen = { count: 0, totalHistorico: 0 }
  for (const f of facturas) {
    if (f.estado === 'ANULADA') {
      anuladas.count += 1
      anuladas.totalHistorico += f.total
      continue
    }
    totales.total += f.total
    totales.totalPagado += f.montoPagado
    totales.saldo += f.saldo
    totales.count += 1
  }
  return { totales, anuladas }
}

/** Conteos por estado (para las pestañas) a partir del resultado de un groupBy. */
export function conteosPorEstado(
  filas: readonly { estado: FacturaEstado; count: number }[],
): ConteosPorEstado {
  const conteos = Object.fromEntries(FACTURA_ESTADOS.map((e) => [e, 0])) as ConteosPorEstado
  for (const fila of filas) conteos[fila.estado] += fila.count
  return conteos
}

/** Ítem de pedido tal como lo guarda la BD (importes ya en número). */
export interface ItemPedidoParaResumen {
  producto: string
  cantPedido: number
  cantEntrega: number
  precio: number
  subtotal: number
}

export interface ItemFacturaResumen {
  producto: string
  etiqueta: string
  /** Cantidad facturada (la del pedido; el total de la factura la sigue). */
  cantidad: number
  cantEntrega: number
  precio: number
  /** Subtotal guardado en BD: no se recalcula (el precio puede tener 6 decimales). */
  subtotal: number
}

export interface DetalleFacturaResumen {
  items: ItemFacturaResumen[]
  /** total de la factura − Σ subtotales (descuentos, domicilio…). 0 si cuadra. */
  otrosAjustes: number
}

function esProducto(codigo: string): codigo is ProductCode {
  return Object.prototype.hasOwnProperty.call(PRODUCT_LABELS, codigo)
}

/**
 * Detalle de productos de una factura. Si la suma de subtotales no cuadra con el
 * total de la factura, la diferencia se informa como «otros ajustes» en vez de
 * mostrar una cifra que no cuadre en silencio.
 */
export function detalleItemsFactura(
  items: readonly ItemPedidoParaResumen[],
  totalFactura: number,
): DetalleFacturaResumen {
  const filas = items
    .filter((i) => i.cantPedido > 0)
    .map((i) => ({
      producto: i.producto,
      etiqueta: esProducto(i.producto) ? PRODUCT_LABELS[i.producto] : i.producto,
      cantidad: i.cantPedido,
      cantEntrega: i.cantEntrega,
      precio: i.precio,
      subtotal: i.subtotal,
    }))
  const suma = filas.reduce((a, i) => a + i.subtotal, 0)
  const dif = Math.round((totalFactura - suma) * 100) / 100
  return { items: filas, otrosAjustes: Math.abs(dif) < 0.005 ? 0 : dif }
}

export interface AbonoParaResumen {
  fecha: Date
  monto: number
  /** Suma de `montoRevertido` de sus correcciones (append-only, ADR-CORRECCION-MONETARIA-001). */
  revertido: number
}

export interface AbonoNeto {
  fecha: Date
  monto: number
}

/**
 * Abonos netos de una factura para mostrarlos al cliente. Un abono puede haberse
 * revertido (parcial o total) sin borrarse; se muestra su monto neto y se omiten
 * los reversados del todo. Si la suma no cuadra con `montoPagado` (la autoridad),
 * se devuelve `null`: el documento muestra solo el total abonado, nunca una lista
 * que no sume.
 */
export function abonosNetosFactura(
  abonos: readonly AbonoParaResumen[],
  montoPagado: number,
): AbonoNeto[] | null {
  const netos = abonos
    .map((a) => ({ fecha: a.fecha, monto: Math.round((a.monto - a.revertido) * 100) / 100 }))
    .filter((a) => a.monto > 0)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  const suma = Math.round(netos.reduce((acc, a) => acc + a.monto, 0) * 100) / 100
  return Math.abs(suma - montoPagado) < 0.005 ? netos : null
}
