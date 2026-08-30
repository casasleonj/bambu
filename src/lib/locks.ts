import { AsyncLocalStorage } from 'node:async_hooks'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * ADR-CONCURRENCIA-001 / ADR-CIERRE-001 (contrato técnico §5 y §6):
 * Advisory locks por agregado con hash de 64 bits.
 *
 * Reglas congeladas:
 * - `withAdvisoryLock` es DUEÑO de la transacción: abre `prisma.$transaction`,
 *   adquiere `pg_advisory_xact_lock(hashtextextended(...))` DENTRO y ejecuta el
 *   callback. Está PROHIBIDO anidar (transacción anidada → throw explícito).
 * - `withAdvisoryLockTx` es la variante explícita para callers que YA tienen
 *   una transacción abierta (contrato §5). Adquiere el lock en esa tx y ejecuta
 *   el callback sin abrir una segunda transacción.
 * - `acquireAdvisoryLockTx` es el primitivo de más bajo nivel: SOLO adquiere el
 *   lock en una tx existente, sin envolver el callback. Sirve para multi-lock
 *   (ej. cierre: `CIERRE:{embarqueId}` + `SECUENCIA:pedido`) y para migrar
 *   locks raw que ya viven dentro de un `prisma.$transaction` con retry loop
 *   (producción, cierre de día).
 *
 * Clave del lock (§5): determinista a partir de `"namespace:entityKey"` usando
 * `hashtextextended(text, 0)` → bigint de 64 bits. La colisión del hash NO es
 * semántica de identidad; como máximo produce contención adicional.
 *
 * `pg_advisory_xact_lock` se libera automáticamente al hacer COMMIT o ROLLBACK
 * de la transacción que lo adquirió.
 */

export const LOCK_NAMESPACES = [
  'CARTERA',
  'PEDIDO',
  'RECOVERY_SOURCE',
  'OBLIGACION',
  'EMBARQUE_CARGA',
  'CIERRE',
  'SECUENCIA',
  // Planificador de distribución (ADR-PLANIFICADOR-001 §6 / -005 §4):
  // lock por fecha operativa en generar/replanificar/confirmar/override.
  'PLAN',
] as const

export type LockNamespace = (typeof LOCK_NAMESPACES)[number]

export type TransactionClient = Prisma.TransactionClient

/** Contexto AsyncLocalStorage para detectar transacciones de lock anidadas. */
const lockTxContext = new AsyncLocalStorage<boolean>()

export function advisoryLockKey(namespace: LockNamespace, entityKey: string): string {
  return `${namespace}:${entityKey}`
}

/**
 * Adquiere el advisory lock dentro de una transacción YA ABIERTA, sin envolver
 * el callback. No abre transacciones. El lock se mantiene hasta el commit/rollback.
 */
export async function acquireAdvisoryLockTx(
  tx: TransactionClient,
  namespace: LockNamespace,
  entityKey: string,
): Promise<void> {
  const key = advisoryLockKey(namespace, entityKey)
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`
}

/**
 * Variante explícita (contrato §5): adquiere el lock en una transacción ya
 * abierta por el caller y ejecuta el callback en esa misma transacción.
 */
export async function withAdvisoryLockTx<T>(
  tx: TransactionClient,
  namespace: LockNamespace,
  entityKey: string,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  await acquireAdvisoryLockTx(tx, namespace, entityKey)
  return lockTxContext.run(true, () => fn(tx))
}

/**
 * Dueño de la transacción: abre `$transaction`, adquiere el lock dentro y
 * ejecuta el callback. Prohibido anidar (transacción anidada → throw).
 */
export async function withAdvisoryLock<T>(
  namespace: LockNamespace,
  entityKey: string,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  if (lockTxContext.getStore()) {
    throw new Error(
      'ADVISORY_LOCK_NESTED_TRANSACTION: withAdvisoryLock no puede anidarse dentro de otra transacción de lock. ' +
        'Si ya tienes una transacción abierta, usa withAdvisoryLockTx(tx, ...) o acquireAdvisoryLockTx(tx, ...).',
    )
  }
  return prisma.$transaction((tx) => withAdvisoryLockTx(tx, namespace, entityKey, fn))
}
