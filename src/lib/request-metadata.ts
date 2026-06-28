import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers'

export interface RequestMetadata {
  ip: string | null
  userAgent: string | null
}

/**
 * Extract IP and User-Agent from request headers.
 * Aligned with proxy.ts logic: prefer x-forwarded-for, fallback x-real-ip, then 127.0.0.1.
 */
export function extractRequestMetadata(
  headers: Headers | ReadonlyHeaders,
  fallbackIp = '127.0.0.1',
): RequestMetadata {
  const forwarded = headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim()
    ?? headers.get('x-real-ip')
    ?? fallbackIp
  const userAgent = headers.get('user-agent')

  return {
    ip,
    userAgent,
  }
}
