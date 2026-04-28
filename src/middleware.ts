import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { checkRateLimit, classifyRequest } from '@/lib/rate-limit'

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

    const response = NextResponse.next()
    response.headers.set('X-RateLimit-Limit', String(limit.limit))
    response.headers.set('X-RateLimit-Remaining', String(limit.remaining))
    response.headers.set('X-RateLimit-Reset', limit.resetTime.toISOString())

    if (!limit.allowed) {
      response.headers.set('Retry-After', String(limit.retryAfter))
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: response.headers }
      )
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

    return response
  }

  // Static assets + auth metadata: skip rate limit, still enforce auth redirects
  const isProtectedPage = PROTECTED_PAGE_ROUTES.some(route =>
    req.nextUrl.pathname.startsWith(route)
  )

  if (isProtectedPage && !isLoggedIn && !isApiAuth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
