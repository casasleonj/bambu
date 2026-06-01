import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkRateLimit, classifyRequest } from '@/lib/rate-limit'
import { isRouteAllowed, getRedirectForRole } from '@/lib/permissions'
import type { Role } from '@/lib/constants'

/**
 * Proxy (formerly middleware) — runs on Node.js runtime before routes are rendered.
 *
 * Uses Auth.js auth() wrapper pattern (documented at authjs.dev):
 *   export const proxy = auth((req) => { ... })
 *
 * This provides request.auth directly without calling await auth() again.
 *
 * Responsibilities:
 * 1. API routes (/api/*): Apply rate limiting, then pass through.
 *    Route handlers handle their own auth via requireAuth().
 * 2. Page routes: Auth check + mustChangePassword guard + role-based access.
 */
export const proxy = auth(async (request) => {
  const pathname = request.nextUrl.pathname

  // ── API routes: rate limiting only ──────────────────────────────────
  if (pathname.startsWith('/api/')) {
    // Skip rate limiting for health checks and cron jobs
    if (pathname === '/api/health' || pathname.startsWith('/api/cron/')) {
      return NextResponse.next()
    }

    const type = classifyRequest(pathname)

    // Build identifier: prefer forwarded IP, fallback to real IP, then anonymized
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1'

    const result = await checkRateLimit(ip, type)

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', retryAfter: result.retryAfter },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter ?? 60),
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.resetTime.toISOString(),
          },
        }
      )
    }

    return NextResponse.next()
  }

  // ── Page routes: auth check ─────────────────────────────────────────
  const session = request.auth

  if (!session?.user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Force password change — only allow /cambiar-contrasena
  const mustChangePassword = (session.user as { mustChangePassword?: boolean }).mustChangePassword
  if (mustChangePassword && !pathname.startsWith('/cambiar-contrasena')) {
    return NextResponse.redirect(new URL('/cambiar-contrasena', request.url))
  }

  // Role-based access check
  const role = session.user?.role as Role | undefined
  if (!isRouteAllowed(pathname, role)) {
    return NextResponse.redirect(new URL(getRedirectForRole(role), request.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - login (auth page — must be excluded to prevent redirect loop)
     * - offline (PWA offline page — must be accessible without auth)
     * - api/auth (Auth.js endpoints — handled by Auth.js internally)
     * - sentry-tunnel (Sentry ingestion)
     * - serwist (PWA service worker)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata)
     * - sw.js (service worker)
     * - static assets (svg, png, jpg, etc.)
     *
     * NOTE: /api is NOT excluded — proxy handles rate limiting for API routes.
     */
    '/((?!login|offline|api/auth|sentry-tunnel|serwist|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2)$).*)',
  ],
}
