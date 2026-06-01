/**
 * Shared Infrastructure — Database.
 *
 * Re-exports the Prisma client as the single data access point.
 * All repositories should import from here, not from @/lib/prisma.
 */
export { prisma } from '@/lib/prisma'
export { Prisma } from '@prisma/client'
