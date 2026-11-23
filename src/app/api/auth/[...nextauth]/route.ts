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
  if (new URL(request.url).pathname.endsWith('/signout')) {
    // Auth.js always clears the cookie on signout, even if its revoke event fails.
    // Check availability first so the UI cannot certify an unconfirmed remote logout.
    const url = new URL('/api/auth/session', request.url)
    const check = await Auth(new Request(url, { headers: request.headers }), { ...authOptions, basePath: '/api/auth' })
    const session: unknown = await check.json()
    if (session && typeof session === 'object' && 'authStatus' in session && session.authStatus === 'unavailable') {
      return sessionUnavailableResponse()
    }
  }
  return handleSession(request)
}
