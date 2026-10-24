import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { UbicacionEntregaInput } from '../ubicacion-entrega-input'

const CORTO = 'https://maps.app.goo.gl/AbC123xyz'

describe('UbicacionEntregaInput — links acortados de Maps (P1-4, #419)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const pegar = (valor: string) => fireEvent.change(screen.getByTestId('workspace-entrega-link'), { target: { value: valor } })

  it('un link corto se resuelve en el servidor y fija la ubicación', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, url: CORTO, coords: { lat: 4.652, lng: -74.054 } }) })
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    render(<UbicacionEntregaInput lat={null} lng={null} onChange={onChange} />)
    pegar(CORTO)
    expect(onChange).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(fetchMock).toHaveBeenCalledWith('/api/geo/expand-maps', expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: CORTO }) }))
    expect(onChange).toHaveBeenCalledWith(4.652, -74.054)
  })

  it('un link corto que no se puede leer avisa y no fija nada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'x' }) }))
    const onChange = vi.fn()
    render(<UbicacionEntregaInput lat={null} lng={null} onChange={onChange} />)
    pegar(CORTO)
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('workspace-entrega-ubicacion-error')).toHaveTextContent(/No se pudo leer ese link/)
  })

  it('sin conexión avisa sin fijar nada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const onChange = vi.fn()
    render(<UbicacionEntregaInput lat={null} lng={null} onChange={onChange} />)
    pegar(CORTO)
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('workspace-entrega-ubicacion-error')).toHaveTextContent(/Sin conexión/)
  })

  it('un link largo no llama al servidor', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    render(<UbicacionEntregaInput lat={null} lng={null} onChange={onChange} />)
    pegar('https://www.google.com/maps?q=4.6520,-74.0540')
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(onChange).toHaveBeenCalledWith(4.652, -74.054)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un host que no es de Maps no se manda al servidor', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<UbicacionEntregaInput lat={null} lng={null} onChange={vi.fn()} />)
    pegar('https://evil.example.com/maps.app.goo.gl/x')
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('workspace-entrega-ubicacion-error')).toBeInTheDocument()
  })

  it('no ofrece el GPS de quien digita: solo el campo del link (#459)', () => {
    const getCurrentPosition = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    render(<UbicacionEntregaInput lat={null} lng={null} onChange={vi.fn()} />)
    expect(screen.queryByTestId('workspace-entrega-usar-ubicacion')).not.toBeInTheDocument()
    expect(screen.queryByText(/Usar mi ubicación/i)).not.toBeInTheDocument()
    const campo = screen.getByTestId('workspace-entrega-link')
    expect(campo).toHaveAttribute('placeholder', 'Pega el link de ubicación que te mandó el cliente')
    expect(campo.className).toContain('w-full')
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('los errores hablan solo del link o de la dirección, nunca de «tu ubicación» (#459)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    const { unmount } = render(<UbicacionEntregaInput lat={null} lng={null} onChange={vi.fn()} />)
    pegar('hola')
    expect(screen.getByTestId('workspace-entrega-ubicacion-error').textContent).not.toMatch(/tu ubicaci/i)
    pegar(CORTO)
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(screen.getByTestId('workspace-entrega-ubicacion-error').textContent).not.toMatch(/tu ubicaci/i)
    unmount()
  })
})
