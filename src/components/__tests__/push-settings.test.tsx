import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PushSettings } from '@/components/push-settings'
import { usePushSubscription } from '@/hooks/use-push-subscription'

vi.mock('@/hooks/use-push-subscription', () => ({
  usePushSubscription: vi.fn(),
}))

const mockedUsePushSubscription = vi.mocked(usePushSubscription)

describe('PushSettings', () => {
  beforeEach(() => {
    mockedUsePushSubscription.mockReturnValue({
      supported: true,
      permission: 'default',
      subscribed: false,
      loading: false,
      recovering: false,
      error: null,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('muestra estado no soportado cuando push no está disponible', () => {
    mockedUsePushSubscription.mockReturnValue({
      supported: false,
      permission: 'default',
      subscribed: false,
      loading: false,
      recovering: false,
      error: null,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })

    render(<PushSettings />)

    expect(screen.getByText('Las notificaciones push no están soportadas en este dispositivo.')).toBeInTheDocument()
  })

  it('muestra bloqueadas y deshabilita el botón cuando el permiso fue denegado', () => {
    mockedUsePushSubscription.mockReturnValue({
      supported: true,
      permission: 'denied',
      subscribed: false,
      loading: false,
      recovering: false,
      error: null,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })

    render(<PushSettings />)

    expect(screen.getByText('Bloqueadas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bloqueado/i })).toBeDisabled()
  })

  it('muestra activas y desactivar cuando hay suscripción activa', () => {
    const unsubscribe = vi.fn()
    mockedUsePushSubscription.mockReturnValue({
      supported: true,
      permission: 'granted',
      subscribed: true,
      loading: false,
      recovering: false,
      error: null,
      subscribe: vi.fn(),
      unsubscribe,
    })

    render(<PushSettings />)

    expect(screen.getByText('Activas')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Desactivar notificaciones/i }))

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('muestra restaurar suscripción cuando el permiso está concedido pero no hay suscripción', () => {
    const subscribe = vi.fn()
    mockedUsePushSubscription.mockReturnValue({
      supported: true,
      permission: 'granted',
      subscribed: false,
      loading: false,
      recovering: false,
      error: null,
      subscribe,
      unsubscribe: vi.fn(),
    })

    render(<PushSettings />)

    expect(screen.getByText('Inactivas')).toBeInTheDocument()
    expect(screen.getByText(/El navegador ya permite notificaciones/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Restaurar suscripción/i }))
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('muestra activar cuando el permiso aún no fue solicitado', () => {
    const subscribe = vi.fn()
    mockedUsePushSubscription.mockReturnValue({
      supported: true,
      permission: 'default',
      subscribed: false,
      loading: false,
      recovering: false,
      error: null,
      subscribe,
      unsubscribe: vi.fn(),
    })

    render(<PushSettings />)

    expect(screen.getByText('Inactivas')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Activar notificaciones/i }))
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('muestra restaurando durante auto-recuperación', () => {
    mockedUsePushSubscription.mockReturnValue({
      supported: true,
      permission: 'granted',
      subscribed: false,
      loading: false,
      recovering: true,
      error: null,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })

    render(<PushSettings />)

    expect(screen.getByText('Estamos recuperando tu suscripción de notificaciones.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Restaurando/i })).toBeDisabled()
  })

  it('renderiza variante compacta', () => {
    mockedUsePushSubscription.mockReturnValue({
      supported: true,
      permission: 'granted',
      subscribed: true,
      loading: false,
      recovering: false,
      error: null,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })

    render(<PushSettings variant="compact" />)

    expect(screen.getByText('Activas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Desactivar notificaciones/i })).toBeInTheDocument()
  })
})
