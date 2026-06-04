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
    // Antes: dos repartidores entregando el mismo pedido simultáneamente
    // (o un repartidor con doble-click) pasaban ambos el dedup check de
    // la route, entraban a la tx, y el segundo fallaba con
    // 'TRANSICION_INVALIDA' (porque el estado ya no era PENDIENTE).
    // Funcionaba pero creaba 2 audit log entries y gastaba trabajo
    // innecesario.
    //
    // Con el lock: el segundo request espera al primero. Cuando entra,
    // el pedido ya está en estado EN_RUTA → la transición a ENTREGADO
    // desde EN_RUTA es válida (puedeEntregar() retorna true), pero
    // actualmente puedeEntregar() verifica el estado desde donde
    // viene el pedido, no el estado final. Para evitar entrega doble,
    // el lock previene que dos requests procesen el mismo pedido
    // simultáneamente.
    //
    // El lock 'PEDIDO' (id=1 en LOCK_IDS) es el apropiado porque
    // entrega es una transición de estado del pedido.
    return this.txManager.executeWithLock('PEDIDO', async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

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
