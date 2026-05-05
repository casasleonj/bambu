import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { checkRateLimit, classifyRequest } from '@/lib/rate-limit'
import { validateCsrf } from '@/lib/csrf'

const PROTECTED_PAGE_ROUTES = [
  '/dashboard',
  '/pedidos',
  '/clientes',
  '/embarques',
  '/produccion',
  '/cierre',
  '/facturas',
  '/gastos',
  '/nomina',
  '/trabajadores',
  '/proveedores',
  '/compras',
  '/insumos',
  '/reportes',
  '/precios',
]

const ADMIN_PAGE_ROUTES = [
  '/trabajadores',
  '/cierre',
  '/reportes',
  '/precios',
  '/nomina',
]

function generateNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
}

/**
 * Get the real client IP. Only trust x-forwarded-for if we're behind a known proxy
 * (Vercel sets x-real-ip; standalone Node uses req.ip).
 * Using unvalidated x-forwarded-for allows rate-limit bypass via header spoofing.
 */
function getClientIp(req: Request): string {
  // Vercel-specific: x-real-ip is set by Vercel's edge and cannot be spoofed
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp

  // Fallback: only use last entry in x-forwarded-for (rightmost = closest trusted proxy)
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',').map(s => s.trim()).filter(Boolean)
    // Use the RIGHTMOST IP (the last proxy before our server), not the leftmost (client-controlled)
    return parts[parts.length - 1] || 'unknown'
  }

  return 'unknown'
}

export default auth(async (req) => {
  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname === '/login'
  const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth')
  const isStaticAsset = req.nextUrl.pathname.startsWith('/_next/') ||
    req.nextUrl.pathname.startsWith('/static/')

  // Endpoints de auth que SÍ necesitan rate limit estricto (brute force login)
  const isAuthCredentialEndpoint =
    req.nextUrl.pathname.startsWith('/api/auth/callback/') ||
    req.nextUrl.pathname.startsWith('/api/auth/signin/')

  // Endpoints de auth benignos (session, csrf, providers) que NextAuth llama frecuentemente
  const isAuthMetadata = isApiAuth && !isAuthCredentialEndpoint

  // Rate limit everything EXCEPT: static assets, auth metadata endpoints
  if (!isStaticAsset && !isAuthMetadata) {
    const ip = getClientIp(req)
    const type = classifyRequest(req.nextUrl.pathname)
    const limit = await checkRateLimit(`${ip}:${type}`, type)

    const nonce = generateNonce()
    req.headers.set('x-nonce', nonce)

    const response = NextResponse.next()
    response.headers.set('X-RateLimit-Limit', String(limit.limit))
    response.headers.set('X-RateLimit-Remaining', String(limit.remaining))
    response.headers.set('X-RateLimit-Reset', limit.resetTime.toISOString())
    response.headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`)
    if (!limit.allowed) {
      response.headers.set('Retry-After', String(limit.retryAfter))
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: response.headers }
      )
    }

    // CSRF protection + auth enforcement for API routes
    if (req.nextUrl.pathname.startsWith('/api/') && !isApiAuth) {
      const csrfError = validateCsrf(req)
      if (csrfError) return csrfError

      // Require authentication for state-changing API requests
      // GET requests are handled per-route (some are intentionally public, e.g. /api/config/BASE_DIA)
      const method = req.method
      if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
        if (!isLoggedIn) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
      }
    }

    // Auth enforcement for protected pages
    const isProtectedPage = PROTECTED_PAGE_ROUTES.some(route =>
      req.nextUrl.pathname.startsWith(route)
    )

    if (isProtectedPage && !isLoggedIn) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    if (isAuthPage && isLoggedIn) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    // Role-based access control for admin pages
    if (ADMIN_PAGE_ROUTES.some(route => req.nextUrl.pathname.startsWith(route))) {
      const userRole = (req.auth?.user as { role?: string } | undefined)?.role
      if (userRole !== 'ADMIN' && userRole !== 'CONTADOR') {
        return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
      }
    }

    return response
  }

  // Static assets + auth metadata: skip rate limit, still enforce auth redirects
  const isProtectedPage = PROTECTED_PAGE_ROUTES.some(route =>
    req.nextUrl.pathname.startsWith(route)
  )

  if (isProtectedPage && !isLoggedIn && !isApiAuth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Role-based access control for admin pages (static assets path)
  if (ADMIN_PAGE_ROUTES.some(route => req.nextUrl.pathname.startsWith(route))) {
    const userRole = (req.auth?.user as { role?: string } | undefined)?.role
    if (userRole !== 'ADMIN' && userRole !== 'CONTADOR') {
      return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
    }
  }

  const nonce = generateNonce()
  req.headers.set('x-nonce', nonce)
  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`)
  return response
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
