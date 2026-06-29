import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { usePushOptIn } from '@/hooks/use-push-opt-in'

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

vi.mock('@/hooks/use-push-subscription', () => ({
  usePushSubscription: vi.fn(),
}))

vi.mock('@/lib/pwa', () => ({
  isIosDevice: vi.fn(),
  isStandaloneMode: vi.fn(),
}))

import { useSession } from 'next-auth/react'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { isIosDevice, isStandaloneMode } from '@/lib/pwa'

const mockedUseSession = vi.mocked(useSession)
const mockedUsePushSubscription = vi.mocked(usePushSubscription)
const mockedIsIosDevice = vi.mocked(isIosDevice)
const mockedIsStandaloneMode = vi.mocked(isStandaloneMode)

function mockSession(role: string) {
  mockedUseSession.mockReturnValue({
    data: { user: { role } },
    status: 'authenticated',
    update: vi.fn(),
  })
}

function mockPushSubscription(
  overrides: Partial<ReturnType<typeof usePushSubscription>> = {},
) {
  mockedUsePushSubscription.mockReturnValue({
    supported: true,
    permission: 'default',
    setPermission: vi.fn(),
    subscribed: false,
    loading: false,
    recovering: false,
    error: null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    ...overrides,
  })
}

describe('usePushOptIn', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mockSession('ADMIN')
    mockPushSubscription()
    mockedIsIosDevice.mockReturnValue(false)
    mockedIsStandaloneMode.mockReturnValue(false)
    Object.defineProperty(window, 'Notification', {
      writable: true,
      value: { permission: 'default' },
    })
  })

  it('muestra toast para ADMIN con permission default', async () => {
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(true))
  })

  it('no muestra toast para REPARTIDOR', async () => {
    mockSession('REPARTIDOR')
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(false))
  })

  it('no muestra toast para SELLADOR', async () => {
    mockSession('SELLADOR')
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(false))
  })

  it('no muestra toast en iOS sin standalone', async () => {
    mockedIsIosDevice.mockReturnValue(true)
    mockedIsStandaloneMode.mockReturnValue(false)
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(false))
  })

  it('muestra toast en iOS con standalone', async () => {
    mockedIsIosDevice.mockReturnValue(true)
    mockedIsStandaloneMode.mockReturnValue(true)
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(true))
  })

  it('no muestra toast si permission es denied', async () => {
    mockPushSubscription({ permission: 'denied' })
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(false))
  })

  it('no muestra toast si permission es granted', async () => {
    mockPushSubscription({ permission: 'granted' })
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(false))
  })

  it('dismiss persiste flag y oculta toast', async () => {
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(true))
    act(() => {
      result.current.dismiss()
    })
    await waitFor(() => expect(result.current.shouldShow).toBe(false))
    expect(localStorage.getItem('push-opt-in-dismissed')).toBe('1')
    expect(sessionStorage.getItem('push-opt-in-shown-this-session')).toBe('1')
  })

  it('no muestra toast si fue dismissed previamente', async () => {
    localStorage.setItem('push-opt-in-dismissed', '1')
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(false))
  })

  it('no muestra toast si ya se mostro esta sesion', async () => {
    sessionStorage.setItem('push-opt-in-shown-this-session', '1')
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(false))
  })

  it('accept llama subscribe y setea accepted si grantea', async () => {
    const subscribe = vi.fn().mockResolvedValue(undefined)
    mockPushSubscription({ subscribe })
    Object.defineProperty(window, 'Notification', {
      writable: true,
      value: { permission: 'granted' },
    })
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(true))
    await result.current.accept()
    expect(subscribe).toHaveBeenCalled()
    expect(localStorage.getItem('push-opt-in-accepted')).toBe('1')
  })

  it('accept no setea accepted si no grantea', async () => {
    const subscribe = vi.fn().mockResolvedValue(undefined)
    mockPushSubscription({ subscribe })
    Object.defineProperty(window, 'Notification', {
      writable: true,
      value: { permission: 'denied' },
    })
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(true))
    await result.current.accept()
    expect(subscribe).toHaveBeenCalled()
    expect(localStorage.getItem('push-opt-in-accepted')).toBeNull()
  })

  it('accept guarda error si subscribe falla', async () => {
    const subscribe = vi.fn().mockRejectedValue(new Error('VAPID missing'))
    mockPushSubscription({ subscribe })
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(true))
    await act(async () => {
      await result.current.accept()
    })
    await waitFor(() => expect(result.current.error).toBe('VAPID missing'))
  })
})
