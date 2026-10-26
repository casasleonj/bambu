// TEMPORAL-SIN-EMBARQUE(#472): el cobro de un fiado pide «quién recibió el dinero»
// y «cuándo» solo al ADMIN con la función encendida. Componente real, red simulada.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { FiadosTable } from '../fiados-table'
import type { Pedido, Cliente } from '../types'

const mockGestion = vi.fn()
vi.mock('@/hooks/use-gestion-admin', () => ({ useGestionAdmin: (esAdmin: boolean) => mockGestion(esAdmin) }))
const mockFetch = vi.fn()
vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: (...a: unknown[]) => mockFetch(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const REPARTIDORES = [{ id: 'r1', nombre: 'Andrés' }]
const PEDIDO = {
  id: 'p1', numero: 351, clienteId: 'c1', nombreCli: 'Tienda La Esquina', telefonoCli: '3001112233',
  estadoEntrega: 'ENTREGADO', saldo: 60000, total: 60000, fecha: new Date().toISOString(), items: [],
} as unknown as Pedido

function montar(userRole: string) {
  return render(
    <FiadosTable
      clientes={[{ id: 'c1', limitePedidosFiados: 5 } as unknown as Cliente]}
      pedidos={[PEDIDO]}
      loading={false}
      error={null}
      activeTab="fiados"
      userRole={userRole}
    />,
  )
}
const escritorio = () => within(screen.getByTestId('fiados-desktop'))

function abrirPago() {
  fireEvent.click(escritorio().getByRole('button', { name: 'Pagar' }))
  fireEvent.change(escritorio().getByPlaceholderText(/Máx/), { target: { value: '60000' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ trabajadores: [] }) }) as unknown as typeof fetch
  mockFetch.mockResolvedValue({ status: 'ok', data: { pagosAplicados: [], montoAplicado: 60000, montoSobrante: 0 } })
})

describe('FiadosTable — cobro con «quién recibió» (#472)', () => {
  it('con la función encendida pide quién recibió y no cobra hasta decirlo', async () => {
    mockGestion.mockReturnValue({ activa: true, repartidores: REPARTIDORES })
    montar('ADMIN')
    abrirPago()
    expect((screen.getAllByTestId('cobro-recibio-oficina')[0] as HTMLInputElement).checked).toBe(false) // no viene marcado

    fireEvent.click(escritorio().getByRole('button', { name: 'Confirmar pago' }))
    expect(screen.getAllByText('Indica quién recibió el dinero.').length).toBeGreaterThan(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('si lo recibió un repartidor, exige elegirlo y lo envía junto con el pago', async () => {
    mockGestion.mockReturnValue({ activa: true, repartidores: REPARTIDORES })
    montar('ADMIN')
    abrirPago()
    fireEvent.click(screen.getAllByTestId('cobro-recibio-repartidor')[0])
    fireEvent.click(escritorio().getByRole('button', { name: 'Confirmar pago' }))
    expect(screen.getAllByText('Elige qué repartidor recibió el dinero.').length).toBeGreaterThan(0)
    expect(mockFetch).not.toHaveBeenCalled()

    fireEvent.change(screen.getAllByLabelText(/¿Qué repartidor\?/)[0], { target: { value: 'r1' } })
    fireEvent.click(escritorio().getByRole('button', { name: 'Confirmar pago' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    const [url, opciones] = mockFetch.mock.calls[0] as [string, { body: Record<string, unknown> }]
    expect(url).toBe('/api/pedidos/pagar-fiado')
    expect(opciones.body).toMatchObject({ clienteId: 'c1', monto: 60000, recibioDinero: 'REPARTIDOR', repartidorId: 'r1' })
    expect(opciones.body).not.toHaveProperty('fechaRecepcion') // hoy: el servidor usa el instante actual
  })

  it('con la función apagada (o sin ser ADMIN) el cobro es el de siempre: sin preguntas y sin campos nuevos', async () => {
    mockGestion.mockReturnValue({ activa: false, repartidores: [] })
    montar('ASISTENTE')
    abrirPago()
    expect(screen.queryByTestId('cobro-oficina')).toBeNull()
    fireEvent.click(escritorio().getByRole('button', { name: 'Confirmar pago' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    const [, opciones] = mockFetch.mock.calls[0] as [string, { body: Record<string, unknown> }]
    expect(opciones.body).not.toHaveProperty('recibioDinero')
    expect(opciones.body).not.toHaveProperty('repartidorId')
    expect(opciones.body).not.toHaveProperty('fechaRecepcion')
  })
})
