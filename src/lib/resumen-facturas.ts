import type { FacturaEstado } from '@/lib/facturas-filtros'
import { FACTURA_ESTADOS } from '@/lib/facturas-filtros'
import { PRODUCT_LABELS, type ProductCode } from '@/shared/domain/value-objects'
import { importeLinea } from '@/shared/domain/unit-price'

/** Mínimo que necesita el resumen de cada factura (importes ya en número). */
export interface FacturaParaResumen {
  estado: FacturaEstado
  total: number
  montoPagado: number
  /**
   * Lo que el cliente debe AHORA: la deuda exigible (`leerExigibles`: lo entregado
   * menos lo pagado), la misma que usan Fiados, Dashboard y Cartera. El saldo
   * contractual de la factura (total − pagado) puede ser mayor si falta entregar.
   */
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
  /**
   * Cantidad ENTREGADA (lo que el cliente se llevó). Lo pedido y aún no
   * entregado no se cobra al cliente en este documento: va en `pendientes`.
   */
  cantidad: number
  /** Cantidad pedida (≥ `cantidad`); solo informativa. */
  cantPedida: number
  precio: number
  /** Valor de lo entregado: `importeLinea(precio, cantidad)`; si se entregó todo, el subtotal guardado. */
  subtotal: number
}

export interface PendienteEntregaResumen {
  producto: string
  etiqueta: string
  cantidad: number
}

export interface DetalleFacturaResumen {
  /** Solo líneas con algo entregado. */
  items: ItemFacturaResumen[]
  /** Lo pedido y todavía no entregado, por producto. */
  pendientes: PendienteEntregaResumen[]
  /** Valor de lo pedido y no entregado: sigue en el total de la factura, pero aún no es deuda exigible (#656). */
  pendienteMonto: number
  /** total de la factura − Σ subtotales PEDIDOS (descuentos, domicilio…). 0 si cuadra. */
  otrosAjustes: number
}

function esProducto(codigo: string): codigo is ProductCode {
  return Object.prototype.hasOwnProperty.call(PRODUCT_LABELS, codigo)
}

function etiquetaProducto(codigo: string): string {
  return esProducto(codigo) ? PRODUCT_LABELS[codigo] : codigo
}

const redondear = (n: number): number => Math.round(n * 100) / 100

/**
 * Detalle de productos de una factura: lo ENTREGADO por línea (cantidad × precio
 * unitario) y, aparte, lo pedido que falta entregar. Si la suma de subtotales
 * pedidos no cuadra con el total de la factura, la diferencia se informa como
 * «otros ajustes» en vez de mostrar una cifra que no cuadre en silencio.
 * No cambia ningún importe: la deuda exigible la calcula `leerExigibles` (#656).
 */
export function detalleItemsFactura(
  items: readonly ItemPedidoParaResumen[],
  totalFactura: number,
): DetalleFacturaResumen {
  const validos = items.filter((i) => i.cantPedido > 0)
  const filas: ItemFacturaResumen[] = []
  const pendientes: PendienteEntregaResumen[] = []
  let pendienteMonto = 0
  for (const i of validos) {
    const entregada = Math.min(Math.max(i.cantEntrega, 0), i.cantPedido)
    const subtotalEntregado = entregada === i.cantPedido ? i.subtotal : importeLinea(i.precio, entregada)
    if (entregada > 0) {
      filas.push({
        producto: i.producto,
        etiqueta: etiquetaProducto(i.producto),
        cantidad: entregada,
        cantPedida: i.cantPedido,
        precio: i.precio,
        subtotal: subtotalEntregado,
      })
    }
    if (entregada < i.cantPedido) {
      pendientes.push({ producto: i.producto, etiqueta: etiquetaProducto(i.producto), cantidad: i.cantPedido - entregada })
      pendienteMonto += i.subtotal - subtotalEntregado
    }
  }
  const sumaPedido = validos.reduce((a, i) => a + i.subtotal, 0)
  const dif = redondear(totalFactura - sumaPedido)
  return {
    items: filas,
    pendientes,
    pendienteMonto: redondear(pendienteMonto),
    otrosAjustes: Math.abs(dif) < 0.005 ? 0 : dif,
  }
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

/** Pestañas del resumen: «Por cobrar» = EMITIDA + PARCIAL; «Todas» = solo las vigentes. */
export const ESTADOS_RESUMEN = ['POR_COBRAR', 'PAGADA', 'ANULADA', 'TODAS'] as const
export type EstadoResumen = (typeof ESTADOS_RESUMEN)[number]

/** Acepta también los estados sueltos de enlaces anteriores (EMITIDA/PARCIAL). */
export type EstadoResumenEntrada = EstadoResumen | 'EMITIDA' | 'PARCIAL'

/** Estados de factura que componen cada pestaña. Las anuladas nunca entran en «Todas». */
export function estadosDeResumen(estado: EstadoResumenEntrada | null | undefined): FacturaEstado[] {
  switch (estado) {
    case 'POR_COBRAR':
      return ['EMITIDA', 'PARCIAL']
    case 'EMITIDA':
      return ['EMITIDA']
    case 'PARCIAL':
      return ['PARCIAL']
    case 'PAGADA':
      return ['PAGADA']
    case 'ANULADA':
      return ['ANULADA']
    default:
      return ['EMITIDA', 'PARCIAL', 'PAGADA']
  }
}

export interface DatoDestacado {
  etiqueta: string
  valor: string | number
  formato: 'numero' | 'fecha' | 'dinero'
}

export interface EncabezadoResumen {
  etiqueta: string
  monto: number
  tono: 'debe' | 'alDia' | 'neutro'
  nota: string
  datos: DatoDestacado[]
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

/**
 * Cifra principal y datos destacados del documento según lo que se consulta:
 * cada pestaña muestra SOLO lo suyo (p. ej. «Por cobrar» no mezcla lo pagado ni
 * lo facturado de otras facturas). Pantalla, impresión y PDF usan esta misma función.
 */
export function encabezadoResumen(
  estado: EstadoResumenEntrada | null | undefined,
  totales: TotalesResumen,
  anuladas: AnuladasResumen,
  masAntigua: string | null,
): EncabezadoResumen {
  if (estado === 'ANULADA') {
    return {
      etiqueta: 'Total anulado (no suma)',
      monto: anuladas.totalHistorico,
      tono: 'neutro',
      nota: 'Importe histórico de facturas anuladas. No es venta vigente ni deuda cobrable.',
      datos: [{ etiqueta: 'Facturas anuladas', valor: anuladas.count, formato: 'numero' }],
    }
  }
  if (estado === 'PAGADA') {
    return {
      etiqueta: 'Total pagado en estas facturas',
      monto: totales.total,
      tono: 'alDia',
      nota: 'Facturas sin saldo pendiente.',
      datos: [{ etiqueta: 'Facturas pagadas', valor: totales.count, formato: 'numero' }],
    }
  }
  if (estado === 'POR_COBRAR' || estado === 'EMITIDA' || estado === 'PARCIAL') {
    const datos: DatoDestacado[] = [{ etiqueta: 'Facturas por cobrar', valor: totales.count, formato: 'numero' }]
    if (masAntigua) datos.push({ etiqueta: 'La más antigua', valor: masAntigua, formato: 'fecha' })
    return {
      etiqueta: 'Saldo que se debe',
      monto: totales.saldo,
      tono: totales.saldo > 0 ? 'debe' : 'alDia',
      nota: totales.saldo > 0 ? 'Suma de lo que falta por pagar en las facturas por cobrar.' : 'Todo al día. No hay saldo pendiente.',
      datos,
    }
  }
  return {
    etiqueta: 'Saldo que se debe',
    monto: totales.saldo,
    tono: totales.saldo > 0 ? 'debe' : 'alDia',
    nota: totales.saldo > 0 ? `Estado de cuenta de ${plural(totales.count, 'factura vigente', 'facturas vigentes')}.` : 'Todo al día. No hay saldo pendiente.',
    datos: [
      { etiqueta: 'Facturado', valor: totales.total, formato: 'dinero' },
      { etiqueta: 'Pagado', valor: totales.totalPagado, formato: 'dinero' },
    ],
  }
}

/** Fecha (YYYY-MM-DD) de la factura vigente con saldo más antigua; `null` si no hay. */
export function fechaMasAntigua(facturas: readonly { fecha: string; estado: string; saldo: number }[]): string | null {
  let min: string | null = null
  for (const f of facturas) {
    if (f.estado === 'ANULADA' || f.saldo <= 0) continue
    if (min === null || f.fecha < min) min = f.fecha
  }
  return min
}
