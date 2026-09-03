/**
 * EntregarPedidoUseCase.
 */

import { logAudit } from '@/lib/audit'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { IPagoRepository } from '../../domain/repositories/IPagoRepository'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import { registrarReceivableEntry } from '@/lib/receivable-entry'
import { leerMetodosRequierenConfirmacion } from '@/lib/pago-confirmacion'
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
    // FASE 0 (ADR-CONCURRENCIA-001): lock `PEDIDO:{pedidoId}`. Tras PR-1 la
    // entrega ya NO crea un pedido hijo (getNextNumero), así que no necesita el
    // lock global de secuencia — solo serializar las transiciones de ESTE
    // pedido (§6 del contrato). El faltante de una entrega parcial vive en el
    // propio pedido.
    return this.txManager.executeWithLock('PEDIDO', input.pedidoId, async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // FASE 1 (ADR-IDEMPOTENCIA-001): dedup por clave idempotente persistida.
      // Un replay con el mismo offlineId retorna deduped:true aunque el estado
      // ya no sea ENTREGADO (más robusto que el dedup por estado, que depende
      // de que el estado no se haya revertido por un camino intermedio).
      if (input.offlineId && pedido.entregaOfflineId === input.offlineId) {
        return {
          pedido: PedidoDTOMapper.toResumen(pedido),
          deduped: true,
        }
      }

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

      // Register delivery quantities + metadata (photo, GPS, visit code).
      // PR-1: `entregar()` acumula. La cantidad se CLAMPEA al resto pendiente de
      // la línea — así un replay offline con un delta calculado sobre un
      // `cantEntrega` viejo (p.ej. una entrega encolada antes de un cierre
      // parcial) nunca sobrepasa `cantPedido` ni queda atascado en la cola.
      pedido.entregar(
        input.itemsEntregados.map(ie => {
          const item = pedido.items.find(i => i.producto === ie.producto)
          const resto = item ? item.cantPedido - item.cantEntrega : ie.cantidad
          return { producto: ie.producto, cantidad: Math.max(0, Math.min(ie.cantidad, resto)) }
        }),
        {
          fotoEntrega: input.fotoEntrega,
          gpsLat: input.gpsLat,
          gpsLng: input.gpsLng,
          gpsAccuracy: input.gpsAccuracy,
          gpsJustificacion: input.gpsJustificacion,
          entregadoConGps: input.entregadoConGps,
          entregadoAt: input.entregadoAt ? new Date(input.entregadoAt) : undefined,
          codigoVisita: input.codigoVisita,
          entregaOfflineId: input.offlineId,
        },
      )

      // Register payments
      if (input.pagos && input.pagos.length > 0) {
        for (const p of input.pagos) {
          pedido.registrarPago(p)
        }
        // ADR-PAGO-REPORTADO-CONFIRMADO-001 §2: una lectura de Config por
        // entrega (helper vía tx — `getConfig`/`unstable_cache` no funciona
        // fuera de un request context, rompe los unit tests del use case).
        const metodosConfirmacion = await leerMetodosRequierenConfirmacion(
          tx as unknown as Parameters<typeof leerMetodosRequierenConfirmacion>[0],
        )
        await this.pagoRepo.createMany(pedido.id.get(), input.pagos, tx, metodosConfirmacion)
      }

      // Persist pedido
      const updated = await this.pedidoRepo.update(pedido, tx)

      // FASE FINAL (ADR-MONETARIO-001, §12): proyección de auditoría de los pagos.
      if (input.pagos && input.pagos.length > 0) {
        const montoPagadoEnEntrega = input.pagos.reduce((sum, p) => sum + p.monto, 0)
        await registrarReceivableEntry(tx, {
          pedidoId: updated.id.get(),
          clienteId: updated.clienteId,
          tipo: 'PAGO',
          monto: montoPagadoEnEntrega,
          saldoResultante: updated.saldo.toDecimal(),
          totalPagadoResultante: updated.totalPagado.toDecimal(),
        })
      }

      // PR-1 (integridad de entrega parcial): la factura solo se sincroniza
      // cuando el cumplimiento es total. Una entrega parcial deja el pedido
      // PENDIENTE y no debe tocar la factura (montos/estado) ni fijar su fecha.
      const entregaCompleta = updated.estadoEntrega.get() === 'ENTREGADO'
      const factura = await this.facturaRepo.findByPedidoId(pedido.id.get(), tx)
      if (factura && entregaCompleta) {
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

      // PR-1: NO se crea pedido hijo para el faltante. La cantidad pendiente
      // vive en el propio pedido (`cantEntrega < cantPedido`, estado PENDIENTE)
      // y se cumple con una entrega posterior. `crearPedidoHijo()` queda como
      // legacy hasta la migración (ADR PR-1 §8).

      await logAudit({
        entidad: 'Pedido',
        registroId: updated.id.get(),
        accion: 'UPDATE',
        datos: {
          accion: 'ENTREGA',
          estadoEntrega: updated.estadoEntrega.get(),
          estadoPago: updated.estadoPago.get(),
          parcial: !entregaCompleta,
        },
      }, tx)

      return {
        pedido: PedidoDTOMapper.toResumen(updated),
        hijo: undefined,
      }
    })
  }
}
