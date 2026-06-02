/**
 * CrearPedidoUseCase.
 *
 * Orchestrates the creation of a Pedido including:
 * - Client resolution/creation
 * - Credit limit validation
 * - Price resolution
 * - Transactional persistence (Pedido + Items + Pagos + Factura)
 */

import { Money } from '@/shared/domain'
import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { Pedido } from '../../domain/entities/Pedido'
import { PedidoItem } from '../../domain/entities/PedidoItem'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import { CanalVO } from '../../domain/value-objects/Canal'
import { OrigenPedidoVO } from '../../domain/value-objects/OrigenPedido'
import { EstadoEntregaVO } from '../../domain/value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../../domain/value-objects/EstadoPago'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { IPagoRepository } from '../../domain/repositories/IPagoRepository'
import type { IClienteRepository } from '../../domain/repositories/IClienteRepository'
import type { IPricingPort } from '../../domain/repositories/IPricingPort'
import { puedeCrearPedido } from '../../domain/services/pedido-validation.service'
import { normalizarPagos } from '../../domain/services/pagos-calculator.service'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import type { CrearPedidoInput, CrearPedidoResult } from '../dto'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'

export class CrearPedidoUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private facturaRepo: IFacturaRepository,
    private pagoRepo: IPagoRepository,
    private clienteRepo: IClienteRepository,
    private pricingPort: IPricingPort,
    private txManager: ITransactionManager,
  ) {}

  async execute(input: CrearPedidoInput): Promise<CrearPedidoResult> {
    return this.txManager.executeWithLock('PEDIDO', async (tx) => {
      // 1. Resolve/create cliente
      let clienteId = input.clienteId

      if (input.clienteNuevo) {
        const existente = await this.clienteRepo.findByTelefono(input.clienteNuevo.telefono, tx)
        if (existente) {
          clienteId = existente.id
        } else {
          const nuevo = await this.clienteRepo.create({
            nombre: input.clienteNuevo.nombre,
            apellido: input.clienteNuevo.apellido,
            telefono: input.clienteNuevo.telefono,
            direccion: input.clienteNuevo.direccion,
            barrio: input.clienteNuevo.barrio,
            fuente: input.clienteNuevo.fuente,
            creadoPorRol: input.createdByRole || 'ASISTENTE',
          }, tx)
          clienteId = nuevo.id
        }
      }

      // 2. Validate cliente exists
      const cliente = await this.clienteRepo.findById(clienteId, tx)
      if (!cliente) {
        if (clienteId === 'CONSUMIDOR_FINAL') {
          const nuevo = await this.clienteRepo.create({
            nombre: 'Consumidor Final',
            telefono: '',
            creadoPorRol: input.createdByRole || 'ASISTENTE',
          }, tx)
          clienteId = nuevo.id
        } else {
          throw new Error('CLIENTE_NOT_FOUND')
        }
      }

      // 3. Validate credit limit
      const pedidosPendientes = await this.pedidoRepo.findPendingByCliente(clienteId, tx)
      const limite = cliente?.limitePedidosFiados ?? 3
      const errorDeuda = puedeCrearPedido(
        { id: clienteId, bloqueado: cliente?.bloqueado ?? false, verificado: cliente?.verificado ?? false, creadoPorRol: cliente?.creadoPorRol || '' },
        pedidosPendientes,
        limite,
      )
      if (errorDeuda) {
        throw new Error(`CLIENTE_DEBE: ${errorDeuda}`)
      }

      // 4. Update cliente address if needed
      if (input.actualizarCliente && clienteId !== 'CONSUMIDOR_FINAL' && cliente) {
        await this.clienteRepo.updateDireccion(
          clienteId,
          input.actualizarCliente.direccion || '',
          input.actualizarCliente.barrio,
          tx,
        )
      }

      // 5. Resolve prices
      const activeCodes = input.items.filter(i => i.cantidad > 0).map(i => i.producto)
      const pricingData = await this.pricingPort.loadPricingContext(clienteId, input.negocioId, activeCodes, tx)
      const preciosResueltos = await this.pricingPort.resolverPrecios(
        input.items.filter(i => i.cantidad > 0).map(i => ({
          codigo: i.producto,
          cantidad: i.cantidad,
          precioManual: i.precioManual,
        })),
        input.canal,
        pricingData,
      )

      // 6. Build domain entities
      const canal = CanalVO.create(input.canal)
      const origen = input.ventaRapida ? OrigenPedidoVO.create('VENTA_RAPIDA') : OrigenPedidoVO.create(input.origen || 'PEDIDO')
      const estadoEntrega = origen.isVentaRapida() ? EstadoEntregaVO.create('ENTREGADO') : EstadoEntregaVO.create('PENDIENTE')
      const total = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0)
      const pagosNormalizados = normalizarPagos(input.pagos || [], total)
      const totalPagado = pagosNormalizados.reduce((sum, p) => sum + p.monto, 0)
      const estadoPago = EstadoPagoVO.fromTotals(total, totalPagado)

      const items = preciosResueltos.map(pr =>
        new PedidoItem(
          pr.producto,
          pr.cantidad,
          Money.fromDecimal(pr.precio),
          pr.origen,
          origen.isVentaRapida() ? pr.cantidad : 0,
        ),
      )

      const numero = await getNextNumero(tx, { model: 'pedido', field: 'numero' })

      const pedido = Pedido.create({
        id: PedidoId.from(''), // Will be assigned by Prisma
        numero,
        clienteId,
        negocioId: input.negocioId,
        canal,
        origen,
        estadoEntrega,
        estadoPago,
        items,
        total: Money.fromDecimal(total),
        totalPagado: Money.fromDecimal(totalPagado),
        pagos: pagosNormalizados,
        fecha: new Date(),
        fechaEntrega: input.fechaEntrega,
        obs: input.obs,
        createdById: input.createdById,
      })

      // 7. Persist
      const saved = await this.pedidoRepo.save(pedido, tx, { offlineId: input.offlineId })

      // 8. Persist pagos
      if (pagosNormalizados.length > 0) {
        await this.pagoRepo.createMany(saved.id.get(), pagosNormalizados, tx)
      }

      // 9. Create factura
      const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })
      await this.facturaRepo.create({
        numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
        subtotal: total,
        total,
        saldo: total - totalPagado,
        estado: totalPagado >= total ? 'PAGADA' : (totalPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
        montoPagado: totalPagado,
      }, saved.id.get(), clienteId, tx)

      // 10. Audit
      logAudit({
        entidad: 'Pedido',
        registroId: saved.id.get(),
        accion: 'CREATE',
        datos: { numero: saved.numero, origen: origen.get(), tipo: canal.get(), total, clienteId },
        usuarioId: input.createdById,
      })

      return {
        pedido: PedidoDTOMapper.toResumen(saved),
        clienteId,
      }
    })
  }
}
