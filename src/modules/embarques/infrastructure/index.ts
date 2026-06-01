/**
 * Embarques Infrastructure Layer — Composition Root.
 *
 * Exports all Prisma implementations, mappers, and adapters.
 */

// Repositories
export { PrismaEmbarqueRepository } from './repositories/PrismaEmbarqueRepository'
export { PrismaGastoEmbarqueRepository } from './repositories/PrismaGastoEmbarqueRepository'
export { PrismaEmbarqueProductoRepository } from './repositories/PrismaEmbarqueProductoRepository'

// Transactions
export { PrismaTransactionManager, type TransactionClient, type ITransactionManager } from './transactions/PrismaTransactionManager'

// Mappers
export { EmbarqueMapper } from './mappers/EmbarqueMapper'

// Pricing
export { EmbarquePricingAdapter } from './pricing/EmbarquePricingAdapter'

// Stock
export { StockValidator } from './stock/StockValidator'
