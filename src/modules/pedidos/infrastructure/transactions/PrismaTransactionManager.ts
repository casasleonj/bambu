/**
 * @deprecated Importar desde '@/shared/infrastructure/transactions/PrismaTransactionManager'.
 * Este archivo es solo un re-export para backward compat.
 *
 * FIX Fase 5 §7.2: el PrismaTransactionManager vivía duplicado en
 * pedidos/ y embarques/. Unificado en shared/. Las copias deprecadas
 * se mantienen para no romper imports existentes durante la migración;
 * eliminarlas en una iteración futura.
 */
export {
  PrismaTransactionManager,
  type ITransactionManager,
  type TransactionClient,
} from '@/shared/infrastructure/transactions/PrismaTransactionManager'
