import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PushOptInToast } from '@/components/push-opt-in-toast'

vi.mock('@/hooks/use-push-opt-in', () => ({
  usePushOptIn: vi.fn(),
}))

import { usePushOptIn } from '@/hooks/use-push-opt-in'

const mockedUsePushOptIn = vi.mocked(usePushOptIn)

describe('PushOptInToast', () => {
  it('renderiza cuando shouldShow es true', () => {
    mockedUsePushOptIn.mockReturnValue({
      shouldShow: true,
      accept: vi.fn(),
      dismiss: vi.fn(),
      loading: false,
      error: null,
    })
    render(<PushOptInToast />)
    expect(screen.getByTestId('push-opt-in-toast')).toBeInTheDocument()
    expect(screen.getByText('Activar')).toBeInTheDocument()
  })

  it('no renderiza cuando shouldShow es false', () => {
    mockedUsePushOptIn.mockReturnValue({
      shouldShow: false,
      accept: vi.fn(),
      dismiss: vi.fn(),
      loading: false,
      error: null,
    })
    render(<PushOptInToast />)
    expect(screen.queryByTestId('push-opt-in-toast')).not.toBeInTheDocument()
  })

  it('llama accept al hacer clic en Activar', () => {
    const accept = vi.fn()
    mockedUsePushOptIn.mockReturnValue({
      shouldShow: true,
      accept,
      dismiss: vi.fn(),
      loading: false,
      error: null,
    })
    render(<PushOptInToast />)
    fireEvent.click(screen.getByTestId('push-opt-in-accept'))
    expect(accept).toHaveBeenCalled()
  })

  it('llama dismiss al hacer clic en Mas tarde', () => {
    const dismiss = vi.fn()
    mockedUsePushOptIn.mockReturnValue({
      shouldShow: true,
      accept: vi.fn(),
      dismiss,
      loading: false,
      error: null,
    })
    render(<PushOptInToast />)
    fireEvent.click(screen.getByText('Más tarde'))
    expect(dismiss).toHaveBeenCalled()
  })

  it('deshabilita el boton y muestra texto de carga cuando loading es true', () => {
    mockedUsePushOptIn.mockReturnValue({
      shouldShow: true,
      accept: vi.fn(),
      dismiss: vi.fn(),
      loading: true,
      error: null,
    })
    render(<PushOptInToast />)
    const button = screen.getByTestId('push-opt-in-accept')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Activando...')
  })

  it('muestra mensaje de error', () => {
    mockedUsePushOptIn.mockReturnValue({
      shouldShow: true,
      accept: vi.fn(),
      dismiss: vi.fn(),
      loading: false,
      error: 'Error de conexión',
    })
    render(<PushOptInToast />)
    expect(screen.getByText('Error de conexión')).toBeInTheDocument()
  })
})
