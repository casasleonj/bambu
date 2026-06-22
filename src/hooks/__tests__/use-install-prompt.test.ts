import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInstallPrompt } from '@/hooks/use-install-prompt'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

function makeBeforeInstallPromptEvent(): BeforeInstallPromptEvent {
  return {
    type: 'beforeinstallprompt',
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    platforms: ['web'],
    preventDefault: vi.fn(),
  } as unknown as BeforeInstallPromptEvent
}

function mockMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: query === '(display-mode: standalone)' ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('useInstallPrompt', () => {
  let listeners: Record<string, EventListenerOrEventListenerObject[]>

  beforeEach(() => {
    listeners = {}
    const storage = new Map<string, string>()

    Object.defineProperty(global, 'window', {
      value: {
        addEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
          listeners[event] = listeners[event] || []
          listeners[event].push(handler)
        }),
        removeEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((h) => h !== handler)
          }
        }),
        matchMedia: mockMatchMedia(false),
        dispatchEvent: vi.fn((event: Event) => {
          const handlers = listeners[event.type] || []
          handlers.forEach((handler) => {
            if (typeof handler === 'function') {
              handler(event)
            } else {
              handler.handleEvent(event)
            }
          })
          return true
        }),
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0',
        platform: 'Linux x86_64',
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const dispatchEvent = (event: Event) => {
    const handlers = listeners[event.type] || []
    handlers.forEach((handler) => {
      if (typeof handler === 'function') {
        handler(event)
      } else {
        handler.handleEvent(event)
      }
    })
  }

  it('inicia sin capacidad de instalación', () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
    expect(result.current.isStandalone).toBe(false)
    expect(result.current.dismissed).toBe(false)
  })

  it('beforeinstallprompt activa canInstall', () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = makeBeforeInstallPromptEvent()

    act(() => {
      dispatchEvent(event as unknown as Event)
    })

    expect(result.current.canInstall).toBe(true)
    expect(result.current.deferredPrompt).toBeTruthy()
  })

  it('appinstalled marca isStandalone', () => {
    const { result } = renderHook(() => useInstallPrompt())

    act(() => {
      dispatchEvent(new Event('appinstalled'))
    })

    expect(result.current.isStandalone).toBe(true)
    expect(result.current.canInstall).toBe(false)
  })

  it('dismiss almacena el estado en localStorage', () => {
    const { result } = renderHook(() => useInstallPrompt())

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.dismissed).toBe(true)
    expect(localStorage.setItem).toHaveBeenCalledWith('pwa-install-banner-dismissed', 'true')
  })

  it('lee dismissed inicial desde localStorage', () => {
    ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('true')

    const { result } = renderHook(() => useInstallPrompt())

    expect(result.current.dismissed).toBe(true)
  })

  it('detecta iOS por userAgent', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        platform: 'iPhone',
      },
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.isIos).toBe(true)
  })

  it('detecta standalone por matchMedia', () => {
    Object.defineProperty(global, 'window', {
      value: {
        addEventListener: window.addEventListener,
        removeEventListener: window.removeEventListener,
        matchMedia: mockMatchMedia(true),
        dispatchEvent: window.dispatchEvent,
      },
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.isStandalone).toBe(true)
  })

  it('install ejecuta prompt y limpia deferredPrompt', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = makeBeforeInstallPromptEvent()

    act(() => {
      dispatchEvent(event as unknown as Event)
    })

    await act(async () => {
      await result.current.install()
    })

    expect(event.prompt).toHaveBeenCalled()
    expect(result.current.deferredPrompt).toBeNull()
  })
})
