import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePushSubscription } from '@/hooks/use-push-subscription'

function makeSubscription(overrides?: Partial<PushSubscription>): PushSubscription {
  const sub = {
    endpoint: 'https://push.example.com/sub-1',
    toJSON: () => ({
      endpoint: 'https://push.example.com/sub-1',
      keys: { p256dh: 'p256dh-1', auth: 'auth-1' },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription
  return { ...sub, ...overrides } as PushSubscription
}

function makeRegistration(subscription: PushSubscription | null) {
  return {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(subscription),
      subscribe: vi.fn().mockResolvedValue(subscription),
    },
  }
}

describe('usePushSubscription', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let requestPermissionMock: ReturnType<typeof vi.fn>
  let registration: ReturnType<typeof makeRegistration>

  beforeEach(() => {
    fetchMock = vi.fn()
    requestPermissionMock = vi.fn()
    registration = makeRegistration(null)

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve(registration),
      },
    })
    vi.stubGlobal('Notification', {
      permission: 'default' as NotificationPermission,
      requestPermission: requestPermissionMock,
    })

    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BTestPublicKey'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  })

  it('detecta cuando push no está soportado', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('navigator', { serviceWorker: {} })
    vi.stubGlobal('Notification', { permission: 'default' })
    // Sin PushManager en window

    const { result } = renderHook(() => usePushSubscription())

    expect(result.current.supported).toBe(false)
    expect(result.current.permission).toBe('unknown')
  })

  it('lee el permiso y la suscripción activa al montar', async () => {
    const sub = makeSubscription()
    registration.pushManager.getSubscription.mockResolvedValue(sub)

    const { result } = renderHook(() => usePushSubscription())

    expect(result.current.supported).toBe(true)
    expect(result.current.permission).toBe('default')

    await waitFor(() => {
      expect(result.current.subscribed).toBe(true)
    })
  })

  it('subscribe: solicita permiso, se suscribe y registra en el backend', async () => {
    const sub = makeSubscription()
    requestPermissionMock.mockResolvedValue('granted')
    registration.pushManager.subscribe.mockResolvedValue(sub)
    fetchMock.mockResolvedValue({ ok: true } as Response)

    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.subscribe()
    })

    expect(requestPermissionMock).toHaveBeenCalled()
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('https://push.example.com/sub-1'),
      }),
    )
    expect(result.current.subscribed).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('subscribe: obtiene la clave VAPID del endpoint si no hay env var', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const sub = makeSubscription()
    requestPermissionMock.mockResolvedValue('granted')
    registration.pushManager.subscribe.mockResolvedValue(sub)
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: 'BFromApi' }) } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)

    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.subscribe()
    })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/push/vapid-public-key')
    expect(result.current.subscribed).toBe(true)
  })

  it('subscribe: reporta error si el permiso es denegado', async () => {
    requestPermissionMock.mockResolvedValue('denied')

    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.subscribe()
    })

    expect(result.current.permission).toBe('denied')
    expect(result.current.error).toContain('denegado')
    expect(result.current.subscribed).toBe(false)
  })

  it('subscribe: reporta error si no hay clave VAPID disponible', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    requestPermissionMock.mockResolvedValue('granted')
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ publicKey: null }) } as Response)

    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.subscribe()
    })

    expect(result.current.error).toContain('Clave VAPID')
    expect(result.current.subscribed).toBe(false)
  })

  it('subscribe: reporta error si el backend rechaza el registro', async () => {
    const sub = makeSubscription()
    requestPermissionMock.mockResolvedValue('granted')
    registration.pushManager.subscribe.mockResolvedValue(sub)
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal error' } as Response)

    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.subscribe()
    })

    expect(result.current.error).toContain('500')
    expect(result.current.subscribed).toBe(false)
  })

  it('unsubscribe: elimina la suscripción del navegador y del backend', async () => {
    const sub = makeSubscription()
    registration.pushManager.getSubscription.mockResolvedValue(sub)
    fetchMock.mockResolvedValue({ ok: true } as Response)

    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.unsubscribe()
    })

    expect(sub.unsubscribe).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/push/unsubscribe',
      expect.objectContaining({
        method: 'DELETE',
        body: expect.stringContaining('https://push.example.com/sub-1'),
      }),
    )
    expect(result.current.subscribed).toBe(false)
  })

  it('subscribe: timeout en el backend desbloquea el boton y muestra error', async () => {
    const sub = makeSubscription()
    requestPermissionMock.mockResolvedValue('granted')
    registration.pushManager.subscribe.mockResolvedValue(sub)
    // fetch nunca resuelve por si solo, pero respeta el AbortSignal del timeout.
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => {
      return new Promise<never>((_, reject) => {
        const signal = init?.signal
        if (signal?.aborted) {
          reject(new DOMException('La conexion tardo demasiado', 'TimeoutError'))
          return
        }
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('La conexion tardo demasiado', 'TimeoutError')),
          { once: true },
        )
      })
    })

    vi.useFakeTimers({ shouldAdvanceTime: false })

    const { result } = renderHook(() => usePushSubscription())

    // Iniciamos subscribe sin esperar a que termine.
    act(() => {
      void result.current.subscribe()
    })

    // Flush de microtareas para que requestPermission resuelva y loading pase a true.
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.loading).toBe(true)

    // Avanzamos el timeout de fetchWithTimeout (10s).
    act(() => {
      vi.advanceTimersByTime(10_001)
    })

    // Flush de microtareas para que el catch actualice el estado.
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('La conexion tardo demasiado. Intenta de nuevo.')
    expect(result.current.subscribed).toBe(false)
  })

  it('auto-recovery: falla silenciosamente sin mostrar error al usuario', async () => {
    vi.stubGlobal('Notification', {
      permission: 'granted' as NotificationPermission,
      requestPermission: requestPermissionMock,
    })

    // No hay suscripcion activa, el auto-recovery intenta suscribirse y falla.
    registration.pushManager.getSubscription.mockResolvedValue(null)
    registration.pushManager.subscribe.mockRejectedValue(new Error('Push service unavailable'))

    const { result } = renderHook(() => usePushSubscription())

    // Esperamos a que el auto-recovery termine (setRecovering(false)).
    await waitFor(() => expect(result.current.recovering).toBe(false), { timeout: 1000 })

    // El error del auto-recovery NO se muestra al usuario.
    expect(result.current.error).toBeNull()
    expect(result.current.subscribed).toBe(false)
  })

  it('cleanup: aborta la operacion en curso al desmontar', async () => {
    const sub = makeSubscription()
    requestPermissionMock.mockResolvedValue('granted')
    registration.pushManager.subscribe.mockResolvedValue(sub)
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => {
      return new Promise<never>((_, reject) => {
        const signal = init?.signal
        if (signal?.aborted) {
          reject(new DOMException('La conexion tardo demasiado', 'TimeoutError'))
          return
        }
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('La conexion tardo demasiado', 'TimeoutError')),
          { once: true },
        )
      })
    })

    vi.useFakeTimers({ shouldAdvanceTime: false })

    const { result, unmount } = renderHook(() => usePushSubscription())

    act(() => {
      void result.current.subscribe()
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.loading).toBe(true)

    // Al desmontar, abortamos la operacion en curso. No debe lanzar errores.
    unmount()

    act(() => {
      vi.advanceTimersByTime(20_000)
    })

    await act(async () => {
      await Promise.resolve()
    })
  })
})
