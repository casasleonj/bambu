import { it, expect } from 'vitest'
import { withoutSessionCookies } from '@/lib/session-cookies'

it('removes all auth chunks from ordinary responses, preserving unrelated cookies and status', () => {
  const response = new Response('data', { status: 503 })
  response.headers.append('set-cookie', 'authjs.session-token=old; HttpOnly; Path=/')
  response.headers.append('set-cookie', '__Secure-authjs.session-token.0=chunk; HttpOnly; Path=/')
  response.headers.append('set-cookie', '__Secure-authjs.session-token.1=chunk; HttpOnly; Path=/')
  response.headers.append('set-cookie', '__Host-authjs.csrf-token=csrf; Path=/')
  response.headers.append('set-cookie', 'preference=light; Path=/')
  const clean = withoutSessionCookies(response)
  expect(clean).toBe(response)
  expect(clean.status).toBe(503)
  expect(clean.headers.getSetCookie()).toEqual(['__Host-authjs.csrf-token=csrf; Path=/', 'preference=light; Path=/'])
})
