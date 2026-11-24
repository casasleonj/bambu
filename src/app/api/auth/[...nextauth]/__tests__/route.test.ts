import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocked = vi.hoisted(() => ({ handler: vi.fn(), check: vi.fn() }))
vi.mock('@/lib/auth', () => ({ handlers: { GET: mocked.handler, POST: mocked.handler }, authOptions: {} }))
vi.mock('@auth/core', () => ({ Auth: mocked.check }))
import { GET, POST } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  mocked.check.mockResolvedValue(Response.json({ user: { id: 'synthetic' }, authStatus: 'valid' }))
})

it('keeps the fixed successful logout destination on the current browser origin', async () => {
  mocked.handler.mockResolvedValue(Response.json({ url: 'http://internal-host/login?reason=signedout' }, {
    headers: { 'set-cookie': 'authjs.session-token=; Max-Age=0; Path=/; HttpOnly' },
  }))
  const request = new NextRequest('https://public.example/api/auth/signout', { method: 'POST', headers: { 'x-auth-return-redirect': '1' } })
  const response = await POST(request)
  expect(await response.json()).toEqual({ url: '/login?reason=signedout' })
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
})

it('does not rewrite an authentication error as a confirmed logout', async () => {
  mocked.handler.mockResolvedValue(Response.json({ url: 'http://internal-host/api/auth/error?error=AccessDenied' }))
  const response = await POST(new NextRequest('https://public.example/api/auth/signout', { method: 'POST', headers: { 'x-auth-return-redirect': '1' } }))
  expect(await response.json()).toEqual({ url: 'http://internal-host/api/auth/error?error=AccessDenied' })
})

it('does not call signout or clear cookies when remote verification is unavailable', async () => {
  mocked.check.mockResolvedValue(Response.json({ user: {}, authStatus: 'unavailable' }))
  const response = await POST(new NextRequest('https://public.example/api/auth/signout', { method: 'POST' }))
  expect(response.status).toBe(503)
  expect(response.headers.get('set-cookie')).toBeNull()
  expect(mocked.handler).not.toHaveBeenCalled()
})

it('preserves the credential on unavailable session reads while retaining unrelated cookies', async () => {
  const headers = new Headers()
  headers.append('set-cookie', 'authjs.session-token=old; HttpOnly; Path=/')
  headers.append('set-cookie', 'authjs.csrf-token=synthetic; HttpOnly; Path=/')
  mocked.handler.mockResolvedValue(Response.json({ user: {}, authStatus: 'unavailable' }, { headers }))
  const response = await GET(new NextRequest('https://public.example/api/auth/session'))
  expect(response.headers.getSetCookie()).toEqual(['authjs.csrf-token=synthetic; HttpOnly; Path=/'])
  expect((await response.json()).authStatus).toBe('unavailable')
})
