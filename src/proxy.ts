export { auth as proxy } from '@/lib/auth'

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2)$).*)',
  ],
}
