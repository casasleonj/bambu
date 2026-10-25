// TEMPORAL-SIN-EMBARQUE(#472): el diálogo «Registrar entrega» renderizado de verdad.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RegistrarEntregaDialog } from '../registrar-entrega-dialog'
import type { PedidoParaEntrega } from '../logica'

const PEDIDO: PedidoParaEntrega = {
  id: 'ped1', numero: 342, canal: 'DOMICILIO', clienteId: 'c1', nombreCliente: 'Doña Rosa',
  total: 20000, totalPagado: 0, entregadoPorId: null,
  items: [{ producto: 'BOTELLON', cantPedido: 2, cantEntrega: 0 }],
}
const REPARTIDORES = [{ id: 'r1', nombre: 'Andrés' }, { id: 'r2', nombre: 'Camilo' }]

function abrir(over: Partial<PedidoParaEntrega> = {}, onRegistrado = vi.fn(), onClose = vi.fn()) {
  render(<RegistrarEntregaDialog pedido={{ ...PEDIDO, ...over }} repartidores={REPARTIDORES} onClose={onClose} onRegistrado={onRegistrado} />)
  return { onRegistrado, onClose }
}
const revisar = () => fireEvent.click(screen.getByTestId('re-revisar'))

beforeEach(() => { vi.restoreAllMocks() })

describe('RegistrarEntregaDialog', () => {
  it('no deja pasar a «revisar» sin elegir alcance y repartidor, y lo dice en palabras sencillas', () => {
    abrir()
    revisar()
    expect(screen.getByText('Indica si se entregó todo o menos.')).toBeInTheDocument()
    expect(screen.getByText('Elige quién entregó el pedido.')).toBeInTheDocument()
    expect(screen.queryByTestId('re-resumen')).toBeNull()
  })

  it('«quién recibió el dinero» NO viene marcado y es obligatorio si hay cobro', () => {
    abrir()
    fireEvent.click(screen.getByTestId('alcance-todo'))
    fireEvent.change(screen.getByLabelText(/¿Quién lo entregó/), { target: { value: 'r1' } })
    fireEvent.change(screen.getByLabelText('¿Cuánto dinero se recibió?'), { target: { value: '20000' } })
    expect((screen.getByTestId('recibio-repartidor') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByTestId('recibio-oficina') as HTMLInputElement).checked).toBe(false)
    revisar()
    expect(screen.getByText('Indica quién recibió el dinero.')).toBeInTheDocument()
  })

  it('si queda debiendo pide la promesa de pago; con ella pasa a revisar y muestra el resumen', () => {
    abrir()
    fireEvent.click(screen.getByTestId('alcance-todo'))
    fireEvent.change(screen.getByLabelText(/¿Quién lo entregó/), { target: { value: 'r1' } })
    expect(screen.getByText(/Quedan debiendo \$20\.000/)).toBeInTheDocument()
    revisar()
    expect(screen.getByText('Si queda debiendo, necesitamos hasta cuándo promete pagar.')).toBeInTheDocument()
    const manana = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    fireEvent.change(screen.getByLabelText(/Hasta cuándo promete pagar/), { target: { value: manana } })
    revisar()
    const resumen = screen.getByTestId('re-resumen')
    expect(resumen).toHaveTextContent('ENTREGADO')
    expect(resumen).toHaveTextContent('Andrés')
    expect(resumen).toHaveTextContent(`hasta el ${manana}`)
    expect(screen.getByText(/no se puede deshacer/)).toBeInTheDocument()
  })

  it('guarda con la clave del borrador, manda lo capturado y avisa al terminar', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, deduped: false }) })
    vi.stubGlobal('fetch', fetchMock)
    const { onRegistrado } = abrir()
    fireEvent.click(screen.getByTestId('alcance-todo'))
    fireEvent.change(screen.getByLabelText(/¿Quién lo entregó/), { target: { value: 'r2' } })
    fireEvent.change(screen.getByLabelText('¿Cuánto dinero se recibió?'), { target: { value: '20000' } })
    fireEvent.click(screen.getByTestId('recibio-oficina'))
    revisar()
    fireEvent.click(screen.getByTestId('re-guardar'))
    await waitFor(() => expect(onRegistrado).toHaveBeenCalledWith({ deduped: false, numero: 342 }))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/pedidos/ped1/gestion-admin/entrega')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      itemsEntregados: [{ producto: 'BOTELLON', cantidad: 2 }],
      repartidorId: 'r2',
      recibioDinero: 'OFICINA',
      pagos: [{ metodo: 'EFECTIVO', monto: 20000 }],
    })
    expect(typeof body.offlineId).toBe('string')
    expect(body.offlineId.length).toBeGreaterThanOrEqual(8)
  })

  it('un error del servidor se muestra tal cual y permite reintentar con LA MISMA clave', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ success: false, error: { message: 'La nómina de ese repartidor para esa fecha ya está hecha y su comisión se perdería.', code: 'NOMINA_EXISTENTE' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, deduped: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const { onRegistrado } = abrir({ canal: 'PUNTO' })
    fireEvent.click(screen.getByTestId('alcance-todo'))
    fireEvent.change(screen.getByLabelText('¿Cuánto dinero se recibió?'), { target: { value: '20000' } })
    fireEvent.click(screen.getByTestId('recibio-oficina'))
    revisar()
    fireEvent.click(screen.getByTestId('re-guardar'))
    expect(await screen.findByTestId('re-error')).toHaveTextContent('nómina de ese repartidor')
    expect(onRegistrado).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('re-guardar'))
    await waitFor(() => expect(onRegistrado).toHaveBeenCalledWith({ deduped: true, numero: 342 }))
    const claves = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).offlineId)
    expect(claves[0]).toBe(claves[1])
  })

  it('sin conexión: explica que esta acción necesita internet y no pierde lo escrito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    abrir({ canal: 'PUNTO' })
    fireEvent.click(screen.getByTestId('alcance-todo'))
    fireEvent.change(screen.getByLabelText('¿Cuánto dinero se recibió?'), { target: { value: '20000' } })
    fireEvent.click(screen.getByTestId('recibio-oficina'))
    revisar()
    fireEvent.click(screen.getByTestId('re-guardar'))
    expect(await screen.findByTestId('re-error')).toHaveTextContent('solo se puede hacer con internet')
    fireEvent.click(screen.getByText('Volver'))
    expect((screen.getByLabelText('¿Cuánto dinero se recibió?') as HTMLInputElement).value).toBe('20000')
  })

  it('si el pedido ya tiene repartidor, queda fijo y no se puede cambiar', () => {
    abrir({ entregadoPorId: 'r1' })
    expect(screen.getByTestId('repartidor-fijo')).toHaveTextContent('Andrés')
    expect(screen.queryByLabelText(/¿Quién lo entregó/)).toBeNull()
  })
})
