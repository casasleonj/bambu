/**
 * FIX Fase 5 §7.2: PrismaTransactionManager unificado.
 *
 * Antes: cada módulo (pedidos, embarques) tenía su propia copia del
 * PrismaTransactionManager. Código idéntico duplicado.
 *
 * Ahora: una sola implementación en shared/. Los módulos importan
 * desde acá. Los PrismaTransactionManager específicos de cada módulo
 * quedan como re-exports deprecados para backward compat (sin romper
 * imports existentes).
 *
 * FIX §7.2 (DRY real): es conocimiento único duplicado, no una
 * abstracción equivocada. Sandi Metz / Pragmatic Programmer: DRY
 * aplica cuando la regla de negocio es la misma; acá lo es: "toda
 * operación transaccional va con advisory lock opcional".
 */

import { prisma } from '@/lib/prisma'
import { withAdvisoryLock, LOCK_IDS } from '@/lib/locks'

export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export interface ITransactionManager {
  execute<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>
  executeWithLock<T>(lockName: keyof typeof LOCK_IDS, fn: (tx: TransactionClient) => Promise<T>): Promise<T>
}

export class PrismaTransactionManager implements ITransactionManager {
  async execute<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn)
  }

  async executeWithLock<T>(
    lockName: keyof typeof LOCK_IDS,
    fn: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return withAdvisoryLock(lockName, fn)
  }
}
