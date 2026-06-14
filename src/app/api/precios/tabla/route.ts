import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth-check'
import { getPriceTable } from '@/lib/pricing'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  // FIX CRITICAL (C-SEC-6b): Only users with view:productos can see price table
  // Previously: requireAuth() only — REPARTIDOR could read all prices
  const authResult = await requirePermission('view:productos')
  if (authResult instanceof Response) return authResult

  try {
    const tabla = await getPriceTable()
    return apiSuccess({ tabla })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching price table:')
    return apiError('Error fetching price table', 500)
  }
}
