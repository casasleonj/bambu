import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname === '/login'
  const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth')

  // Rate limiting for all requests
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'anonymous'
  const limit = rateLimit(ip, 100, 60000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    )
  }

  // Rutas protegidas
  const protectedRoutes = ['/pedidos', '/clientes', '/embarques', '/produccion', '/cierre', '/facturas', '/gastos', '/nomina', '/insumos', '/reportes']

  const isProtectedRoute = protectedRoutes.some(route =>
    req.nextUrl.pathname.startsWith(route)
  )

  if (isProtectedRoute && !isLoggedIn && !isApiAuth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}