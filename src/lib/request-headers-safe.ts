import { headers } from 'next/headers'
import { logger } from '@/lib/logger'

const REQUEST_HEADERS_TIMEOUT_MS = 500

/**
 * Attempt to read request headers with a short timeout.
 *
 * next/headers() can hang in contexts where the async storage store is not
 * available (e.g. some Auth.js internal flows). This wrapper is defensive:
 * if headers are not available quickly, we return nulls and continue.
 */
export async function getRequestHeadersSafe(): Promise<{
  ip: string | null
  userAgent: string | null
}> {
  try {
    const headersList = await Promise.race([
      headers(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('headers() timeout')), REQUEST_HEADERS_TIMEOUT_MS),
      ),
    ])
    const forwarded = headersList.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim()
      ?? headersList.get('x-real-ip')
      ?? null
    const userAgent = headersList.get('user-agent')
    return { ip, userAgent }
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : 'Unknown error' },
      'Could not read request headers in current context',
    )
    return { ip: null, userAgent: null }
  }
}
