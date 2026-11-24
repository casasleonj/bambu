import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocked = vi.hoisted(() => ({ auth: vi.fn(), revoke: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: mocked.auth }))
vi.mock('@/lib/session-store', () => ({ revokeSession: mocked.revoke }))
vi.mock('@/lib/audit', () => ({ logAudit: mocked.audit }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
import { DELETE } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  mocked.auth.mockResolvedValue({ user: { id: 'user-b', sessionId: 'session-b' }, authStatus: 'valid' })
  mocked.revoke.mockResolvedValue(true)
  mocked.audit.mockResolvedValue(undefined)
})

it('does not let a stale logout intent for A revoke the current session B', async () => {
  const request = new NextRequest('https://public.example/api/auth/logout-session', { method: 'DELETE', headers: { 'x-session-id': 'session-a' } })
  const response = await DELETE(request)
  expect(response.status).toBe(409)
  expect(mocked.revoke).not.toHaveBeenCalled()
  expect(mocked.audit).not.toHaveBeenCalled()
})

it('revokes and audits the matching current association once', async () => {
  const response = await DELETE(new NextRequest('https://public.example/api/auth/logout-session', { method: 'DELETE', headers: { 'x-session-id': 'session-b' } }))
  expect(response.status).toBe(200)
  expect(mocked.revoke).toHaveBeenCalledWith('session-b')
  expect(mocked.audit).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 'user-b', accion: 'FORCE_LOGOUT' }))
})

it('does not duplicate the logout audit when the row is already absent', async () => {
  mocked.revoke.mockResolvedValue(false)
  const response = await DELETE(new NextRequest('https://public.example/api/auth/logout-session', { method: 'DELETE', headers: { 'x-session-id': 'session-b' } }))
  expect(response.status).toBe(200)
  expect(mocked.audit).not.toHaveBeenCalled()
})
