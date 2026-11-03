// @tests src/components/push-opt-in-bell.tsx — #595 (campana en el encabezado con panel «Activar»)
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PushOptInBell } from '@/components/push-opt-in-bell'
import type { UsePushOptInReturn } from '@/hooks/use-push-opt-in'

vi.mock('@/components/push-opt-in-provider', () => ({
  usePushOptInContext: vi.fn(),
}))
import { usePushOptInContext } from '@/components/push-opt-in-provider'
const mockedCtx = vi.mocked(usePushOptInContext)

function ctx(over: Partial<UsePushOptInReturn> = {}): UsePushOptInReturn {
  return {
    shouldShow: false,
    stripVisible: false,
    showBell: true,
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

describe('PushOptInBell', () => {
  it('sin proveedor o con showBell false no pinta nada', () => {
    mockedCtx.mockReturnValue(null)
    const a = render(<PushOptInBell />)
    expect(a.container).toBeEmptyDOMElement()
    a.unmount()
    mockedCtx.mockReturnValue(ctx({ showBell: false }))
    const b = render(<PushOptInBell />)
    expect(b.container).toBeEmptyDOMElement()
  })

  it('punto naranja solo si nunca se descartó con «✕»', () => {
    mockedCtx.mockReturnValue(ctx({ bellHasDot: true }))
    const a = render(<PushOptInBell />)
    expect(screen.getByTestId('push-opt-in-bell-dot')).toBeInTheDocument()
    a.unmount()
    mockedCtx.mockReturnValue(ctx({ bellHasDot: false }))
    render(<PushOptInBell />)
    expect(screen.queryByTestId('push-opt-in-bell-dot')).toBeNull()
  })

  it('el panel está cerrado al inicio y se abre/cierra con la campana', () => {
    mockedCtx.mockReturnValue(ctx())
    render(<PushOptInBell />)
    const bell = screen.getByTestId('push-opt-in-bell')
    expect(bell).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('push-opt-in-panel')).toBeNull()
    fireEvent.click(bell)
    expect(screen.getByTestId('push-opt-in-panel')).toBeInTheDocument()
    expect(bell).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(bell)
    expect(screen.queryByTestId('push-opt-in-panel')).toBeNull()
  })

  it('«Activar» del panel llama acceptFromPanel (no accept de la franja)', () => {
    const c = ctx()
    mockedCtx.mockReturnValue(c)
    render(<PushOptInBell />)
    fireEvent.click(screen.getByTestId('push-opt-in-bell'))
    fireEvent.click(screen.getByTestId('push-opt-in-panel-accept'))
    expect(c.acceptFromPanel).toHaveBeenCalledTimes(1)
    expect(c.accept).not.toHaveBeenCalled()
  })

  it('Escape y el click fuera cierran el panel', () => {
    mockedCtx.mockReturnValue(ctx())
    render(<PushOptInBell />)
    fireEvent.click(screen.getByTestId('push-opt-in-bell'))
    fireEvent.keyDown(screen.getByTestId('push-opt-in-panel'), { key: 'Escape' })
    expect(screen.queryByTestId('push-opt-in-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('push-opt-in-bell'))
    fireEvent.click(screen.getByTestId('push-opt-in-bell-backdrop'))
    expect(screen.queryByTestId('push-opt-in-panel')).toBeNull()
  })

  it('el cierre usa un click catcher y no un listener global en document', () => {
    const add = vi.spyOn(document, 'addEventListener')
    mockedCtx.mockReturnValue(ctx())
    render(<PushOptInBell />)
    fireEvent.click(screen.getByTestId('push-opt-in-bell'))
    expect(add.mock.calls.filter(([type]) => type === 'mousedown' || type === 'click')).toHaveLength(0)
    add.mockRestore()
  })

  it('un intento nacido en el panel lo mantiene abierto y muestra «Activando…» con el botón deshabilitado', () => {
    mockedCtx.mockReturnValue(ctx({ status: 'activating', panelActive: true }))
    render(<PushOptInBell />)
    expect(screen.getByTestId('push-opt-in-panel')).toBeInTheDocument()
    expect(screen.getByText('Aceptá el permiso en tu navegador.')).toBeInTheDocument()
    expect(screen.getByTestId('push-opt-in-panel-accept')).toBeDisabled()
  })

  it('éxito en el panel: muestra el «Listo»', () => {
    mockedCtx.mockReturnValue(ctx({ status: 'success', panelActive: true }))
    render(<PushOptInBell />)
    expect(screen.getByText(/Listo: notificaciones activadas/)).toBeInTheDocument()
  })

  it('error en el panel: Reintentar vuelve a llamar acceptFromPanel; «Cerrar» limpia el resultado', () => {
    const c = ctx({ status: 'error', panelActive: true })
    mockedCtx.mockReturnValue(c)
    render(<PushOptInBell />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(c.acceptFromPanel).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('push-opt-in-panel-close'))
    expect(c.clearAttempt).toHaveBeenCalled()
  })

  it('error con el navegador bloqueado: sin Reintentar y con la explicación del candado', () => {
    mockedCtx.mockReturnValue(ctx({ status: 'error', blocked: true, panelActive: true }))
    render(<PushOptInBell />)
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    expect(screen.getByText(/candado de la barra de direcciones/)).toBeInTheDocument()
  })
})
