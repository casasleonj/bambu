import { PrismaClient } from '@prisma/client'
import { prismaPreviewDatabaseUrl } from './prisma-preview-pooler'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Solo un preview Supavisor :6543 con error 42P05 requiere pgbouncer=true.
const urlCompat = prismaPreviewDatabaseUrl(process.env.DATABASE_URL, process.env.VERCEL_ENV)
const necesitaCompat = !!urlCompat && urlCompat !== process.env.DATABASE_URL

export const prisma = globalForPrisma.prisma ?? (
  necesitaCompat
    ? new PrismaClient({ datasources: { db: { url: urlCompat } } })
    : new PrismaClient()
)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma