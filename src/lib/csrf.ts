import { NextRequest, NextResponse } from 'next/server'

/**
 * CSRF protection for state-changing API routes.
 * Validates Origin/Referer headers match the expected host.
 * For NextAuth endpoints, CSRF is handled by Auth.js itself.
 */
export function validateCsrf(req: NextRequest): NextResponse | null {
  const method = req.method
  const path = req.nextUrl.pathname

  // Only protect state-changing methods
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return null
  }

  // Skip NextAuth endpoints (handled by Auth.js)
  if (path.startsWith('/api/auth/')) {
    return null
  }

  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  const host = req.headers.get('host') || req.nextUrl.host

  // In development, skip strict CSRF (Postman, curl, etc.)
  if (process.env.NODE_ENV === 'development') {
    return null
  }

  // FIX: hardcodear "https" acá rompía todo POST/PUT/DELETE/PATCH en
  // cualquier entorno servido por HTTP directo (CI, producción sin TLS
  // termination visible) — el Origin real nunca podía matchear. Mismo
  // fallback que Auth.js ya usa (node_modules/@auth/core/lib/utils/env.js):
  // x-forwarded-proto (seteado por Vercel/proxies TLS-terminating) primero,
  // el protocolo real de la request después.
  const scheme = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '')
  const allowedOrigins = [
    `${scheme}://${host}`,
    ...(process.env.ALLOWED_ORIGINS?.split(',') || []),
  ]

  const validOrigin = origin && allowedOrigins.some(o => {
    try {
      const originUrl = new URL(origin)
      const allowedUrl = new URL(o.startsWith('http') ? o : `https://${o}`)
      return originUrl.protocol === allowedUrl.protocol && originUrl.hostname === allowedUrl.hostname
    } catch {
      return false
    }
  })
  const validReferer = referer && allowedOrigins.some(o => {
    try {
      const refererUrl = new URL(referer)
      const allowedUrl = new URL(o.startsWith('http') ? o : `https://${o}`)
      return refererUrl.protocol === allowedUrl.protocol && refererUrl.hostname === allowedUrl.hostname
    } catch {
      return false
    }
  })

  if (!validOrigin && !validReferer) {
    return NextResponse.json(
      { error: 'Invalid CSRF token or origin' },
      { status: 403 }
    )
  }

  return null
}
