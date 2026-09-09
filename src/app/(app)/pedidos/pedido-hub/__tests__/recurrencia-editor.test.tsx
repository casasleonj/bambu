import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: vi.fn() }))
import { fetchResilient } from '@/lib/fetch-resilient'
import { RecurrenciaEditor } from '../recurrencia-editor'

const frMock = vi.mocked(fetchResilient)

const rec = (over: Record<string, unknown> = {}) => ({
  id: 'r1', cadaNDias: 7, canal: 'DOMICILIO', activo: true, proximaFecha: null,
  productos: [{ producto: 'PACA_AGUA', cantidad: 20 }, { producto: 'BOTELLON', cantidad: 4 }],
  ...over,
})

beforeEach(() => frMock.mockReset())

describe('RecurrenciaEditor (F8-iii)', () => {
  it('precarga frecuencia y cantidades; nunca dice "plantilla"', () => {
    render(<RecurrenciaEditor recurrencia={rec()} onCancel={vi.fn()} onGuardado={vi.fn()} />)
    expect((screen.getByTestId('recurrencia-editor-cada') as HTMLInputElement).value).toBe('7')
    expect((screen.getByTestId('recurrencia-editor-pacaAgua') as HTMLInputElement).value).toBe('20')
    expect((screen.getByTestId('recurrencia-editor-botellon') as HTMLInputElement).value).toBe('4')
    expect(screen.getByTestId('recurrencia-editor')).not.toHaveTextContent(/plantilla/i)
  })

  it('guardar → PUT /api/recurrentes?id= con cadaNDias + productos camelCase', async () => {
    frMock.mockResolvedValue({ status: 'ok', statusCode: 200, data: { success: true } })
    const onGuardado = vi.fn()
    render(<RecurrenciaEditor recurrencia={rec()} onCancel={vi.fn()} onGuardado={onGuardado} />)
    fireEvent.change(screen.getByTestId('recurrencia-editor-cada'), { target: { value: '14' } })
    fireEvent.click(screen.getByTestId('recurrencia-editor-guardar'))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(frMock.mock.calls[0][0]).toBe('/api/recurrentes?id=r1')
    expect(frMock.mock.calls[0][1]?.method).toBe('PUT')
    const body = frMock.mock.calls[0][1]?.body as Record<string, unknown>
    expect(body.cadaNDias).toBe(14)
    expect(body.productos).toEqual({ pacaAgua: 20, pacaHielo: 0, botellon: 4, bolsaAgua: 0, bolsaHielo: 0 })
  })

  it('mínimo 3 productos: por debajo → aviso + guardar deshabilitado', () => {
    render(<RecurrenciaEditor recurrencia={rec({ productos: [{ producto: 'PACA_AGUA', cantidad: 2 }] })} onCancel={vi.fn()} onGuardado={vi.fn()} />)
    expect(screen.getByTestId('recurrencia-editor-min')).toBeInTheDocument()
    expect(screen.getByTestId('recurrencia-editor-guardar')).toBeDisabled()
  })

  it('Pausar → PUT { activo: false }', async () => {
    frMock.mockResolvedValue({ status: 'ok', statusCode: 200, data: { success: true } })
    const onGuardado = vi.fn()
    render(<RecurrenciaEditor recurrencia={rec({ activo: true })} onCancel={vi.fn()} onGuardado={onGuardado} />)
    fireEvent.click(screen.getByTestId('recurrencia-editor-pausa'))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect((frMock.mock.calls[0][1]?.body as Record<string, unknown>).activo).toBe(false)
  })

  it('pausada → botón dice "Reactivar" y manda activo:true', async () => {
    frMock.mockResolvedValue({ status: 'ok', statusCode: 200, data: { success: true } })
    render(<RecurrenciaEditor recurrencia={rec({ activo: false })} onCancel={vi.fn()} onGuardado={vi.fn()} />)
    expect(screen.getByTestId('recurrencia-editor-pausa')).toHaveTextContent('Reactivar')
    fireEvent.click(screen.getByTestId('recurrencia-editor-pausa'))
    await waitFor(() => expect((frMock.mock.calls[0][1]?.body as Record<string, unknown>).activo).toBe(true))
  })

  it('409 (modificada por otro) → mensaje de recargar, NO reintenta solo', async () => {
    frMock.mockResolvedValue({ status: 'error', statusCode: 409, error: 'La plantilla fue modificada por otro usuario' })
    render(<RecurrenciaEditor recurrencia={rec()} onCancel={vi.fn()} onGuardado={vi.fn()} />)
    fireEvent.click(screen.getByTestId('recurrencia-editor-guardar'))
    await waitFor(() => expect(screen.getByTestId('recurrencia-editor-error')).toHaveTextContent(/cambió en otra sesión/i))
    expect(frMock).toHaveBeenCalledTimes(1)
  })

  it('offline → onGuardado (encolado)', async () => {
    frMock.mockResolvedValue({ status: 'offline', localId: 'x', reason: 'network' })
    const onGuardado = vi.fn()
    render(<RecurrenciaEditor recurrencia={rec()} onCancel={vi.fn()} onGuardado={onGuardado} />)
    fireEvent.click(screen.getByTestId('recurrencia-editor-guardar'))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
  })
})
