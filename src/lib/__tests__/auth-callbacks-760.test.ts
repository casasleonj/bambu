import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
const mocked = vi.hoisted(() => ({ verify: vi.fn(), register: vi.fn(), rawAuth: vi.fn() }))
vi.mock('next-auth', async () => {
  const { CredentialsSignin } = await import('@auth/core/errors')
  return { CredentialsSignin, default: () => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: mocked.rawAuth }) }
})
vi.mock('@/lib/session-store', () => ({ verifyActiveSession: mocked.verify, enforceSessionLimit: mocked.register, revokeSession: vi.fn() }))
vi.mock('@/lib/request-headers-safe', () => ({ getRequestHeadersSafe: async () => ({ ip: null, userAgent: null }) }))
vi.mock('@/lib/audit', () => ({ logAudit: async () => undefined }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
import { authOptions, auth } from '@/lib/auth'
import { SessionUnavailableError } from '@/lib/session-status'
type JwtCallback = (input: { token: JWT; user?: User }) => Promise<JWT>
type SessionCallback = (input: { token: JWT; session: Session }) => Promise<Session>
const jwt = authOptions.callbacks!.jwt as JwtCallback
const publicSession = authOptions.callbacks!.session as SessionCallback
const token: JWT = { sub: 'test-user', sessionId: 'test-session', role: 'ADMIN', sessionMaxAgeMs: 1800000 }
const blank = (): Session => ({ user: { name: 'stale-default-name' }, expires: '2099-01-01T00:00:00Z' })

beforeEach(() => vi.clearAllMocks())

describe('JWT validity without destructive temporary failures', () => {
  it('keeps the credential private while denying all public privileges on outage', async () => {
    mocked.verify.mockResolvedValue({ status: 'unavailable' })
    const result = await jwt({ token })
    expect(result.sub).toBe(token.sub)
    expect(result.sessionId).toBe(token.sessionId)
    expect(result.authStatus).toBe('unavailable')
    const session = await publicSession({ token: result, session: blank() })
    expect(session.user).toEqual({})
    expect(session.authStatus).toBe('unavailable')
  })

  it('can recover the same credential when the server is available again', async () => {
    mocked.verify.mockResolvedValueOnce({ status: 'unavailable' }).mockResolvedValueOnce({ status: 'valid', expiresAt: 1800000000000, maxAgeMs: 1800000, user: { id: 'test-user', role: 'ADMIN', name: 'Verified', mustChangePassword: false } })
    const preserved = await jwt({ token })
    const recovered = await jwt({ token: preserved })
    expect(recovered.authStatus).toBe('valid')
    expect(recovered.sessionExpiresAt).toBe(1800000000000)
    const session = await publicSession({ token: recovered, session: blank() })
    expect(session.user.id).toBe('test-user')
    expect(session.user.name).toBe('Verified')
    expect(session.expires).toBe(new Date(1800000000000).toISOString())
  })

  it('never authorizes a signed identity lacking its session association', async () => {
    const result = await jwt({ token: { ...token, sessionId: undefined } })
    expect(mocked.verify).not.toHaveBeenCalled()
    expect((await publicSession({ token: result, session: blank() })).user).toEqual({})
  })

  it('does not issue a token if initial registration fails', async () => {
    mocked.register.mockRejectedValue(new Error('database unavailable'))
    await expect(jwt({ token: {}, user: { id: 'test-user', role: 'ADMIN', name: 'Test' } as User })).rejects.toMatchObject({ code: 'temporarily_unavailable' })
  })

  it('throws unavailability only outside the Auth.js callback pipeline', async () => {
    mocked.rawAuth.mockResolvedValue({ user: {}, authStatus: 'unavailable' })
    await expect(auth()).rejects.toBeInstanceOf(SessionUnavailableError)
  })
})
