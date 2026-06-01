/**
 * ActualizarPedidoUseCase.
 *
 * Handles item updates, state transitions, and recalculations.
 */

import { Money } from '@/shared/domain'
import { logAudit } from '@/lib/audit'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import { EstadoEntregaVO } from '../../domain/value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../../domain/value-objects/EstadoPago'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { IClienteRepository } from '../../domain/repositories/IClienteRepository'
import type { IPricingPort } from '../../domain/repositories/IPricingPort'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import { PedidoItem } from '../../domain/entities/PedidoItem'
import type { ActualizarPedidoInput } from '../dto'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'

export class ActualizarPedidoUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private facturaRepo: IFacturaRepository,
    private clienteRepo: IClienteRepository,
    private pricingPort: IPricingPort,
    private txManager: ITransactionManager,
  ) {}

  async execute(input: ActualizarPedidoInput) {
    return this.txManager.execute(async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // Update items if provided
      if (input.items && input.items.length > 0) {
        const activeCodes = input.items.filter(i => i.cantidad > 0).map(i => i.producto)
        const pricingData = await this.pricingPort.loadPricingContext(
          pedido.clienteId,
          pedido.negocioId,
          activeCodes,
          tx,
        )

        const preciosResueltos = await this.pricingPort.resolverPrecios(
          input.items.filter(i => i.cantidad > 0).map(i => ({
            codigo: i.producto,
            cantidad: i.cantidad,
            precioManual: i.precioManual,
          })),
          pedido.canal.get(),
          pricingData,
        )

        // Recalculate total
        const nuevoTotal = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0)
        const totalPagadoActual = pedido.totalPagado.toDecimal()

        // Build new items preserving existing prices if no manual override
        const nuevosItems = preciosResueltos.map(pr =>
          new PedidoItem(
            pr.producto,
            pr.cantidad,
            Money.fromDecimal(pr.precio),
            pr.origen,
            0,
          ),
        )

        // Create updated pedido entity (rebuild)
        const { Pedido } = await import('../../domain/entities/Pedido')
        const updatedPedido = Pedido.create({
          id: pedido.id,
          numero: pedido.numero,
          clienteId: pedido.clienteId,
          negocioId: pedido.negocioId,
          embarqueId: pedido.embarqueId,
          canal: pedido.canal,
          origen: pedido.origen,
          estadoEntrega: input.estadoEntrega
            ? EstadoEntregaVO.from(input.estadoEntrega)
            : pedido.estadoEntrega,
          estadoPago: EstadoPagoVO.fromTotals(nuevoTotal, totalPagadoActual),
          items: nuevosItems,
          total: Money.fromDecimal(nuevoTotal),
          totalPagado: pedido.totalPagado,
          pagos: [...pedido.pagos],
          fecha: pedido.fecha,
          fechaEntrega: pedido.fechaEntrega,
          obs: input.obs !== undefined ? input.obs : pedido.obs,
          idOrigen: pedido.idOrigen,
          fotoEntrega: pedido.fotoEntrega,
          gpsLat: pedido.gpsLat,
          gpsLng: pedido.gpsLng,
          codigoVisita: pedido.codigoVisita,
        })

        const saved = await this.pedidoRepo.update(updatedPedido, tx)

        // Update factura
        const factura = await this.facturaRepo.findByPedidoId(saved.id.get(), tx)
        if (factura) {
          await this.facturaRepo.update({
            ...factura,
            total: nuevoTotal,
            saldo: Math.max(0, nuevoTotal - totalPagadoActual),
            estado: nuevoTotal <= totalPagadoActual
              ? 'PAGADA'
              : (totalPagadoActual > 0 ? 'PARCIAL' : 'EMITIDA'),
          }, tx)
        }

        // Update cliente address if needed
        if (input.actualizarCliente && saved.clienteId !== 'CONSUMIDOR_FINAL') {
          await this.clienteRepo.updateDireccion(
            saved.clienteId,
            input.actualizarCliente.direccion || '',
            input.actualizarCliente.barrio,
            tx,
          )
        }

        logAudit({
          entidad: 'Pedido',
          registroId: saved.id.get(),
          accion: 'UPDATE',
          datos: { numero: saved.numero, estado: saved.estadoEntrega.get() },
        })

        return { pedido: PedidoDTOMapper.toResumen(saved) }
      }

      // Simple state transition or obs update
      if (input.estadoEntrega) {
        const nuevoEstado = EstadoEntregaVO.from(input.estadoEntrega)
        if (!pedido.estadoEntrega.canTransitionTo(nuevoEstado)) {
          throw new Error(`Transición inválida: ${pedido.estadoEntrega.get()} → ${nuevoEstado.get()}`)
        }

        // Handle ENTREGADO without items (copiar cantidades pedidas a entregadas)
        if (nuevoEstado.get() === 'ENTREGADO') {
          for (const item of pedido.items) {
            item.entregar(item.cantPedido)
          }
          pedido.entregar(pedido.items.map(i => ({ producto: i.producto, cantidad: i.cantPedido })))
        } else {
          // Rebuild with new state
          const { Pedido } = await import('../../domain/entities/Pedido')
          const updated = Pedido.create({
            ...pedido,
            estadoEntrega: nuevoEstado,
            obs: input.obs !== undefined ? input.obs : pedido.obs,
          } as unknown as Parameters<typeof Pedido.create>[0])

          const saved = await this.pedidoRepo.update(updated, tx)
          return { pedido: PedidoDTOMapper.toResumen(saved) }
        }
      }

      if (input.obs !== undefined) {
        const { Pedido } = await import('../../domain/entities/Pedido')
        const updated = Pedido.create({
          ...pedido,
          obs: input.obs,
        } as unknown as Parameters<typeof Pedido.create>[0])
        const saved = await this.pedidoRepo.update(updated, tx)
        return { pedido: PedidoDTOMapper.toResumen(saved) }
      }

      return { pedido: PedidoDTOMapper.toResumen(pedido) }
    })
  }
}
