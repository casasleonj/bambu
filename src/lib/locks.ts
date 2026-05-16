import { prisma } from "@/lib/prisma";

const LOCK_IDS = {
  PEDIDO: 1,
  FACTURA: 2,
  EMBARQUE: 3,
  ABONO: 4,
  COMPRA: 5,
  FACTURA_NUM: 6,
  CIERRE: 7,
  NC: 8,
} as const;

/**
 * PostgreSQL advisory lock for critical sections.
 * Uses pg_advisory_xact_lock which is automatically released at transaction end.
 * The lock is acquired inside the transaction, ensuring the same connection is used.
 * Prevents race conditions on sequential number generation.
 */
export async function withAdvisoryLock<T>(
  lockName: keyof typeof LOCK_IDS,
  fn: (tx: any) => Promise<T>
): Promise<T> {
  const lockId = LOCK_IDS[lockName];
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockId})::text`;
    return await fn(tx);
  });
}

export { LOCK_IDS };
