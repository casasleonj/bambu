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
 *
 * FASE 0 (ADR-CONCURRENCIA-001, contrato §5/§6): `executeWithLock` ahora
 * recibe `(namespace, entityKey)` en lugar de un `lockName` de entero fijo.
 * El lock se deriva de `"namespace:entityKey"` con hash de 64 bits.
 */

import { prisma } from '@/lib/prisma'
import { withAdvisoryLock, type LockNamespace, type TransactionClient } from '@/lib/locks'

export type { TransactionClient } from '@/lib/locks'

export interface ITransactionManager {
  execute<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>
  executeWithLock<T>(
    namespace: LockNamespace,
    entityKey: string,
    fn: (tx: TransactionClient) => Promise<T>,
  ): Promise<T>
}

export class PrismaTransactionManager implements ITransactionManager {
  async execute<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn)
  }

  async executeWithLock<T>(
    namespace: LockNamespace,
    entityKey: string,
    fn: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return withAdvisoryLock(namespace, entityKey, fn)
  }
}
