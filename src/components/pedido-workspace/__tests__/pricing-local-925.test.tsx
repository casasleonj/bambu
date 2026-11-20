import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PedidosWorkspace } from '../index'

// El preview remoto sigue siendo obligatorio para guardar, pero no debe
// ser necesario para mostrar el precio vigente mientras se digita.
vi.mock('../use-preview', () => ({ usePreview: () => undefined }))
vi.mock('../use-cliente-context', () => ({
  useClienteContext: () => ({
    fiadoStatus: null, patron: null, patronLoading: false, loadPatron: vi.fn(),
  }),
}))

const tabla = {
  PACA_AGUA: [
    { cantMin: 1, cantMax: 3, precio: 2800 },
    { cantMin: 4, cantMax: 9, precio: 2500 },
    { cantMin: 10, cantMax: null, precio: 2300 },
  ],
}
const pricing = {
  clienteOverrides: {},
  tiersByCode: tabla,
  productosByCode: { PACA_AGUA: { precioBase: 2800, aplicaDomicilio: false, sobreCostoDomicilio: 0 } },
}

const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
  if (url === '/api/precios/cotizacion') {
    const body = JSON.parse(init?.body ?? '{}') as { clienteId?: string; canal: string }
    return { ok: true, json: async () => ({
      success: true, clienteId: body.clienteId, negocioId: null,
      canal: body.canal, version: 'rules-v1', pricing,
    }) }
  }
  if (url === '/api/precios/tabla') return { ok: true, json: async () => ({ success: true, tabla }) }
  if (url === '/api/productos/configs') return { ok: true, json: async () => ({ success: true, productos: [
    { codigo: 'PACA_AGUA', aplicaDomicilio: false, sobreCostoDomicilio: 0, precioBase: 2800 },
  ] }) }
  return { ok: true, json: async () => ({ success: true }) }
})

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('#925 · precio local del workspace', () => {
  it('6→7→6 y 9→10 son inmediatos y no hacen fetch de precios por cada cantidad', async () => {
    render(<PedidosWorkspace
      clientes={[{ id: 'c1', nombre: 'Tienda X', telefono: '3000000000', direccion: 'Cra 1', barrio: 'Centro' }]}
      initialDraft={{
        clienteId: 'c1', canal: 'PUNTO',
        items: [{ producto: 'PACA_AGUA', cantidad: 6 }],
      }}
      onSubmit={vi.fn()}
    />)

    const total = () => screen.getByTestId('workspace-calculo')
    await waitFor(() => expect(total()).toHaveTextContent(/15[.,]000/))
    expect(screen.getByTestId('workspace-commit')).toBeDisabled() // sin preview = sin commit
    const llamadasIniciales = fetchMock.mock.calls.filter(([url]) => url === '/api/precios/cotizacion').length
    expect(llamadasIniciales).toBe(1)

    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    expect(total()).toHaveTextContent(/17[.,]500/)
    expect(total()).not.toHaveTextContent(/19[.,]600/)

    fireEvent.click(screen.getByTestId('workspace-dec-PACA_AGUA'))
    expect(total()).toHaveTextContent(/15[.,]000/)

    const cantidad = screen.getByTestId('workspace-cant-PACA_AGUA')
    fireEvent.change(cantidad, { target: { value: '9' } })
    expect(total()).toHaveTextContent(/22[.,]500/)
    fireEvent.change(cantidad, { target: { value: '10' } })
    expect(total()).toHaveTextContent(/23[.,]000/)

    const llamadasFinales = fetchMock.mock.calls.filter(([url]) => url === '/api/precios/cotizacion').length
    expect(llamadasFinales).toBe(llamadasIniciales)
  })

  it('precio especial prevalece sobre volumen sin redibujar controles', async () => {
    fetchMock.mockImplementationOnce(async (url: string, init?: { body?: string }) => {
      if (url === '/api/precios/cotizacion') {
        const body = JSON.parse(init?.body ?? '{}') as { clienteId: string; canal: string }
        return { ok: true, json: async () => ({
          success: true, clienteId: body.clienteId, negocioId: null,
          canal: body.canal, version: 'special-v1',
          pricing: { ...pricing, clienteOverrides: { PACA_AGUA: 2400 } },
        }) }
      }
      return fetchMock.getMockImplementation()?.(url, init) ?? { ok: true, json: async () => ({ success: true }) }
    })
    render(<PedidosWorkspace
      clientes={[]}
      initialDraft={{ clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 6 }] }}
      onSubmit={vi.fn()}
    />)
    await waitFor(() => expect(screen.getByTestId('workspace-calculo')).toHaveTextContent(/14[.,]400/))
  })
})
