import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PushSettings } from '@/components/push-settings'

vi.mock('@/hooks/use-push-subscription', () => ({
  usePushSubscription: vi.fn(),
}))

vi.mock('@/lib/pwa', () => ({
  isIosDevice: vi.fn(),
  isStandaloneMode: vi.fn(),
}))

import { usePushSubscription } from '@/hooks/use-push-subscription'
import { isIosDevice, isStandaloneMode } from '@/lib/pwa'

const mockedUsePushSubscription = vi.mocked(usePushSubscription)
const mockedIsIosDevice = vi.mocked(isIosDevice)
const mockedIsStandaloneMode = vi.mocked(isStandaloneMode)

function mockPermission(permission: NotificationPermission) {
  Object.defineProperty(window, 'Notification', {
    value: { permission },
    writable: true,
    configurable: true,
  })
}

function mockPushSubscription(
  overrides: Partial<ReturnType<typeof usePushSubscription>> = {},
) {
  mockedUsePushSubscription.mockReturnValue({
    supported: true,
    permission: overrides.permission ?? 'default',
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

describe('PushSettings denied state', () => {
  beforeEach(() => {
    mockedIsIosDevice.mockReturnValue(false)
    mockedIsStandaloneMode.mockReturnValue(false)
    mockPermission('denied')
  })

  it('muestra guia de Android en Android', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0',
      writable: true,
      configurable: true,
    })
    mockPushSubscription({ permission: 'denied' })
    render(<PushSettings />)
    expect(screen.getByText(/Android/)).toBeInTheDocument()
  })

  it('muestra guia de iOS web en iPhone sin standalone', () => {
    mockedIsIosDevice.mockReturnValue(true)
    mockedIsStandaloneMode.mockReturnValue(false)
    mockPushSubscription({ permission: 'denied' })
    render(<PushSettings />)
    expect(screen.getByText(/Añadir a inicio/)).toBeInTheDocument()
  })

  it('muestra guia de iOS standalone en iPhone con standalone', () => {
    mockedIsIosDevice.mockReturnValue(true)
    mockedIsStandaloneMode.mockReturnValue(true)
    mockPushSubscription({ permission: 'denied' })
    render(<PushSettings />)
    expect(screen.getByText(/Safari no permite configurar notificaciones por sitio/)).toBeInTheDocument()
  })

  it('muestra guia de Desktop en desktop', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      writable: true,
      configurable: true,
    })
    mockPushSubscription({ permission: 'denied' })
    render(<PushSettings />)
    expect(screen.getByText(/barra de direcciones/)).toBeInTheDocument()
  })
})

describe('PushSettings visibilitychange', () => {
  it('re-evalua permission al volver a la pestaña', async () => {
    mockPermission('denied')
    const setPermission = vi.fn()
    mockedUsePushSubscription.mockReturnValue({
      supported: true,
      permission: 'denied',
      setPermission,
      subscribed: false,
      loading: false,
      recovering: false,
      error: null,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })
    render(<PushSettings />)

    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted' },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    })

    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(setPermission).toHaveBeenCalledWith('granted'))
  })
})
