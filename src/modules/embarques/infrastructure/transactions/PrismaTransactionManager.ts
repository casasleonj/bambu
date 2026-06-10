/**
 * @deprecated Importar desde '@/shared/infrastructure/transactions/PrismaTransactionManager'.
 * Este archivo es solo un re-export para backward compat.
 *
 * FIX Fase 5 §7.2: ver detalle en el PrismaTransactionManager unificado.
 */
export {
  PrismaTransactionManager,
  type ITransactionManager,
  type TransactionClient,
} from '@/shared/infrastructure/transactions/PrismaTransactionManager'
