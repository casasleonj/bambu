/**
 * PedidoDTOMapper.
 *
 * Maps domain entities to serializable DTOs for the application layer.
 */

import { Pedido } from '../../domain/entities/Pedido'
import type { FacturaDTOSnapshot, PedidoResumenDTO } from '../dto'

type PrismaFacturaRaw = {
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
}

function toDecimal(value: number | { toNumber: () => number }): number {
  return typeof value === 'number' ? value : value.toNumber()
}

function mapFacturaToDTO(raw: PrismaFacturaRaw): FacturaDTOSnapshot {
  return {
    id: raw.id,
    numero: raw.numero,
    estado: raw.estado,
    total: toDecimal(raw.total),
    saldo: toDecimal(raw.saldo),
    abonos: raw.abonos.map(a => ({
      id: a.id,
      numero: a.numero,
      monto: toDecimal(a.monto),
      metodoPago: a.metodoPago,
      fecha: a.fecha.toISOString(),
    })),
  }
}

export class PedidoDTOMapper {
  static toResumen(
    pedido: Pedido,
    raw?: { factura?: PrismaFacturaRaw | null },
  ): PedidoResumenDTO {
    const estadoEntrega = pedido.estadoEntrega.get()
    const legacy = pedido.toLegacyFields()
    return {
      id: pedido.id.get(),
      numero: pedido.numero,
      clienteId: pedido.clienteId,
      negocioId: pedido.negocioId,
      embarqueId: pedido.embarqueId ?? null,
      canal: pedido.canal.get(),
      tipo: pedido.canal.get() === 'PUNTO' ? 'PUNTO' : 'ENVIO',
      origen: pedido.origen.get(),
      estado: estadoEntrega, // Backward compat: legacy 'estado' mirrors estadoEntrega
      estadoEntrega,
      estadoPago: pedido.estadoPago.get(),
      total: pedido.total.toDecimal(),
      totalPagado: pedido.totalPagado.toDecimal(),
      saldo: pedido.saldo.toDecimal(),
      fecha: pedido.fecha.toISOString(),
      fechaEntrega: pedido.fechaEntrega?.toISOString(),
      obs: pedido.obs,
      offlineId: pedido.offlineId ?? null,
      gpsAccuracy: pedido.gpsAccuracy ?? null,
      gpsJustificacion: pedido.gpsJustificacion ?? null,
      entregadoConGps: pedido.entregadoConGps ?? true,
      entregadoAt: pedido.entregadoAt?.toISOString() ?? null,
      adminOverrideNota: pedido.adminOverrideNota ?? null,
      adminOverrideBy: pedido.adminOverrideBy ?? null,
      adminOverrideAt: pedido.adminOverrideAt?.toISOString() ?? null,
      // Legacy price fields
      precioPacaAgua: legacy.precioPacaAgua,
      precioPacaHielo: legacy.precioPacaHielo,
      precioBotellonFab: legacy.precioBotellonFab,
      precioBotellonDom: legacy.precioBotellonDom,
      precioBolsaAgua: legacy.precioBolsaAgua,
      precioBolsaHielo: legacy.precioBolsaHielo,
      cPacaAguaPed: legacy.cPacaAguaPed,
      cPacaHieloPed: legacy.cPacaHieloPed,
      cBotellonFabPed: legacy.cBotellonFabPed,
      cBotellonDomPed: legacy.cBotellonDomPed,
      cBolsaAguaPed: legacy.cBolsaAguaPed,
      cBolsaHieloPed: legacy.cBolsaHieloPed,
      cPacaAguaEnt: legacy.cPacaAguaEnt,
      cPacaHieloEnt: legacy.cPacaHieloEnt,
      cBotellonFabEnt: legacy.cBotellonFabEnt,
      cBotellonDomEnt: legacy.cBotellonDomEnt,
      cBolsaAguaEnt: legacy.cBolsaAguaEnt,
      cBolsaHieloEnt: legacy.cBolsaHieloEnt,
      items: pedido.items.map(i => ({
        producto: i.producto,
        cantPedido: i.cantPedido,
        cantEntrega: i.cantEntrega,
        precio: i.precio.toDecimal(),
        subtotal: i.subtotalPedido.toDecimal(),
        precioOrigen: i.precioOrigen,
      })),
      pagos: pedido.pagos.map(p => ({
        metodo: p.metodo,
        monto: p.monto,
      })),
      factura: raw?.factura ? mapFacturaToDTO(raw.factura) : null,
    }
  }
}
