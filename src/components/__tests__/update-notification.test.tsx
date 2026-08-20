import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { UpdateNotification } from '@/components/update-notification'

vi.mock('@serwist/turbopack/react', () => ({
  useSerwist: vi.fn(),
}))

import { useSerwist } from '@serwist/turbopack/react'

const mockedUseSerwist = vi.mocked(useSerwist)

function makeFakeSerwist() {
  const listeners = new Map<string, Set<(event: { isUpdate?: boolean }) => void>>()
  return {
    addEventListener: vi.fn((type: string, cb: (event: { isUpdate?: boolean }) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(cb)
    }),
    removeEventListener: vi.fn((type: string, cb: (event: { isUpdate?: boolean }) => void) => {
      listeners.get(type)?.delete(cb)
    }),
    emit(type: string, event: { isUpdate?: boolean }) {
      for (const cb of listeners.get(type) ?? []) cb(event)
    },
  }
}

describe('UpdateNotification', () => {
  let reloadSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('no renderiza nada cuando serwist es null (dev/Playwright)', () => {
    mockedUseSerwist.mockReturnValue({ serwist: null })
    render(<UpdateNotification />)
    expect(screen.queryByTestId('update-notification-button')).not.toBeInTheDocument()
  })

  it('no muestra el banner si activated dispara sin isUpdate (primera instalación)', () => {
    const fakeSerwist = makeFakeSerwist()
    mockedUseSerwist.mockReturnValue({ serwist: fakeSerwist as never })
    render(<UpdateNotification />)
    act(() => fakeSerwist.emit('activated', { isUpdate: false }))
    expect(screen.queryByTestId('update-notification-button')).not.toBeInTheDocument()
  })

  it('muestra el banner cuando activated dispara con isUpdate=true', () => {
    const fakeSerwist = makeFakeSerwist()
    mockedUseSerwist.mockReturnValue({ serwist: fakeSerwist as never })
    render(<UpdateNotification />)
    act(() => fakeSerwist.emit('activated', { isUpdate: true }))
    expect(screen.getByTestId('update-notification-button')).toBeInTheDocument()
    expect(screen.getByText('Actualización disponible')).toBeInTheDocument()
  })

  it('el boton Actualizar recarga la pagina directamente (sin depender de registration.waiting)', () => {
    const fakeSerwist = makeFakeSerwist()
    mockedUseSerwist.mockReturnValue({ serwist: fakeSerwist as never })
    render(<UpdateNotification />)
    act(() => fakeSerwist.emit('activated', { isUpdate: true }))

    fireEvent.click(screen.getByTestId('update-notification-button'))

    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('el boton muestra estado "Actualizando..." y se deshabilita tras el click', () => {
    const fakeSerwist = makeFakeSerwist()
    mockedUseSerwist.mockReturnValue({ serwist: fakeSerwist as never })
    render(<UpdateNotification />)
    act(() => fakeSerwist.emit('activated', { isUpdate: true }))

    const button = screen.getByTestId('update-notification-button')
    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Actualizando')
  })
})
