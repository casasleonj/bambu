import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { getPriceTable } from '@/lib/pricing'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const tabla = await getPriceTable()
    return apiSuccess({ tabla })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching price table:')
    return apiError('Error fetching price table', 500)
  }
}
