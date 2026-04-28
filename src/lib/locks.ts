import { prisma } from "@/lib/prisma";

const LOCK_IDS = {
  PEDIDO: 1,
  FACTURA: 2,
  EMBARQUE: 3,
  ABONO: 4,
  COMPRA: 5,
} as const;

/**
 * PostgreSQL advisory lock for critical sections.
 * Prevents race conditions on sequential number generation.
 */
export async function withAdvisoryLock<T>(
  lockName: keyof typeof LOCK_IDS,
  fn: () => Promise<T>
): Promise<T> {
  const lockId = LOCK_IDS[lockName];
  await prisma.$queryRaw`SELECT pg_advisory_lock(${lockId})::text`;
  try {
    return await fn();
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})::text`;
  }
}

export { LOCK_IDS };
