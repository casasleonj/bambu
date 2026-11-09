/**
 * Disponibilidad física del embarque en vivo (F5 P1-B, #311).
 *
 * Responde, sin escribir nada: de lo que se cargó al vehículo, ¿cuánto sigue a bordo (custodia), cuánto está
 * comprometido con pedidos aún sin entregar y cuánto queda libre para vender en la calle?
 *
 *   custodia (A) = cargado − salidas en vivo
 *   comprometido (B) = Σ (cantPedido − cantEntrega) de los pedidos activos del embarque
 *   libre (C) = A − B        (negativo = hay más prometido que mercancía a bordo)
 *
 * Decisión del PO (2026-11-02, #311): las salidas reales de una Sustitución (CAMBIO) SÍ descuentan lo disponible:
 * es lo físico, una paca entregada en un cambio ya no está en el camión.
 *
 * Fuentes de las SALIDAS, sin contar nada dos veces (docs/AGUA_BAMBU_F5_P1B_CAPACIDAD_FISICA_v1.0.md y el
 * comentario de #311 del 2026-10-14):
 *  1. Ledger (`EmbarqueMovimiento`, origen VEHICULO): ENTREGA, VENTA_RUTA, PROMOCION, DESCARTE, CUSTODY_TRANSFER
 *     y AJUSTE_AUTORIZADO DECREASE. Aquí entran las sustituciones (ENTREGA sin `captura`) y el botellón manual.
 *  2. Pedido (`PedidoItem.cantEntrega`), SOLO para PACA_AGUA, PACA_HIELO, BOLSA_AGUA y BOLSA_HIELO y solo mientras el
 *     embarque no está cerrado (al cerrar, el cierre escribe todo en el ledger):
 *       - embarque en modo «entrega viva»: `/entrega` ya escribió el evento atribuido, así que los pedidos
 *         normales NO se leen (se duplicaría); solo las ventas libres sin evento, que hoy no escriben en vivo (#354).
 *       - embarque anterior a la entrega viva: todo pedido del embarque, porque su ledger está vacío hasta el cierre.
 *  3. BOTELLÓN: la autoridad es el ledger; sus entregas en `Pedido` no se leen (la doble cuenta con la entrega
 *     manual es el hallazgo #353).
 *
 * Límites (documentados, no resueltos aquí):
 *  - RETORNO no suma a lo disponible: hoy el botellón recogido (vacío) también es un RETORNO y no es mercancía
 *    para vender; ignorarlo nunca sobreestima lo libre.
 *  - Un pedido entregado en parte y luego sacado del embarque (`embarqueId` null) ya no se ve: puede
 *    sobreestimar lo libre, nunca subestimarlo, y no toca el cierre.
 */

import type { Prisma } from '@prisma/client'
import { CAPTURA_ENTREGA_PEDIDO, embarqueUsaEntregaVivaPorFlag, leerMetadata } from '@/lib/entrega-fisica-viva'
import { emptyStock, type StockSnapshot } from '@/lib/embarque-capacidad'

type ProductCode = keyof StockSnapshot

export const PRODUCTOS_DISPONIBILIDAD: ProductCode[] = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']

/** Productos cuyas entregas en vivo, antes del cierre, solo viven en el Pedido (no en el ledger). */
const PRODUCTOS_DESDE_PEDIDO: ProductCode[] = ['PACA_AGUA', 'PACA_HIELO', 'BOLSA_AGUA', 'BOLSA_HIELO']

const TIPOS_SALIDA = ['ENTREGA', 'VENTA_RUTA', 'PROMOCION', 'DESCARTE', 'CUSTODY_TRANSFER'] as const

export type ModoDisponibilidad = 'VIVO' | 'ANTERIOR' | 'CERRADO'

export interface DisponibilidadFisica {
  embarqueId: string
  modo: ModoDisponibilidad
  /** (A) a bordo ahora. */
  custodia: StockSnapshot
  /** (B) prometido a pedidos que aún no se entregan. */
  comprometido: StockSnapshot
  /** (C) = A − B. Puede ser negativo. */
  disponible: StockSnapshot
  /** Detalle de lo que salió, para explicar la cifra. */
  salidas: { ledger: StockSnapshot; pedidos: StockSnapshot }
  /** Productos con más prometido que mercancía a bordo (C < 0). */
  sobrecomprometidos: ProductCode[]
}

/** Lo mínimo del cliente de Prisma que esta lectura necesita (transacción o cliente global). */
export interface ClienteDisponibilidad {
  embarque: {
    findUnique(args: unknown): Promise<{ id: string; estado: string; createdAt: Date } | null>
  }
  embarqueCargaProducto: {
    findMany(args: unknown): Promise<Array<{ producto: string; cantidad: number }>>
  }
  embarqueMovimiento: {
    findMany(args: unknown): Promise<Array<{ tipo: string; producto: string; cantidad: number; origen: string | null; metadata: unknown }>>
    count(args: unknown): Promise<number>
  }
  pedido: {
    findMany(args: unknown): Promise<Array<{
      id: string
      origen: string
      estadoEntrega: string
      items: Array<{ producto: string; cantPedido: number; cantEntrega: number }>
    }>>
  }
}

export class EmbarqueNoEncontradoError extends Error {
  readonly code = 'EMBARQUE_NO_ENCONTRADO'
  constructor(embarqueId: string) {
    super(`Embarque ${embarqueId} no encontrado`)
  }
}

const esProducto = (p: string): p is ProductCode => (PRODUCTOS_DISPONIBILIDAD as string[]).includes(p)
const ESTADOS_SIN_PENDIENTE = ['ENTREGADO', 'CANCELADO', 'ANULADO', 'NO_ENTREGADO']

export async function calcularDisponibilidadFisica(client: ClienteDisponibilidad, embarqueId: string): Promise<DisponibilidadFisica> {
  const embarque = await client.embarque.findUnique({ where: { id: embarqueId }, select: { id: true, estado: true, createdAt: true } })
  if (!embarque) throw new EmbarqueNoEncontradoError(embarqueId)

  const [cargas, movimientos, atribuidos, pedidos] = await Promise.all([
    client.embarqueCargaProducto.findMany({ where: { carga: { embarqueId } }, select: { producto: true, cantidad: true } }),
    client.embarqueMovimiento.findMany({
      where: { embarqueId, tipo: { in: [...TIPOS_SALIDA, 'AJUSTE_AUTORIZADO'] } },
      select: { tipo: true, producto: true, cantidad: true, origen: true, metadata: true },
    }),
    client.embarqueMovimiento.count({
      where: { embarqueId, tipo: 'ENTREGA', metadata: { path: ['captura'], equals: CAPTURA_ENTREGA_PEDIDO } },
    }),
    client.pedido.findMany({
      where: { embarqueId },
      select: { id: true, origen: true, estadoEntrega: true, items: { select: { producto: true, cantPedido: true, cantEntrega: true } } },
    }),
  ])

  const cerrado = embarque.estado === 'CERRADO'
  const modoVivo = embarqueUsaEntregaVivaPorFlag(embarque.createdAt) || atribuidos > 0
  const modo: ModoDisponibilidad = cerrado ? 'CERRADO' : modoVivo ? 'VIVO' : 'ANTERIOR'

  // Lo cargado (CARGA + RECARGA).
  const cargado = emptyStock()
  for (const c of cargas) if (esProducto(c.producto)) cargado[c.producto] += c.cantidad

  // Salidas por el ledger y pedidos con evento atribuido (para no volver a leer su Pedido).
  const salidasLedger = emptyStock()
  const pedidosConEvento = new Set<string>()
  for (const m of movimientos) {
    const meta = leerMetadata(m.metadata)
    if (meta.posCierre) continue // evento tardío: conciliación post-cierre, no de esta misión
    if (meta.captura === CAPTURA_ENTREGA_PEDIDO && meta.pedidoId) pedidosConEvento.add(meta.pedidoId)
    if (!esProducto(m.producto)) continue
    if (m.tipo === 'AJUSTE_AUTORIZADO') {
      const efecto = (m.metadata as { effect?: string } | null)?.effect
      if (efecto === 'DECREASE') salidasLedger[m.producto] += m.cantidad
      else if (efecto === 'INCREASE') salidasLedger[m.producto] -= m.cantidad
      continue
    }
    // CUSTODY_TRANSFER solo resta si el vehículo es el origen; el resto de tipos son salidas del vehículo por definición.
    if (m.tipo === 'CUSTODY_TRANSFER' && m.origen !== 'VEHICULO') continue
    salidasLedger[m.producto] += m.cantidad
  }

  // Salidas que aún solo viven en el Pedido (ver cabecera). Cerrado: ya están en el ledger.
  const salidasPedidos = emptyStock()
  const comprometido = emptyStock()
  for (const p of pedidos) {
    const activo = !ESTADOS_SIN_PENDIENTE.includes(p.estadoEntrega)
    const leeEntregas = !cerrado && (!modoVivo || (p.origen === 'VENTA_LIBRE' && !pedidosConEvento.has(p.id)))
    for (const it of p.items) {
      if (!esProducto(it.producto)) continue
      if (leeEntregas && PRODUCTOS_DESDE_PEDIDO.includes(it.producto) && p.estadoEntrega !== 'CANCELADO' && p.estadoEntrega !== 'ANULADO') {
        salidasPedidos[it.producto] += it.cantEntrega
      }
      if (activo) comprometido[it.producto] += Math.max(0, it.cantPedido - it.cantEntrega)
    }
  }

  const custodia = emptyStock()
  const disponible = emptyStock()
  const sobrecomprometidos: ProductCode[] = []
  for (const prod of PRODUCTOS_DISPONIBILIDAD) {
    custodia[prod] = cargado[prod] - salidasLedger[prod] - salidasPedidos[prod]
    disponible[prod] = custodia[prod] - comprometido[prod]
    if (disponible[prod] < 0) sobrecomprometidos.push(prod)
  }

  return { embarqueId, modo, custodia, comprometido, disponible, salidas: { ledger: salidasLedger, pedidos: salidasPedidos }, sobrecomprometidos }
}

/** Misma lectura sobre un cliente de Prisma o una transacción (un solo cast, aquí). */
export function calcularDisponibilidadFisicaPrisma(
  db: Pick<Prisma.TransactionClient, 'embarque' | 'embarqueCargaProducto' | 'embarqueMovimiento' | 'pedido'>,
  embarqueId: string,
): Promise<DisponibilidadFisica> {
  return calcularDisponibilidadFisica(db as unknown as ClienteDisponibilidad, embarqueId)
}
