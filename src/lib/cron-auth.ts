import { NextRequest, NextResponse } from 'next/server'
import { apiError } from './api-response'

/**
 * Validate CRON_SECRET for scheduled job endpoints.
 * All cron endpoints must use the `x-cron-secret` header.
 * Returns null if authorized, or a 401 Response if not.
 */
export function requireCronSecret(request: NextRequest): NextResponse | null {
  const provided = request.headers.get('x-cron-secret')
  const expected = process.env.CRON_SECRET

  // If CRON_SECRET is not configured, reject all requests
  // This prevents accidental exposure in dev/preview environments
  if (!expected) {
    return apiError('CRON_SECRET not configured', 401)
  }

  if (provided !== expected) {
    return apiError('Unauthorized', 401)
  }

  return null
}
