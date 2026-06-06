/**
 * EntregarPedidoUseCase.
 */

import { Money } from '@/shared/domain'
import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { IPagoRepository } from '../../domain/repositories/IPagoRepository'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import type { EntregarPedidoInput, EntregarPedidoResult } from '../dto'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'

export class EntregarPedidoUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private facturaRepo: IFacturaRepository,
    private pagoRepo: IPagoRepository,
    private txManager: ITransactionManager,
  ) {}

  async execute(input: EntregarPedidoInput): Promise<EntregarPedidoResult> {
    // FIX F2.4: usar executeWithLock('PEDIDO', ...) en vez de execute sin lock.
    //
    // FIX F-N7: el dedup check ahora está DENTRO del lock.
    // Antes el check estaba en la route (fuera del lock). Dos requests
    // simultáneos podían ambos pasar el check 'estado === ENTREGADO',
    // entrar al use case, y el segundo recibía 'TRANSICION_INVALIDA'
    // con un 400 confuso. El trabajo de upload de foto y validación
    // REQUIERE_FOTO se hacía 2 veces innecesariamente.
    //
    // Ahora: el check corre dentro del lock. Si el pedido ya está
    // ENTREGADO, devolvemos { deduped: true } con el pedido actual.
    // El segundo request no hace trabajo wasted.
    //
    // El lock 'PEDIDO' (id=1 en LOCK_IDS) es el apropiado porque
    // entrega es una transición de estado del pedido.
    return this.txManager.executeWithLock('PEDIDO', async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // F-N7: dedup check DENTRO del lock. Si el pedido ya está
      // ENTREGADO, devolvemos el estado actual sin hacer trabajo.
      if (pedido.estadoEntrega.get() === 'ENTREGADO') {
        return {
          pedido: PedidoDTOMapper.toResumen(pedido),
          deduped: true,
        }
      }

      if (!pedido.puedeEntregar()) {
        throw new Error('TRANSICION_INVALIDA')
      }

      // Register delivery quantities + metadata (photo, GPS, visit code)
      pedido.entregar(
        input.itemsEntregados.map(ie => ({
          producto: ie.producto,
          cantidad: ie.cantidad,
        })),
        {
          fotoEntrega: input.fotoEntrega,
          gpsLat: input.gpsLat,
          gpsLng: input.gpsLng,
          codigoVisita: input.codigoVisita,
        },
      )

      // Register payments
      if (input.pagos && input.pagos.length > 0) {
        for (const p of input.pagos) {
          pedido.registrarPago(p)
        }
        await this.pagoRepo.createMany(pedido.id.get(), input.pagos, tx)
      }

      // Persist pedido
      const updated = await this.pedidoRepo.update(pedido, tx)

      // Update factura
      const factura = await this.facturaRepo.findByPedidoId(pedido.id.get(), tx)
      if (factura) {
        await this.facturaRepo.update({
          ...factura,
          total: updated.total.toDecimal(),
          saldo: updated.saldo.toDecimal(),
          estado: updated.saldo.toDecimal() <= 0
            ? 'PAGADA'
            : (updated.totalPagado.toDecimal() > 0 ? 'PARCIAL' : 'EMITIDA'),
          montoPagado: updated.totalPagado.toDecimal(),
        }, tx)
      }

      // Create child order for partial delivery
      let hijo = undefined
      const itemsActualizados = updated.items
      const tieneFaltantes = itemsActualizados.some(i => i.faltante > 0)

      if (tieneFaltantes) {
        const numeroHijo = await getNextNumero(tx, { model: 'pedido', field: 'numero' })
        const hijoData = updated.crearPedidoHijo(numeroHijo)
        if (hijoData) {
          // Build and save child order
          const { Pedido } = await import('../../domain/entities/Pedido')
          const { PedidoItem } = await import('../../domain/entities/PedidoItem')
          const { CanalVO } = await import('../../domain/value-objects/Canal')
          const { OrigenPedidoVO } = await import('../../domain/value-objects/OrigenPedido')
          const { EstadoEntregaVO } = await import('../../domain/value-objects/EstadoEntrega')
          const { EstadoPagoVO } = await import('../../domain/value-objects/EstadoPago')
          const { PedidoId } = await import('../../domain/value-objects/PedidoId')

          const hijoPedido = Pedido.create({
            id: PedidoId.from(''),
            numero: hijoData.numero,
            clienteId: hijoData.clienteId,
            canal: CanalVO.create(hijoData.canal),
            origen: OrigenPedidoVO.create(hijoData.origen),
            estadoEntrega: EstadoEntregaVO.create('PENDIENTE'),
            estadoPago: EstadoPagoVO.create('PENDIENTE'),
            items: hijoData.items.map(i =>
              new PedidoItem(i.producto, i.cantidad, Money.fromDecimal(i.precio), 'base'),
            ),
            total: Money.fromDecimal(hijoData.total),
            totalPagado: new Money(0),
            pagos: [],
            fecha: new Date(),
            idOrigen: updated.id.get(),
            obs: `Faltante de pedido #${updated.numero}`,
          })

          const savedHijo = await this.pedidoRepo.save(hijoPedido, tx)
          hijo = PedidoDTOMapper.toResumen(savedHijo)
        }
      }

      logAudit({
        entidad: 'Pedido',
        registroId: updated.id.get(),
        accion: 'UPDATE',
        datos: { accion: 'ENTREGA', estadoEntrega: updated.estadoEntrega.get(), estadoPago: updated.estadoPago.get() },
      })

      return {
        pedido: PedidoDTOMapper.toResumen(updated),
        hijo,
      }
    })
  }
}
