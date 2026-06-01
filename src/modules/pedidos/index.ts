/**
 * Pedidos Module — Public API.
 *
 * Exports the composition root and adapters for external consumption.
 * All other modules should import only from here.
 */

export {
  crearPedidoUseCase,
  listarPedidosUseCase,
  entregarPedidoUseCase,
  anularPedidoUseCase,
  cancelarPedidoUseCase,
  actualizarPedidoUseCase,
  PedidoDTOMapper,
} from './application'

export type * from './application/dto'

export { PedidoAdapter } from './presentation/PedidoAdapter'

// Re-export domain primitives for consumers that need them
export { Pedido } from './domain/entities/Pedido'
export { PedidoItem } from './domain/entities/PedidoItem'
export { PedidoId } from './domain/value-objects/PedidoId'
export { EstadoEntregaVO } from './domain/value-objects/EstadoEntrega'
export { EstadoPagoVO } from './domain/value-objects/EstadoPago'
export { CanalVO } from './domain/value-objects/Canal'
export { OrigenPedidoVO } from './domain/value-objects/OrigenPedido'

export * from './domain/services/pedido-transitions.service'
export * from './domain/services/pedido-validation.service'
export * from './domain/services/pricing-algorithm.service'
export * from './domain/services/pagos-calculator.service'
