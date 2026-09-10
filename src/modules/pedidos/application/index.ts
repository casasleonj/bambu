/**
 * Pedidos Application Composition Root.
 *
 * Wires domain, infrastructure, and application layers together.
 * Manual dependency injection (no framework).
 */

import { PrismaPedidoRepository } from '../infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '../infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '../infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '../infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '../infrastructure/repositories/PrismaPricingAdapter'
import { PrismaNotaCreditoRepository } from '../infrastructure/repositories/PrismaNotaCreditoRepository'
import { PrismaTransactionManager } from '../infrastructure/transactions/PrismaTransactionManager'
import { CrearPedidoUseCase } from './use-cases/CrearPedidoUseCase'
import { ListarPedidosUseCase } from './use-cases/ListarPedidosUseCase'
import { EntregarPedidoUseCase } from './use-cases/EntregarPedidoUseCase'
import { AnularPedidoUseCase } from './use-cases/AnularPedidoUseCase'
import { CancelarPedidoUseCase } from './use-cases/CancelarPedidoUseCase'
import { ActualizarPedidoUseCase } from './use-cases/ActualizarPedidoUseCase'
import { GetFiadoStatusUseCase, ClienteNotFoundError } from './use-cases/GetFiadoStatusUseCase'
import { PreviewPedidoUseCase } from './use-cases/PreviewPedidoUseCase'
import { getPrecioMinimos } from '@/lib/pricing'
import { resolverCoordsDeLink } from '@/lib/geo/resolver-coords-de-link'

const txManager = new PrismaTransactionManager()
const pedidoRepo = new PrismaPedidoRepository()
const facturaRepo = new PrismaFacturaRepository()
const pagoRepo = new PrismaPagoRepository()
const clienteRepo = new PrismaClienteRepository()
const pricingAdapter = new PrismaPricingAdapter()
const notaCreditoRepo = new PrismaNotaCreditoRepository()

export const crearPedidoUseCase = new CrearPedidoUseCase(
  pedidoRepo,
  facturaRepo,
  pagoRepo,
  clienteRepo,
  pricingAdapter,
  txManager,
  resolverCoordsDeLink,
)

export const listarPedidosUseCase = new ListarPedidosUseCase(pedidoRepo)

export const entregarPedidoUseCase = new EntregarPedidoUseCase(
  pedidoRepo,
  facturaRepo,
  pagoRepo,
  txManager,
)

export const anularPedidoUseCase = new AnularPedidoUseCase(
  pedidoRepo,
  facturaRepo,
  notaCreditoRepo,
  txManager,
)

export const cancelarPedidoUseCase = new CancelarPedidoUseCase(
  pedidoRepo,
  facturaRepo,
  notaCreditoRepo,
  txManager,
)

export const actualizarPedidoUseCase = new ActualizarPedidoUseCase(
  pedidoRepo,
  facturaRepo,
  clienteRepo,
  pricingAdapter,
  txManager,
  resolverCoordsDeLink,
)

export const getFiadoStatusUseCase = new GetFiadoStatusUseCase(pedidoRepo, clienteRepo)

export const previewPedidoUseCase = new PreviewPedidoUseCase({
  pricingPort: pricingAdapter,
  clienteRepo,
  pedidoRepo,
  getFiadoStatusUseCase,
  getPrecioMinimos,
  resolverCoordsDeLink,
})

export { PedidoDTOMapper } from './dto/PedidoDTOMapper'
export type * from './dto'
export { ClienteNotFoundError }
