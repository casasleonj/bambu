// @tests src/components/push-opt-in-strip.tsx — #595 (franja bajo el encabezado, ya no flota sobre los botones)
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PushOptInStrip } from '@/components/push-opt-in-strip'
import type { UsePushOptInReturn } from '@/hooks/use-push-opt-in'

vi.mock('@/components/push-opt-in-provider', () => ({
  usePushOptInContext: vi.fn(),
}))
import { usePushOptInContext } from '@/components/push-opt-in-provider'
const mockedCtx = vi.mocked(usePushOptInContext)

function ctx(over: Partial<UsePushOptInReturn> = {}): UsePushOptInReturn {
  return {
    shouldShow: true,
    stripVisible: true,
    showBell: false,
    bellHasDot: true,
    status: 'idle',
    blocked: false,
    panelActive: false,
    clearAttempt: vi.fn(),
    accept: vi.fn(),
    acceptFromPanel: vi.fn(),
    dismiss: vi.fn(),
    remindLater: vi.fn(),
    loading: false,
    error: null,
    ...over,
  }
}

describe('PushOptInStrip', () => {
  it('sin proveedor no pinta nada', () => {
    mockedCtx.mockReturnValue(null)
    const { container } = render(<PushOptInStrip />)
    expect(container).toBeEmptyDOMElement()
  })

  it('no pinta cuando stripVisible es false', () => {
    mockedCtx.mockReturnValue(ctx({ stripVisible: false }))
    render(<PushOptInStrip />)
    expect(screen.queryByTestId('push-opt-in-strip')).not.toBeInTheDocument()
  })

  it('no es una capa flotante: va en el flujo, sin position fixed', () => {
    mockedCtx.mockReturnValue(ctx())
    render(<PushOptInStrip />)
    const strip = screen.getByTestId('push-opt-in-strip')
    expect(strip.className).not.toMatch(/\bfixed\b|\babsolute\b/)
  })

  it('idle: muestra el texto y los tres botones, cada uno llama a lo suyo', () => {
    const c = ctx()
    mockedCtx.mockReturnValue(c)
    render(<PushOptInStrip />)
    expect(screen.getByText('Recibí alertas al instante')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }))
    fireEvent.click(screen.getByRole('button', { name: 'No volver a mostrar' }))
    expect(c.accept).toHaveBeenCalledTimes(1)
    expect(c.remindLater).toHaveBeenCalledTimes(1)
    expect(c.dismiss).toHaveBeenCalledTimes(1)
  })

  it('activando: botón deshabilitado y mensaje de espera', () => {
    mockedCtx.mockReturnValue(ctx({ status: 'activating' }))
    render(<PushOptInStrip />)
    expect(screen.getByText('Aceptá el permiso en tu navegador.')).toBeInTheDocument()
    expect(screen.getByTestId('push-opt-in-accept')).toBeDisabled()
  })

  it('éxito: muestra el «Listo» sin botones', () => {
    mockedCtx.mockReturnValue(ctx({ status: 'success', shouldShow: false }))
    render(<PushOptInStrip />)
    expect(screen.getByText(/Listo: notificaciones activadas/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('error: ofrece Reintentar y «Más tarde» (cierra por la sesión)', () => {
    const c = ctx({ status: 'error' })
    mockedCtx.mockReturnValue(c)
    render(<PushOptInStrip />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron activar')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }))
    expect(c.accept).toHaveBeenCalledTimes(1)
    expect(c.remindLater).toHaveBeenCalledTimes(1)
  })

  it('error con el navegador bloqueado: sin Reintentar, explica el candado y «Cerrar» solo cierra el resultado', () => {
    const c = ctx({ status: 'error', blocked: true, shouldShow: false })
    mockedCtx.mockReturnValue(c)
    render(<PushOptInStrip />)
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    expect(screen.getByText(/candado de la barra de direcciones/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(c.clearAttempt).toHaveBeenCalledTimes(1)
    expect(c.remindLater).not.toHaveBeenCalled()
  })
})
