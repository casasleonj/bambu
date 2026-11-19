// @tests CompartirWhatsapp — compartir el resumen de facturas por WhatsApp como PDF (#845)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CompartirWhatsapp } from '../compartir-whatsapp'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const props = {
  clienteId: 'c1',
  clienteNombre: 'Cliente Ejemplo',
  telefono: '300 000 0000',
  estado: 'TODAS' as const,
  desde: '2026-11-01',
  hasta: '2026-11-17',
  facturas: 3,
  saldo: 105_000,
}

const pdfOk = () =>
  new Response(new Blob(['%PDF-1.7 prueba'], { type: 'application/pdf' }), {
    status: 200,
    headers: { 'content-disposition': 'attachment; filename="Resumen-Cliente-Ejemplo-20261117.pdf"' },
  })

let fetchMock: ReturnType<typeof vi.fn>

describe('CompartirWhatsapp', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => (String(url).includes('/pdf') ? pdfOk() : new Response('{"success":true}')))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:prueba'), revokeObjectURL: vi.fn() }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('se deshabilita con la pestaña Anuladas y cuando no hay facturas', () => {
    const { rerender } = render(<CompartirWhatsapp {...props} estado="ANULADA" />)
    expect((screen.getByTestId('btn-compartir-whatsapp') as HTMLButtonElement).disabled).toBe(true)
    rerender(<CompartirWhatsapp {...props} facturas={0} />)
    expect((screen.getByTestId('btn-compartir-whatsapp') as HTMLButtonElement).disabled).toBe(true)
    rerender(<CompartirWhatsapp {...props} />)
    expect((screen.getByTestId('btn-compartir-whatsapp') as HTMLButtonElement).disabled).toBe(false)
  })

  it('pide confirmación mostrando a quién se escribe y qué incluye', () => {
    render(<CompartirWhatsapp {...props} />)
    fireEvent.click(screen.getByTestId('btn-compartir-whatsapp'))
    const c = screen.getByTestId('compartir-confirmar')
    expect(c.textContent).toContain('Cliente Ejemplo')
    expect(c.textContent).toContain('300 000 0000')
    expect(c.textContent).toContain('3 facturas')
    expect(c.textContent).toContain('facturas anuladas')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('genera el PDF con el filtro elegido, ofrece abrir el chat y anota el envío preparado una sola vez', async () => {
    render(<CompartirWhatsapp {...props} estado="PARCIAL" />)
    fireEvent.click(screen.getByTestId('btn-compartir-whatsapp'))
    fireEvent.click(screen.getByTestId('compartir-generar'))
    await screen.findByTestId('compartir-listo')

    const [pdfUrl] = fetchMock.mock.calls[0] as [string]
    expect(pdfUrl).toBe('/api/clientes/c1/resumen-facturas/pdf?estado=PARCIAL&desde=2026-11-01&hasta=2026-11-17')

    const link = screen.getByTestId('compartir-abrir-whatsapp') as HTMLAnchorElement
    expect(link.href.startsWith('https://wa.me/573000000000?text=')).toBe(true)
    expect(decodeURIComponent(link.href)).toContain('Saldo a pagar')
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [logUrl, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(logUrl).toBe('/api/clientes/c1/resumen-facturas/compartir')
    expect(JSON.parse(String(init.body))).toMatchObject({ canal: 'whatsapp', estado: 'PARCIAL', facturas: 3 })
    expect(screen.getByTestId('compartir-listo').textContent).toContain('No sabemos si se envió')
  })

  it('un doble clic en «Generar» pide un solo PDF', async () => {
    render(<CompartirWhatsapp {...props} />)
    fireEvent.click(screen.getByTestId('btn-compartir-whatsapp'))
    const generar = screen.getByTestId('compartir-generar')
    fireEvent.click(generar)
    fireEvent.click(generar)
    await screen.findByTestId('compartir-listo')
    const pdfCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/pdf'))
    expect(pdfCalls).toHaveLength(1)
  })

  it('si el servidor falla muestra el error, no anota nada y permite reintentar', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('{"error":{"message":"No se pudo generar el PDF"}}', { status: 500 }))
    render(<CompartirWhatsapp {...props} />)
    fireEvent.click(screen.getByTestId('btn-compartir-whatsapp'))
    fireEvent.click(screen.getByTestId('compartir-generar'))
    const err = await screen.findByTestId('compartir-error')
    expect(err.textContent).toContain('No se envió nada')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Reintentar'))
    expect(screen.getByTestId('compartir-confirmar')).toBeTruthy()
    fireEvent.click(screen.getByTestId('compartir-generar'))
    await screen.findByTestId('compartir-listo')
  })

  it('sin teléfono válido no ofrece ningún chat; solo descarga el PDF sin anotar envío', async () => {
    render(<CompartirWhatsapp {...props} telefono="123" />)
    fireEvent.click(screen.getByTestId('btn-compartir-whatsapp'))
    expect(screen.getByTestId('compartir-sin-telefono')).toBeTruthy()
    expect(screen.queryByTestId('compartir-abrir-whatsapp')).toBeNull()
    fireEvent.click(screen.getByTestId('compartir-solo-descargar'))
    await waitFor(() => expect(screen.queryByTestId('compartir-sin-telefono')).toBeNull())
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes('/compartir'))).toBe(true)
  })

  it('ofrece el menú de compartir del sistema solo si el navegador puede compartir archivos', async () => {
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: vi.fn(async () => undefined) })
    render(<CompartirWhatsapp {...props} />)
    fireEvent.click(screen.getByTestId('btn-compartir-whatsapp'))
    fireEvent.click(screen.getByTestId('compartir-generar'))
    await screen.findByTestId('compartir-archivo')
    fireEvent.click(screen.getByTestId('compartir-archivo'))
    await waitFor(() => expect((navigator.share as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1))
  })
})
