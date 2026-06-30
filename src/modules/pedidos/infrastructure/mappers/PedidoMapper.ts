/**
 * PedidoMapper.
 *
 * Maps between Prisma models and Domain entities.
 * Handles Decimal → Money conversion and legacy field synchronization.
 */

import { Money } from '@/shared/domain'
import type { ProductCode } from '@/shared/domain'
import { Pedido } from '../../domain/entities/Pedido'
import { PedidoItem } from '../../domain/entities/PedidoItem'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import { CanalVO } from '../../domain/value-objects/Canal'
import { OrigenPedidoVO } from '../../domain/value-objects/OrigenPedido'
import { EstadoEntregaVO } from '../../domain/value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../../domain/value-objects/EstadoPago'
import type { PagoData, FacturaSnapshot } from '../../domain/types'

interface PrismaPedido {
  id: string
  numero: number
  clienteId: string
  negocioId: string | null
  embarqueId: string | null
  canal: string
  origen: string
  estadoEntrega: string
  estadoPago: string
  total: number | { toNumber: () => number }
  totalPagado: number | { toNumber: () => number }
  fecha: Date
  fechaEntrega: Date | null
  obs: string | null
  idOrigen: string | null
  fotoEntrega: string | null
  gpsLat: number | { toNumber: () => number } | null
  gpsLng: number | { toNumber: () => number } | null
  gpsAccuracy: number | { toNumber: () => number } | null
  gpsJustificacion: string | null
  entregadoConGps: boolean
  entregadoAt: Date | null
  codigoVisita: string | null
  adminOverrideNota: string | null
  adminOverrideBy: string | null
  adminOverrideAt: Date | null
  offlineId: string | null
  items: Array<{
    producto: string
    cantPedido: number
    cantEntrega: number
    precio: number | { toNumber: () => number }
    subtotal: number | { toNumber: () => number }
    precioOrigen: string
  }>
  pagos: Array<{
    metodo: string
    monto: number | { toNumber: () => number }
  }>
  factura?: {
    id: string
    numero: string
    estado: string
    total: number | { toNumber: () => number }
    saldo: number | { toNumber: () => number }
    abonos: Array<{
      id: string
      numero: string
      monto: number | { toNumber: () => number }
      metodoPago: string
      fecha: Date
    }>
  } | null
}

function toNumber(value: number | { toNumber: () => number }): number {
  return typeof value === 'number' ? value : value.toNumber()
}

export class PedidoMapper {
  static fromPrisma(raw: PrismaPedido): Pedido {
    const items = raw.items.map(i =>
      new PedidoItem(
        i.producto as ProductCode,
        i.cantPedido,
        Money.fromDecimal(toNumber(i.precio)),
        i.precioOrigen || 'base',
        i.cantEntrega,
      ),
    )

    const pagos: PagoData[] = (raw.pagos || []).map(p => ({
      metodo: p.metodo as PagoData['metodo'],
      monto: toNumber(p.monto),
    }))

    return Pedido.create({
      id: PedidoId.from(raw.id),
      numero: raw.numero,
      clienteId: raw.clienteId,
      negocioId: raw.negocioId || undefined,
      embarqueId: raw.embarqueId || undefined,
      canal: CanalVO.from(raw.canal),
      origen: OrigenPedidoVO.from(raw.origen),
      estadoEntrega: EstadoEntregaVO.from(raw.estadoEntrega),
      estadoPago: EstadoPagoVO.from(raw.estadoPago),
      items,
      total: Money.fromDecimal(toNumber(raw.total)),
      totalPagado: Money.fromDecimal(toNumber(raw.totalPagado)),
      pagos,
      fecha: raw.fecha,
      fechaEntrega: raw.fechaEntrega || undefined,
      obs: raw.obs || undefined,
      idOrigen: raw.idOrigen || undefined,
      fotoEntrega: raw.fotoEntrega || undefined,
      gpsLat: raw.gpsLat ? toNumber(raw.gpsLat) : undefined,
      gpsLng: raw.gpsLng ? toNumber(raw.gpsLng) : undefined,
      gpsAccuracy: raw.gpsAccuracy ? toNumber(raw.gpsAccuracy) : undefined,
      gpsJustificacion: raw.gpsJustificacion || undefined,
      entregadoConGps: raw.entregadoConGps,
      entregadoAt: raw.entregadoAt || undefined,
      codigoVisita: raw.codigoVisita || undefined,
      adminOverrideNota: raw.adminOverrideNota || undefined,
      adminOverrideBy: raw.adminOverrideBy || undefined,
      adminOverrideAt: raw.adminOverrideAt || undefined,
      offlineId: raw.offlineId || undefined,
    })
  }

  static toPrismaCreate(pedido: Pedido): Record<string, unknown> {
    const legacy = pedido.toLegacyFields()

    const data: Record<string, unknown> = {
      numero: pedido.numero,
      clienteId: pedido.clienteId,
      negocioId: pedido.negocioId || null,
      embarqueId: pedido.embarqueId || null,
      canal: pedido.canal.get(),
      origen: pedido.origen.get(),
      estadoEntrega: pedido.estadoEntrega.get(),
      estadoPago: pedido.estadoPago.get(),
      estado: pedido.estadoEntrega.get(), // legacy sync
      tipo: pedido.canal.get() === 'PUNTO' ? 'PUNTO' : 'ENVIO',
      total: pedido.total.toDecimal(),
      totalPagado: pedido.totalPagado.toDecimal(),
      saldo: pedido.saldo.toDecimal(),
      fecha: pedido.fecha,
      fechaEntrega: pedido.fechaEntrega || null,
      obs: pedido.obs || null,
      idOrigen: pedido.idOrigen || null,
      fotoEntrega: pedido.fotoEntrega || null,
      gpsLat: pedido.gpsLat || null,
      gpsLng: pedido.gpsLng || null,
      gpsAccuracy: pedido.gpsAccuracy || null,
      gpsJustificacion: pedido.gpsJustificacion || null,
      entregadoConGps: pedido.entregadoConGps ?? true,
      entregadoAt: pedido.entregadoAt || null,
      codigoVisita: pedido.codigoVisita || null,
      adminOverrideNota: pedido.adminOverrideNota || null,
      adminOverrideBy: pedido.adminOverrideBy || null,
      adminOverrideAt: pedido.adminOverrideAt || null,
      ...legacy,
      items: {
        create: pedido.items.map(i => ({
          producto: i.producto,
          cantPedido: i.cantPedido,
          cantEntrega: i.cantEntrega,
          precio: i.precio.toDecimal(),
          subtotal: i.subtotalPedido.toDecimal(),
          precioOrigen: i.precioOrigen,
        })),
      },
    }

    return data
  }

  static toPrismaUpdate(pedido: Pedido): Record<string, unknown> {
    const legacy = pedido.toLegacyFields()

    return {
      estadoEntrega: pedido.estadoEntrega.get(),
      estadoPago: pedido.estadoPago.get(),
      estado: pedido.estadoEntrega.get(), // legacy sync
      total: pedido.total.toDecimal(),
      totalPagado: pedido.totalPagado.toDecimal(),
      saldo: pedido.saldo.toDecimal(),
      embarqueId: pedido.embarqueId || null,
      obs: pedido.obs || null,
      fotoEntrega: pedido.fotoEntrega || null,
      gpsLat: pedido.gpsLat || null,
      gpsLng: pedido.gpsLng || null,
      gpsAccuracy: pedido.gpsAccuracy || null,
      gpsJustificacion: pedido.gpsJustificacion || null,
      entregadoConGps: pedido.entregadoConGps ?? true,
      entregadoAt: pedido.entregadoAt || null,
      codigoVisita: pedido.codigoVisita || null,
      adminOverrideNota: pedido.adminOverrideNota || null,
      adminOverrideBy: pedido.adminOverrideBy || null,
      adminOverrideAt: pedido.adminOverrideAt || null,
      ...legacy,
    }
  }

  static toPrismaItemsCreate(pedido: Pedido): Array<Record<string, unknown>> {
    return pedido.items.map(i => ({
      producto: i.producto,
      cantPedido: i.cantPedido,
      cantEntrega: i.cantEntrega,
      precio: i.precio.toDecimal(),
      subtotal: i.subtotalPedido.toDecimal(),
      precioOrigen: i.precioOrigen,
    }))
  }

  static facturaSnapshotFromPrisma(raw: {
    id: string
    numero: string
    subtotal: number | { toNumber: () => number }
    total: number | { toNumber: () => number }
    saldo: number | { toNumber: () => number }
    estado: string
    montoPagado?: number | { toNumber: () => number } | null
  }): FacturaSnapshot {
    return {
      id: raw.id,
      numero: raw.numero,
      subtotal: toNumber(raw.subtotal),
      total: toNumber(raw.total),
      saldo: toNumber(raw.saldo),
      estado: raw.estado as FacturaSnapshot['estado'],
      montoPagado: raw.montoPagado ? toNumber(raw.montoPagado) : 0,
    }
  }
}
