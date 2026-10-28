// #472/#515: el flujo compartido conserva autoridad, responsable y fecha.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CobroFiadoDialog } from '../cobro-fiado-dialog'
const mockGestion = vi.fn(), mockFetch = vi.fn()
vi.mock('@/hooks/use-gestion-admin', () => ({ useGestionAdmin: (esAdmin: boolean) => mockGestion(esAdmin) }))
vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: (...a: unknown[]) => mockFetch(...a) }))
vi.mock('@/hooks/use-shallow-search-params', () => ({ useShallowSearchParams: () => ({ toString: () => 'tab=fiados' }) }))
vi.mock('@/lib/db/offline', () => ({ offlineDb: {} }))
vi.mock('@/lib/db/sync', () => ({ syncWithServer: vi.fn(), SYNC_ITEM_DONE_EVENT: 'sync-item-done' }))
const REPARTIDORES = [{ id: 'r1', nombre: 'Andrés' }]
const preparacion = { clienteId: 'c1', clienteNombre: 'Tienda', version: 'a'.repeat(64), deudaTotal: 60000,
  pedidos: [{ id: 'p1', numero: 351, saldo: 60000, total: 60000, totalPagado: 0, fecha: new Date().toISOString(), factura: null }], metodosPorConfirmar: [] }
function montar(userRole: string) {
  return render(<CobroFiadoDialog cliente={{ id: 'c1', nombre: 'Tienda' }} actorId="u1" visible userRole={userRole} onClose={vi.fn()} onRegistrado={vi.fn()} />)
}
async function llenar() {
  await screen.findByLabelText('Medio 1')
  fireEvent.change(screen.getByLabelText('Medio 1'), { target: { value: 'EFECTIVO' } })
  fireEvent.change(screen.getByLabelText('Monto 1'), { target: { value: '60000' } })
}
async function registrar() {
  fireEvent.click(screen.getByRole('button', { name: 'Revisar reparto' }))
  fireEvent.click(await screen.findByRole('button', { name: /Registrar.*60/ }))
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear()
  global.fetch = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes('recientes') ? { resultados: [] } : { preparacion } })) as unknown as typeof fetch
  mockFetch.mockResolvedValue({ status: 'offline', reason: 'network' })
})
describe('CobroFiadoDialog — quién recibió (#472)', () => {
  it('con la función encendida pide quién recibió y no cobra hasta decirlo', async () => {
    mockGestion.mockReturnValue({ activa: true, repartidores: REPARTIDORES })
    montar('ADMIN'); await llenar()
    expect((screen.getByTestId('cobro-recibio-oficina') as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Revisar reparto' }))
    expect(screen.getAllByText('Indica quién recibió el dinero.').length).toBeGreaterThan(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })
  it('si lo recibió un repartidor exige elegirlo y envía la identidad junto con el pago revisado', async () => {
    mockGestion.mockReturnValue({ activa: true, repartidores: REPARTIDORES })
    montar('ADMIN'); await llenar()
    fireEvent.click(screen.getByTestId('cobro-recibio-repartidor'))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar reparto' }))
    expect(screen.getAllByText('Elige qué repartidor recibió el dinero.').length).toBeGreaterThan(0)
    expect(mockFetch).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/¿Qué repartidor\?/), { target: { value: 'r1' } })
    await registrar()
    const [url, opciones] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/pedidos/pagar-fiado')
    expect(opciones.body).toMatchObject({ clienteId: 'c1', pagos: [{ monto: 60000, metodo: 'EFECTIVO' }], recibioDinero: 'REPARTIDOR', repartidorId: 'r1', versionDeuda: preparacion.version })
    expect(opciones.body).not.toHaveProperty('fechaRecepcion')
  })
  it('con la función apagada no añade responsable ni fechas al registro', async () => {
    mockGestion.mockReturnValue({ activa: false, repartidores: [] })
    montar('ASISTENTE'); await llenar()
    expect(screen.queryByTestId('cobro-oficina')).toBeNull()
    await registrar()
    const [, opciones] = mockFetch.mock.calls[0]
    expect(opciones.body).not.toHaveProperty('recibioDinero')
    expect(opciones.body).not.toHaveProperty('repartidorId')
    expect(opciones.body).not.toHaveProperty('fechaRecepcion')
  })
})
