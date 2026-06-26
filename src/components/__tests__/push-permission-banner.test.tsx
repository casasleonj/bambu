import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PushPermissionBanner } from '@/components/push-permission-banner'
import { usePushSubscription } from '@/hooks/use-push-subscription'

vi.mock('@/hooks/use-push-subscription', () => ({
  usePushSubscription: vi.fn(),
}))

const mockedUsePushSubscription = vi.mocked(usePushSubscription)

describe('PushPermissionBanner', () => {
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

  it('no se muestra cuando push no está soportado', () => {
    mockedUsePushSubscription.mockReturnValueOnce({
      supported: false,
      permission: 'default',
      subscribed: false,
      loading: false,
      recovering: false,
      error: null,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })

    const { container } = render(<PushPermissionBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('no se muestra cuando el permiso ya fue concedido', () => {
    mockedUsePushSubscription.mockReturnValueOnce({
      supported: true,
      permission: 'granted',
      subscribed: true,
      loading: false,
      recovering: false,
      error: null,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })

    const { container } = render(<PushPermissionBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('muestra el banner cuando el permiso está por defecto', () => {
    render(<PushPermissionBanner />)

    expect(screen.getByText('Recibe alertas importantes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Activar notificaciones/i })).toBeInTheDocument()
  })

  it('llama a subscribe al hacer clic en activar', () => {
    const subscribe = vi.fn()
    mockedUsePushSubscription.mockReturnValueOnce({
      supported: true,
      permission: 'default',
      subscribed: false,
      loading: false,
      recovering: false,
      error: null,
      subscribe,
      unsubscribe: vi.fn(),
    })

    render(<PushPermissionBanner />)
    fireEvent.click(screen.getByRole('button', { name: /Activar notificaciones/i }))

    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('se puede cerrar con el botón de dismiss', () => {
    render(<PushPermissionBanner />)

    fireEvent.click(screen.getByLabelText('Cerrar banner'))

    expect(screen.queryByText('Recibe alertas importantes')).not.toBeInTheDocument()
  })

  it('muestra hint de iOS cuando no está en modo standalone', () => {
    const originalUserAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      configurable: true,
    })
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

    render(<PushPermissionBanner />)

    expect(screen.getByText(/En iPhone o iPad/i)).toBeInTheDocument()

    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    })
  })

  it('no muestra hint de iOS cuando la app ya está instalada', () => {
    const originalUserAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      configurable: true,
    })
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia

    const { queryByText } = render(<PushPermissionBanner />)

    expect(queryByText(/En iPhone o iPad/i)).not.toBeInTheDocument()

    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    })
  })
})
