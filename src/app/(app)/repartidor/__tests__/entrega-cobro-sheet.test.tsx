// @tests #318 — hoja «Entregado» del repartidor: cobro + foto + GPS automático.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const fetchResilient = vi.fn()
vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: (...a: unknown[]) => fetchResilient(...a) }))
const capturarGps = vi.fn()
vi.mock('@/lib/gps-silencioso', () => ({ capturarGpsSilencioso: (...a: unknown[]) => capturarGps(...a) }))
vi.mock('@/lib/image-compress', () => ({ compressImage: vi.fn(async () => 'data:image/jpeg;base64,AAAA') }))
const toastWarning = vi.fn()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: (...a: unknown[]) => toastWarning(...a) } }))
vi.mock('next/image', () => ({ default: (p: { alt: string }) => <span>{p.alt}</span> }))

import { EntregaCobroSheet, type PedidoParaEntregar } from '../entrega-cobro-sheet'

const PEDIDO: PedidoParaEntregar = {
  id: 'p1', numero: 7, clienteId: 'c1', nombre: 'Doña Marta', saldo: 100_000, promesaPagoFecha: null,
  items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 0 }],
}
const EMB = { id: 'e1', estado: 'EN_RUTA' }

function abrir(over: Partial<PedidoParaEntregar> = {}, props: Record<string, unknown> = {}) {
  const onDone = vi.fn()
  const onClose = vi.fn()
  render(<EntregaCobroSheet pedido={{ ...PEDIDO, ...over }} embarque={EMB} onClose={onClose} onDone={onDone} {...props} />)
  return { onDone, onClose }
}

async function tomarFoto() {
  const input = screen.getByTestId('entrega-foto-input') as HTMLInputElement
  const file = new File(['x'], 'f.jpg', { type: 'image/jpeg' })
  fireEvent.change(input, { target: { files: [file] } })
  await waitFor(() => expect(screen.getByTestId('entrega-foto-btn').textContent).toContain('Foto lista'))
}

beforeEach(() => {
  vi.clearAllMocks()
  capturarGps.mockResolvedValue({ lat: 6.2, lng: -75.5, accuracy: 10 })
  fetchResilient.mockResolvedValue({ status: 'ok', statusCode: 200, data: { success: true } })
})

describe('EntregaCobroSheet (#318)', () => {
  it('cobro completo: monto sugerido = saldo; con foto, un toque envía entrega + cobro + GPS al embarque de la ruta', async () => {
    const { onDone } = abrir()
    expect((screen.getByTestId('cobro-monto') as HTMLInputElement).value).toBe('100000')
    const boton = screen.getByTestId('entrega-confirmar') as HTMLButtonElement
    await waitFor(() => expect(screen.getByTestId('entrega-gps-estado').textContent).toContain('Ubicación lista'))
    expect(boton.disabled).toBe(true) // falta la foto
    await tomarFoto()
    expect(boton.disabled).toBe(false)
    fireEvent.click(boton)
    await waitFor(() => expect(fetchResilient).toHaveBeenCalledTimes(1))
    const [url, opts] = fetchResilient.mock.calls[0] as [string, { body: Record<string, unknown> }]
    expect(url).toBe('/api/pedidos/p1/entrega')
    expect(opts.body).toMatchObject({
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 100_000 }],
      embarqueId: 'e1', embarqueEntregaId: 'e1', gpsLat: 6.2, gpsLng: -75.5,
    })
    expect(typeof opts.body.offlineId).toBe('string')
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ pedidoId: 'p1', offline: false }))
  })

  it('cobro parcial SIN deuda aceptada: bloquea la entrega y ofrece «No entregar»', async () => {
    abrir()
    fireEvent.change(screen.getByTestId('cobro-monto'), { target: { value: '60000' } })
    await waitFor(() => expect(screen.getByTestId('entrega-gps-estado').textContent).toContain('lista'))
    await tomarFoto()
    expect((screen.getByTestId('entrega-confirmar') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('cobro-mensaje').textContent).toContain('no autorizó')
    expect(screen.getByTestId('entrega-no-entregar')).toBeTruthy()
  })

  it('cobro parcial CON deuda aceptada: permite «Entregar y dejar parcial» y avisa lo que queda', async () => {
    abrir({ promesaPagoFecha: '2026-11-01T00:00:00.000Z' })
    fireEvent.change(screen.getByTestId('cobro-monto'), { target: { value: '60000' } })
    await waitFor(() => expect(screen.getByTestId('entrega-gps-estado').textContent).toContain('lista'))
    await tomarFoto()
    const boton = screen.getByTestId('entrega-confirmar') as HTMLButtonElement
    expect(boton.disabled).toBe(false)
    expect(boton.textContent).toContain('dejar parcial')
    expect(screen.getByTestId('cobro-mensaje').textContent).toContain('parcial')
  })

  it('sin cobro con deuda aceptada: «dejar fiado» y no envía pagos', async () => {
    abrir({ promesaPagoFecha: '2026-11-01T00:00:00.000Z' })
    fireEvent.change(screen.getByTestId('cobro-monto'), { target: { value: '' } })
    await waitFor(() => expect(screen.getByTestId('entrega-gps-estado').textContent).toContain('lista'))
    await tomarFoto()
    const boton = screen.getByTestId('entrega-confirmar')
    expect(boton.textContent).toContain('fiado')
    fireEvent.click(boton)
    await waitFor(() => expect(fetchResilient).toHaveBeenCalled())
    const body = (fetchResilient.mock.calls[0][1] as { body: Record<string, unknown> }).body
    expect(body.pagos).toEqual([])
    expect(body.embarqueId).toBeUndefined()
  })

  it('el cobro nunca supera lo que se debe', async () => {
    abrir()
    await waitFor(() => expect(screen.getByTestId('entrega-gps-estado').textContent).toContain('lista'))
    fireEvent.change(screen.getByTestId('cobro-monto'), { target: { value: '9999999' } })
    expect(screen.getByTestId('cobro-mensaje').textContent).toContain('pagado')
  })

  it('sin GPS: exige un motivo, no trabaja al repartidor, y lo envía como justificación', async () => {
    capturarGps.mockResolvedValue(null)
    abrir()
    await waitFor(() => expect(screen.getByTestId('entrega-gps-motivo')).toBeTruthy())
    await tomarFoto()
    const boton = screen.getByTestId('entrega-confirmar') as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    fireEvent.change(screen.getByTestId('entrega-gps-motivo'), { target: { value: 'Dentro de un edificio' } })
    expect(boton.disabled).toBe(false)
    fireEvent.click(boton)
    await waitFor(() => expect(fetchResilient).toHaveBeenCalled())
    const body = (fetchResilient.mock.calls[0][1] as { body: Record<string, unknown> }).body
    expect(body.gpsJustificacion).toBe('Dentro de un edificio')
    expect(body.gpsLat).toBeUndefined()
  })

  it('sin red: queda encolado y se avisa como offline', async () => {
    fetchResilient.mockResolvedValue({ status: 'offline', localId: 'x', reason: 'network' })
    const { onDone } = abrir()
    await waitFor(() => expect(screen.getByTestId('entrega-gps-estado').textContent).toContain('lista'))
    await tomarFoto()
    fireEvent.click(screen.getByTestId('entrega-confirmar'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ pedidoId: 'p1', offline: true }))
  })

  it('si la oficina ya lo había entregado y el cobro no se registró, lo advierte en voz alta', async () => {
    fetchResilient.mockResolvedValue({ status: 'ok', statusCode: 200, data: { success: true, deduped: true, pagosNoAplicados: true } })
    abrir()
    await waitFor(() => expect(screen.getByTestId('entrega-gps-estado').textContent).toContain('lista'))
    await tomarFoto()
    fireEvent.click(screen.getByTestId('entrega-confirmar'))
    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(String(toastWarning.mock.calls[0][0])).toContain('NO se registró')
  })

  it('precios ocultos: no hay sección de cobro y solo entrega', async () => {
    abrir({}, { preciosOcultos: true })
    expect(screen.queryByTestId('cobro-monto')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('entrega-gps-estado').textContent).toContain('lista'))
    await tomarFoto()
    const boton = screen.getByTestId('entrega-confirmar') as HTMLButtonElement
    expect(boton.textContent).toBe('Entregar')
    fireEvent.click(boton)
    await waitFor(() => expect(fetchResilient).toHaveBeenCalled())
    expect((fetchResilient.mock.calls[0][1] as { body: Record<string, unknown> }).body.pagos).toEqual([])
  })

  it('un reintento tras un error reutiliza el mismo offlineId (no cobra dos veces)', async () => {
    fetchResilient.mockResolvedValueOnce({ status: 'error', error: 'falló', statusCode: 500 })
    abrir()
    await waitFor(() => expect(screen.getByTestId('entrega-gps-estado').textContent).toContain('lista'))
    await tomarFoto()
    fireEvent.click(screen.getByTestId('entrega-confirmar'))
    await waitFor(() => expect(fetchResilient).toHaveBeenCalledTimes(1))
    await waitFor(() => expect((screen.getByTestId('entrega-confirmar') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('entrega-confirmar'))
    await waitFor(() => expect(fetchResilient).toHaveBeenCalledTimes(2))
    const ids = fetchResilient.mock.calls.map((c) => (c[1] as { body: { offlineId: string } }).body.offlineId)
    expect(ids[0]).toBe(ids[1])
  })
})
