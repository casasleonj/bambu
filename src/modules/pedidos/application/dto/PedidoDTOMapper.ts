/**
 * PedidoDTOMapper.
 *
 * Maps domain entities to serializable DTOs for the application layer.
 */

import { Pedido } from '../../domain/entities/Pedido'
import type { PedidoResumenDTO } from '../dto'

export class PedidoDTOMapper {
  static toResumen(pedido: Pedido): PedidoResumenDTO {
    const estadoEntrega = pedido.estadoEntrega.get()
    const legacy = pedido.toLegacyFields()
    return {
      id: pedido.id.get(),
      numero: pedido.numero,
      clienteId: pedido.clienteId,
      negocioId: pedido.negocioId,
      embarqueId: pedido.embarqueId ?? null,
      canal: pedido.canal.get(),
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
    }
  }
}
