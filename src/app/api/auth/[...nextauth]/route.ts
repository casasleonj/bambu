import { handlers, authOptions } from '@/lib/auth'
import { Auth } from '@auth/core'
import { sessionUnavailableResponse } from '@/lib/session-status'
import { withoutSessionCookies } from '@/lib/session-cookies'
import type { NextRequest } from 'next/server'

async function handleSession(request: NextRequest) {
  const response = await handlers[request.method === 'POST' ? 'POST' : 'GET'](request)
  if (new URL(request.url).pathname.endsWith('/session')) {
    const session: unknown = await response.clone().json().catch(() => null)
    if (session && typeof session === 'object' && 'authStatus' in session && session.authStatus === 'unavailable') {
      return withoutSessionCookies(response)
    }
  }
  return response
}

export const GET = handleSession

export async function POST(request: NextRequest) {
  const signingOut = new URL(request.url).pathname.endsWith('/signout')
  if (signingOut) {
    // Auth.js always clears the cookie on signout, even if its revoke event fails.
    // Check availability first so the UI cannot certify an unconfirmed remote logout.
    const url = new URL('/api/auth/session', request.url)
    const check = await Auth(new Request(url, { headers: request.headers }), { ...authOptions, basePath: '/api/auth' })
    const session: unknown = await check.json()
    if (session && typeof session === 'object' && 'authStatus' in session && session.authStatus === 'unavailable') {
      return sessionUnavailableResponse()
    }
  }
  const response = await handleSession(request)
  if (signingOut && response.ok && request.headers.get('x-auth-return-redirect') === '1') {
    const result: unknown = await response.clone().json().catch(() => null)
    if (result && typeof result === 'object' && 'url' in result && typeof result.url === 'string') {
      const destination = new URL(result.url, request.url)
      if (destination.pathname === '/login' && destination.search === '?reason=signedout') {
        // The SDK resolves relative redirects using the server URL, which can
        // differ from the browser's public origin (e.g. behind a reverse proxy).
        // Keep our fixed, approved logout destination on the current site.
        return new Response(JSON.stringify({ ...result, url: '/login?reason=signedout' }), {
          status: response.status,
          headers: response.headers,
        })
      }
    }
  }
  return response
}
