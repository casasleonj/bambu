import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent, screen, act } from '@testing-library/react'
import { SessionExpiryGuard, shouldRedirectOnUnauth } from '@/components/session-expiry-guard'
import { AUTH_LOGOUT_STATE_EVENT, AUTH_EXPIRED_EVENT, isIntentionalSignOut, markIntentionalSignOut, resetIntentionalSignOut } from '@/lib/auth-events'
import type { Session } from 'next-auth'

const replaceMock = vi.fn()
const mockUpdate = vi.fn()
let mockTransport = 'valid'
vi.mock('@/lib/session-transport', () => ({ getSessionTransportState: () => mockTransport, SESSION_TRANSPORT_EVENT: 'bambu:session-transport' }))
let mockPathname = '/pedidos'
let mockSession: Session | null = { user: { id: 'user-1' } } as unknown as Session
let mockStatus: 'authenticated' | 'unauthenticated' | 'loading' = 'authenticated'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: mockSession, status: mockStatus, update: mockUpdate }),
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
  beforeEach(() => {
    // Reset the module-level flag before each test
    resetIntentionalSignOut()
  })

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

  it('returns false when isIntentionalSignOut is true', () => {
    markIntentionalSignOut()
    expect(isIntentionalSignOut).toBe(true)
    expect(shouldRedirectOnUnauth('/pedidos', 'unauthenticated', null)).toBe(false)
  })
})

describe('SessionExpiryGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    replaceMock.mockReset()
    mockTransport = 'valid'
    mockUpdate.mockImplementation(async () => { mockTransport = 'invalid'; return { user: {}, authStatus: 'invalid', expires: '2099-01-01T00:00:00Z' } })
    mockPathname = '/pedidos'
    mockSession = { user: { id: 'user-1' } } as unknown as Session
    mockStatus = 'authenticated'
    // Reset module-level flag
    resetIntentionalSignOut()
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

  it('verifies current identity before redirecting on a rejected request', async () => {
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

  it('does not expel the current user because an old request returned 401', async () => {
    mockUpdate.mockImplementation(async () => { mockTransport = 'valid'; return mockSession })
    render(<SessionExpiryGuard />)
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('keeps a temporary failure recoverable and never reports it as expiry', async () => {
    mockUpdate.mockImplementation(async () => { mockTransport = 'unavailable'; return { user: {}, authStatus: 'unavailable' } })
    render(<SessionExpiryGuard />)
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    await screen.findByRole('button', { name: /^Reintentar$/ })
    expect(replaceMock).not.toHaveBeenCalled()
    mockUpdate.mockImplementation(async () => { mockTransport = 'valid'; return mockSession })
    fireEvent.click(screen.getByRole('button', { name: /^Reintentar$/ }))
    await waitFor(() => expect(screen.queryByTestId('session-recovery')).not.toBeInTheDocument())
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('shows a retry instead of redirecting when verification rejects', async () => {
    mockUpdate.mockRejectedValue(new TypeError('offline'))
    render(<SessionExpiryGuard />)
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    await screen.findByRole('button', { name: /^Reintentar$/ })
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('removes a temporary overlay when the Provider later recovers on its own', async () => {
    mockUpdate.mockImplementation(async () => { mockTransport = 'unavailable'; return { user: {}, authStatus: 'unavailable' } })
    const view = render(<SessionExpiryGuard />)
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    await screen.findByRole('button', { name: /^Reintentar$/ })
    mockTransport = 'valid'
    act(() => { window.dispatchEvent(new Event('bambu:session-transport')) })
    view.rerender(<SessionExpiryGuard />)
    await waitFor(() => expect(screen.queryByTestId('session-recovery')).not.toBeInTheDocument())
    expect(replaceMock).not.toHaveBeenCalled()
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

  it('does not redirect when isIntentionalSignOut is true', async () => {
    markIntentionalSignOut()
    mockSession = null
    mockStatus = 'unauthenticated'

    render(<SessionExpiryGuard />)

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(replaceMock).not.toHaveBeenCalled()
  })
})

it('shows the explicit logout state and does not redirect on an older verification', async () => {
  resetIntentionalSignOut()
  mockSession = { user: { id: 'user-1' } } as unknown as Session
  mockStatus = 'authenticated'
  mockPathname = '/pedidos'
  mockTransport = 'valid'
  replaceMock.mockClear()
  let finish!: (session: Session | null) => void
  mockUpdate.mockImplementation(() => new Promise<Session | null>(resolve => { finish = resolve }))
  render(<SessionExpiryGuard />)
  act(() => { window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT)) })
  await waitFor(() => expect(finish).toBeDefined())
  const retry = vi.fn()
  act(() => { window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_STATE_EVENT, { detail: { pending: true, retry } })) })
  expect(screen.getByRole('button', { name: 'Cerrando sesión…' })).toBeDisabled()
  await act(async () => { mockTransport = 'invalid'; finish(null) })
  expect(replaceMock).not.toHaveBeenCalled()
  act(() => { window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_STATE_EVENT, { detail: { pending: false, retry } })) })
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar cierre' }))
  expect(retry).toHaveBeenCalledOnce()
})
