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
    data: { user: { role }, expires: '2099-01-01T00:00:00.000Z' },
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

  it('dismiss persiste flag permanente y oculta toast', async () => {
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(true))
    act(() => {
      result.current.dismiss()
    })
    await waitFor(() => expect(result.current.shouldShow).toBe(false))
    expect(localStorage.getItem('push-opt-in-dismissed')).toBe('1')
    expect(sessionStorage.getItem('push-opt-in-shown-this-session')).toBe('1')
  })

  it('remindLater NO persiste flag permanente, solo oculta el toast por esta sesión', async () => {
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(true))
    act(() => {
      result.current.remindLater()
    })
    await waitFor(() => expect(result.current.shouldShow).toBe(false))
    expect(localStorage.getItem('push-opt-in-dismissed')).toBeNull()
    expect(sessionStorage.getItem('push-opt-in-shown-this-session')).toBe('1')
  })

  it('tras remindLater, el toast vuelve a poder mostrarse en una sesión nueva', async () => {
    const { result } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result.current.shouldShow).toBe(true))
    act(() => {
      result.current.remindLater()
    })
    await waitFor(() => expect(result.current.shouldShow).toBe(false))

    // Simula una sesión nueva: sessionStorage se limpia, localStorage no.
    sessionStorage.clear()
    const { result: result2 } = renderHook(() => usePushOptIn())
    await waitFor(() => expect(result2.current.shouldShow).toBe(true))
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

  // ─── #595: franja + campana ───────────────────────────────────────────────

  describe('campana y estados del intento (#595)', () => {
    it('con la franja a la vista no hay campana', async () => {
      const { result } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(true))
      expect(result.current.showBell).toBe(false)
    })

    it('«Más tarde»: la franja se cierra y aparece la campana CON punto', async () => {
      const { result } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(true))
      act(() => result.current.remindLater())
      expect(result.current.stripVisible).toBe(false)
      expect(result.current.showBell).toBe(true)
      expect(result.current.bellHasDot).toBe(true)
    })

    it('«✕»: la franja no vuelve y la campana queda SIN punto', async () => {
      const { result } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(true))
      act(() => result.current.dismiss())
      expect(result.current.stripVisible).toBe(false)
      expect(result.current.showBell).toBe(true)
      expect(result.current.bellHasDot).toBe(false)
    })

    it('descartada para siempre en una sesión nueva: sin franja pero con la campana sin punto', async () => {
      localStorage.setItem('push-opt-in-dismissed', '1')
      const { result } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.showBell).toBe(true))
      expect(result.current.shouldShow).toBe(false)
      expect(result.current.bellHasDot).toBe(false)
    })

    it.each(['denied', 'granted'] as const)('permiso %s: ni franja ni campana', async (permission) => {
      mockPushSubscription({ permission })
      const { result } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(false))
      expect(result.current.showBell).toBe(false)
    })

    it.each(['REPARTIDOR', 'SELLADOR'])('%s no ve ni la franja ni la campana', async (role) => {
      mockSession(role)
      const { result } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(false))
      expect(result.current.showBell).toBe(false)
    })

    it('iOS sin standalone: ni franja ni campana', async () => {
      mockedIsIosDevice.mockReturnValue(true)
      mockedIsStandaloneMode.mockReturnValue(false)
      const { result } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(false))
      expect(result.current.showBell).toBe(false)
    })

    it('mientras se activa desde la franja el estado es activating y la franja sigue visible', async () => {
      const subscribe = vi.fn().mockResolvedValue(undefined)
      mockPushSubscription({ subscribe })
      const { result, rerender } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(true))
      await act(async () => {
        await result.current.accept()
      })
      mockPushSubscription({ subscribe, loading: true, permission: 'granted' })
      rerender()
      expect(result.current.status).toBe('activating')
      expect(result.current.stripVisible).toBe(true)
      expect(result.current.panelActive).toBe(false)
    })

    it('éxito: pasa a success, mantiene la franja y se cierra sola a los 2,5 s', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const subscribe = vi.fn().mockResolvedValue(undefined)
        mockPushSubscription({ subscribe })
        const { result, rerender } = renderHook(() => usePushOptIn())
        await waitFor(() => expect(result.current.stripVisible).toBe(true))
        await act(async () => {
          await result.current.accept()
        })
        mockPushSubscription({ subscribe, permission: 'granted', subscribed: true })
        rerender()
        expect(result.current.status).toBe('success')
        expect(result.current.stripVisible).toBe(true)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2600)
        })
        expect(result.current.status).toBe('idle')
        expect(result.current.stripVisible).toBe(false)
        expect(result.current.showBell).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('error de la suscripción (p. ej. clave VAPID ausente) ahora se muestra: status error', async () => {
      const subscribe = vi.fn().mockResolvedValue(undefined)
      mockPushSubscription({ subscribe })
      const { result, rerender } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(true))
      await act(async () => {
        await result.current.accept()
      })
      mockPushSubscription({ subscribe, permission: 'granted', error: 'Clave VAPID no configurada' })
      rerender()
      expect(result.current.status).toBe('error')
      expect(result.current.stripVisible).toBe(true)
    })

    it('permiso denegado tras «Activar»: error con blocked, la franja sigue y «Cerrar» (clearAttempt) la quita', async () => {
      const subscribe = vi.fn().mockResolvedValue(undefined)
      mockPushSubscription({ subscribe })
      const { result, rerender } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(true))
      await act(async () => {
        await result.current.accept()
      })
      mockPushSubscription({ subscribe, permission: 'denied', error: 'Permiso de notificaciones denegado' })
      rerender()
      expect(result.current.status).toBe('error')
      expect(result.current.blocked).toBe(true)
      expect(result.current.stripVisible).toBe(true)
      act(() => result.current.clearAttempt())
      expect(result.current.status).toBe('idle')
      expect(result.current.stripVisible).toBe(false)
      expect(result.current.showBell).toBe(false)
    })

    it('«Activar» desde el panel: los estados van al panel (panelActive), no a la franja, y la campana se mantiene aunque el permiso cambie', async () => {
      const subscribe = vi.fn().mockResolvedValue(undefined)
      mockPushSubscription({ subscribe })
      const { result, rerender } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(true))
      act(() => result.current.remindLater())
      await act(async () => {
        await result.current.acceptFromPanel()
      })
      mockPushSubscription({ subscribe, permission: 'denied', error: 'Permiso de notificaciones denegado' })
      rerender()
      expect(result.current.panelActive).toBe(true)
      expect(result.current.stripVisible).toBe(false)
      expect(result.current.showBell).toBe(true)
      expect(result.current.status).toBe('error')
    })

    it('«Más tarde» tras un error limpia el intento', async () => {
      const subscribe = vi.fn().mockRejectedValue(new Error('x'))
      mockPushSubscription({ subscribe })
      const { result } = renderHook(() => usePushOptIn())
      await waitFor(() => expect(result.current.stripVisible).toBe(true))
      await act(async () => {
        await result.current.accept()
      })
      await waitFor(() => expect(result.current.status).toBe('error'))
      act(() => result.current.remindLater())
      expect(result.current.status).toBe('idle')
      expect(result.current.showBell).toBe(true)
    })
  })
})
