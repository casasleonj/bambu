/**
 * PrismaTransactionManager.
 *
 * Wraps Prisma transactions with PostgreSQL advisory locks.
 * Provides the transactional boundary for use cases.
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
