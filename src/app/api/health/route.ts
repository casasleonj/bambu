import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return apiSuccess({ status: 'ok', timestamp: new Date().toISOString() })
  } catch {
    return apiError('Service unavailable', 503)
  }
}
