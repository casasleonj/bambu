import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { InAppPushListener } from '@/components/in-app-push-listener'

vi.mock('sonner', () => ({
  toast: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { toast } from 'sonner'

describe('InAppPushListener', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, 'hasFocus', {
      value: vi.fn(() => true),
      writable: true,
    })
  })

  it('no rompe si serviceWorker no esta soportado', () => {
    const sw = navigator.serviceWorker
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, writable: true })
    render(<InAppPushListener />)
    expect(toast).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, writable: true })
  })

  it('muestra toast al recibir mensaje in-app-alert con foco', async () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({}),
        addEventListener,
        removeEventListener,
      },
      writable: true,
    })
    render(<InAppPushListener />)
    await new Promise((r) => setTimeout(r, 10))
    const handler = addEventListener.mock.calls.find((c) => c[0] === 'message')?.[1] as (
      event: MessageEvent,
    ) => void
    expect(handler).toBeDefined()
    handler({
      data: {
        type: 'in-app-alert',
        payload: { title: 'Alerta', body: 'Cuerpo', url: '/casos/1' },
      },
    } as MessageEvent)
    expect(toast).toHaveBeenCalledWith('Alerta', expect.objectContaining({ description: 'Cuerpo' }))
  })

  it('ignora mensajes sin type in-app-alert', async () => {
    const addEventListener = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({}),
        addEventListener,
        removeEventListener: vi.fn(),
      },
      writable: true,
    })
    render(<InAppPushListener />)
    await new Promise((r) => setTimeout(r, 10))
    const handler = addEventListener.mock.calls.find((c) => c[0] === 'message')?.[1] as (
      event: MessageEvent,
    ) => void
    handler({ data: { type: 'other', payload: {} } } as MessageEvent)
    expect(toast).not.toHaveBeenCalled()
  })

  it('no muestra toast si el tab no tiene foco', async () => {
    const addEventListener = vi.fn()
    Object.defineProperty(document, 'hasFocus', { value: vi.fn(() => false), writable: true })
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({}),
        addEventListener,
        removeEventListener: vi.fn(),
      },
      writable: true,
    })
    render(<InAppPushListener />)
    await new Promise((r) => setTimeout(r, 10))
    const handler = addEventListener.mock.calls.find((c) => c[0] === 'message')?.[1] as (
      event: MessageEvent,
    ) => void
    handler({
      data: {
        type: 'in-app-alert',
        payload: { title: 'Alerta', body: 'Cuerpo' },
      },
    } as MessageEvent)
    expect(toast).not.toHaveBeenCalled()
  })
})
