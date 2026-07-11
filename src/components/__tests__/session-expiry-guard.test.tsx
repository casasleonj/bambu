import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { SessionExpiryGuard, shouldRedirectOnUnauth } from '@/components/session-expiry-guard'
import { AUTH_EXPIRED_EVENT } from '@/lib/auth-events'
import type { Session } from 'next-auth'

const replaceMock = vi.fn()
let mockPathname = '/pedidos'
let mockSession: Session | null = { user: { id: 'user-1' } } as unknown as Session
let mockStatus: 'authenticated' | 'unauthenticated' | 'loading' = 'authenticated'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: mockSession, status: mockStatus }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => mockPathname,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('shouldRedirectOnUnauth', () => {
  it('returns true when status is unauthenticated on a protected path', () => {
    expect(shouldRedirectOnUnauth('/pedidos', 'unauthenticated', null)).toBe(true)
  })

  it('returns false when status is loading', () => {
    expect(shouldRedirectOnUnauth('/pedidos', 'loading', { user: { id: '1' } } as unknown as Session)).toBe(false)
  })

  it('returns false when authenticated with user id', () => {
    expect(shouldRedirectOnUnauth('/pedidos', 'authenticated', { user: { id: '1' } } as unknown as Session)).toBe(false)
  })

  it('returns true when authenticated but user id is missing', () => {
    expect(shouldRedirectOnUnauth('/pedidos', 'authenticated', { user: { id: null } } as unknown as Session)).toBe(true)
  })

  it('returns false on public paths', () => {
    expect(shouldRedirectOnUnauth('/login', 'unauthenticated', null)).toBe(false)
    expect(shouldRedirectOnUnauth('/login/redirect', 'unauthenticated', null)).toBe(false)
    expect(shouldRedirectOnUnauth('/offline', 'unauthenticated', null)).toBe(false)
  })
})

describe('SessionExpiryGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    replaceMock.mockReset()
    mockPathname = '/pedidos'
    mockSession = { user: { id: 'user-1' } } as unknown as Session
    mockStatus = 'authenticated'
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to /login?reason=expired when session becomes unauthenticated', async () => {
    mockSession = null
    mockStatus = 'unauthenticated'

    render(<SessionExpiryGuard />)

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login?reason=expired')
    })
  })

  it('redirects when CustomEvent is dispatched', async () => {
    render(<SessionExpiryGuard />)

    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { statusCode: 401, url: '/api/pedidos' } }))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login?reason=expired')
    })
  })

  it('does not redirect twice on multiple CustomEvents', async () => {
    render(<SessionExpiryGuard />)

    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1)
    })
  })

  it('does not redirect on public path when CustomEvent is dispatched', async () => {
    mockPathname = '/login'

    render(<SessionExpiryGuard />)

    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('cleans up event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(<SessionExpiryGuard />)
    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(AUTH_EXPIRED_EVENT, expect.any(Function))
    removeEventListenerSpy.mockRestore()
  })
})
