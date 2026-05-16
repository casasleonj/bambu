import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/offline', '/_next', '/favicon.ico', '/sw.js']
const AUTH_PATHS = ['/api/auth']

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return true
  if (AUTH_PATHS.some((p) => pathname.startsWith(p))) return true
  // Static assets
  if (pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2)$/)) return true
  return false
}

function getSessionCookie(request: NextRequest): string | undefined {
  return (
    request.cookies.get('next-auth.session-token')?.value ??
    request.cookies.get('__Secure-next-auth.session-token')?.value ??
    request.cookies.get('authjs.session-token')?.value
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const sessionToken = getSessionCookie(request)

  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2)$).*)',
  ],
}
