import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Número de reintentos ante un P2034 (write conflict / deadlock en
 * Serializable isolation). Patrón alineado con src/app/api/cierre/route.ts
 * y src/lib/recurrentes.ts.
 */
export const SERIALIZABLE_MAX_RETRIES = 3

/**
 * Ejecuta una función dentro de una transacción Serializable con reintentos
 * automáticos ante P2034 (write conflict).
 *
 * Patrón oficial de Prisma 4.4+ para prevenir:
 * - LOST UPDATE en updates concurrentes (PostgreSQL SSI tracking)
 * - Race en getNextNumero / aggregate { _max } (atomicidad via SSI)
 * - Lost updates en arrays JSON (PostgreSQL row-level tracking)
 *
 * A diferencia de `withAdvisoryLock('PEDIDO', ...)` que es un lock GLOBAL,
 * Serializable es PER-ROW: dos transacciones que tocan filas distintas
 * corren en paralelo. Solo se serializan las que tocan la misma fila.
 *
 * IMPORTANTE — Lock ordering: cuando una operación toca MÚLTIPLES filas,
 * las transacciones concurrentes deben hacerlo en el MISMO orden para evitar
 * deadlocks. Esto se logra con `sort` de los IDs antes de iterar (ver
 * `generarPedidosRecurrentes` en recurrentes.ts).
 *
 * @param fn     Callback que recibe el TransactionClient. Todas las queries
 *               dentro deben usar este `tx`, no el `prisma` global.
 * @param context String para logging (e.g. `clientes/quick:create`).
 * @returns       El resultado de `fn` si la transacción commiteó.
 */
export async function executeSerializableWithRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  context: string,
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < SERIALIZABLE_MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      })
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Prisma mapea write conflicts y deadlocks a P2034.
      // Aceptamos tanto err.code como err.message.includes por compatibilidad
      // con versiones que envuelven el error en un wrapper custom.
      const isSerializableConflict =
        err?.code === 'P2034' ||
        (typeof err?.message === 'string' && err.message.includes('P2034'))
      if (isSerializableConflict && attempt < SERIALIZABLE_MAX_RETRIES - 1) {
        logger.warn(
          { attempt: attempt + 1, context, err: lastError.message },
          'Serializable conflict, retrying',
        )
        // Backoff exponencial: 50ms, 100ms, 200ms
        await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt)))
        continue
      }
      throw lastError
    }
  }

  // Unreachable, pero TypeScript lo exige
  throw lastError ?? new Error('Serializable retry exhausted')
}
