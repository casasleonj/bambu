import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@/lib/auth'
import { checkRateLimit, classifyRequest } from '@/lib/rate-limit'
import { isRouteAllowed, getRedirectForRole } from '@/lib/permissions'
import { validateCsrf } from '@/lib/csrf'
import { setRequestIdProvider } from '@/lib/logger'
import type { Role } from '@/lib/constants'

/**
 * Proxy (formerly middleware) — runs on Node.js runtime before routes are rendered.
 *
 * Uses Auth.js auth() wrapper pattern (documented at authjs.dev):
 *   export const proxy = auth((req) => { ... })
 *
 * This provides request.auth directamente without calling await auth() again.
 *
 * Responsabilidades:
 * 1. API routes (/api/*):
 *    a) CSRF check (Origin/Referer) on state-changing methods — S-1 fix.
 *       Auth.js handles CSRF for /api/auth/* only. The other endpoints
 *       need this defense against CSRF (the validateCsrf() helper in
 *       src/lib/csrf.ts was previously dead code).
 *    b) Rate limiting.
 *    c) Route handlers handle their own auth via requireAuth().
 * 2. Page routes: Auth check + mustChangePassword guard + role-based access.
 */
export const proxy = auth(async (request) => {
  // Sprint 6 (V-5): set request ID para correlación de logs. Honra
  // x-request-id upstream (Vercel/edge proxies lo inyectan) o genera UUID.
  const requestId = request.headers.get('x-request-id') || randomUUID()
  setRequestIdProvider(() => requestId)

  const pathname = request.nextUrl.pathname

  // ── API routes: CSRF + rate limiting ──────────────────────────────────
  if (pathname.startsWith('/api/')) {
    // Skip health checks and cron jobs
    if (pathname === '/api/health' || pathname.startsWith('/api/cron/')) {
      return NextResponse.next()
    }

    // S-1 fix: CSRF check BEFORE rate limiting so failed CSRF
    // attempts don't consume the rate-limit budget. Auth.js handles
    // its own CSRF for /api/auth/* endpoints.
    const csrfResponse = validateCsrf(request)
    if (csrfResponse) {
      return csrfResponse
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

  // FIX C-9: validar session?.user?.id en vez de solo session?.user.
  // NextAuth SIEMPRE popula session.user con defaults (name, email, image)
  // incluso si no hay un usuario real. Por eso el check anterior
  // \`if (!session?.user)\` NUNCA era true para un usuario con token.sub=undefined
  // (usuario desactivado que aún tiene JWT válido).
  //
  // El jwt callback (en auth.ts:82-85) pone sub:undefined cuando el usuario
  // es desactivado, pero la siguiente propagación del session callback
  // también debe respetarlo: si no hay sub, no poblar session.user.
  //
  // Con este fix, un usuario desactivado que aún tenga JWT válido es
  // redirigido a /login inmediatamente en el siguiente request, sin
  // esperar al refresh del token (que ocurre cada 5 min).
  if (!session?.user?.id) {
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
      * - manifest.json (PWA manifest)
      * - sw.js (service worker)
      * - static assets (svg, png, jpg, jpeg, gif, webp, css, js, woff, woff2)
      *
      * NOTE: /api is NOT excluded — proxy handles rate limiting for API routes.
      */
    '/((?!login|offline|api/auth|sentry-tunnel|serwist|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2)$).*)',
  ],
}
