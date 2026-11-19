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
let clickSpy: ReturnType<typeof vi.spyOn>

describe('CompartirWhatsapp', () => {
  beforeEach(() => {
    vi.clearAllMocks() // los avisos (toast) no deben depender del orden de las pruebas
    fetchMock = vi.fn(async (url: string) => (String(url).includes('/pdf') ? pdfOk() : new Response('{"success":true}')))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:prueba'), revokeObjectURL: vi.fn() }))
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
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

  describe('menú de compartir del sistema con el PDF (#877)', () => {
    let share: ReturnType<typeof vi.fn>
    const conMenuDelSistema = (canShare: () => boolean = () => true) => {
      share = vi.fn(async () => undefined)
      vi.stubGlobal('navigator', { ...navigator, canShare, share })
    }
    const prepararPdf = async (extra: Partial<typeof props> = {}) => {
      render(<CompartirWhatsapp {...props} {...extra} />)
      fireEvent.click(screen.getByTestId('btn-compartir-whatsapp'))
      fireEvent.click(screen.getByTestId('compartir-generar'))
      await screen.findByTestId('compartir-listo')
    }

    it('es el camino principal: «Compartir PDF» abre el menú con el archivo y no se descarga solo ni se ofrece el enlace de chat', async () => {
      conMenuDelSistema()
      await prepararPdf()
      expect(screen.getByTestId('compartir-listo-sistema').textContent).toContain('elige WhatsApp u otra app')
      expect(screen.queryByTestId('compartir-abrir-whatsapp')).toBeNull()
      expect(clickSpy).not.toHaveBeenCalled() // sin descarga automática
      fireEvent.click(screen.getByTestId('compartir-archivo'))
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
      const datos = share.mock.calls[0][0] as { files: File[]; title: string; text: string }
      expect(datos.files).toHaveLength(1)
      expect(datos.files[0].name).toBe('Resumen-Cliente-Ejemplo-20261117.pdf')
      expect(datos.files[0].type).toBe('application/pdf')
      expect(datos.title).toBe('Resumen de cuenta')
      expect(datos.text).toContain('Saldo a pagar')
    })

    it('la confirmación explica el menú y no exige teléfono: la persona elige el chat', async () => {
      conMenuDelSistema()
      render(<CompartirWhatsapp {...props} telefono="123" />)
      fireEvent.click(screen.getByTestId('btn-compartir-whatsapp'))
      const c = screen.getByTestId('compartir-confirmar')
      expect(screen.queryByTestId('compartir-sin-telefono')).toBeNull()
      expect(c.textContent).toContain('elegirás con qué app compartirlo')
      expect(c.textContent).not.toContain('WhatsApp: ')
    })

    it('cerrar el menú sin elegir no es un error: no descarga ni avisa', async () => {
      conMenuDelSistema()
      await prepararPdf()
      share.mockRejectedValueOnce(new DOMException('cancelado', 'AbortError'))
      fireEvent.click(screen.getByTestId('compartir-archivo'))
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
      const { toast } = await import('sonner')
      expect(toast.error).not.toHaveBeenCalled()
      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('si el sistema rechaza compartir, descarga el PDF, avisa y pasa al respaldo', async () => {
      conMenuDelSistema()
      await prepararPdf()
      share.mockRejectedValueOnce(new DOMException('sin gesto', 'NotAllowedError'))
      fireEvent.click(screen.getByTestId('compartir-archivo'))
      await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
      const { toast } = await import('sonner')
      expect(toast.error).toHaveBeenCalled()
      expect(await screen.findByTestId('compartir-listo-respaldo')).toBeTruthy()
    })

    it('si el archivo real no se puede compartir, usa el respaldo (descarga y chat)', async () => {
      let llamadas = 0
      conMenuDelSistema(() => ++llamadas === 1) // sí con el archivo de prueba, no con el real
      await prepararPdf()
      expect(screen.getByTestId('compartir-listo-respaldo')).toBeTruthy()
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('compartir-abrir-whatsapp')).toBeTruthy()
    })
  })

  it('sin menú del sistema (respaldo): descarga el PDF y ofrece abrir el chat, avisando que solo viaja el mensaje', async () => {
    render(<CompartirWhatsapp {...props} />)
    fireEvent.click(screen.getByTestId('btn-compartir-whatsapp'))
    expect(screen.getByTestId('compartir-confirmar').textContent).toContain('solo viaja el mensaje')
    fireEvent.click(screen.getByTestId('compartir-generar'))
    await screen.findByTestId('compartir-listo')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('compartir-listo-respaldo').textContent).toContain('solo viaja el mensaje')
    expect(screen.queryByTestId('compartir-archivo')).toBeNull()
    expect(screen.getByTestId('compartir-abrir-whatsapp')).toBeTruthy()
  })
})
