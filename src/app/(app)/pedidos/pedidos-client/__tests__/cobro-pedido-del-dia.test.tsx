// #597 / S2-02: el cobro desde la lista de Pedidos es de UN pedido (el del día), no el reparto de Fiados.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CobroFiadoDialog } from '../cobro-fiado-dialog'
const mockFetch = vi.fn()
vi.mock('@/hooks/use-gestion-admin', () => ({ useGestionAdmin: () => ({ activa: false, repartidores: [] }) }))
vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: (...a: unknown[]) => mockFetch(...a) }))
vi.mock('@/lib/db/offline', () => ({ offlineDb: {} }))
vi.mock('@/lib/db/sync', () => ({ syncWithServer: vi.fn(), SYNC_ITEM_DONE_EVENT: 'sync-item-done' }))
const preparacion = { clienteId: 'c1', clienteNombre: 'Tienda', version: 'b'.repeat(64), deudaTotal: 45000,
  pedidos: [{ id: 'p701', numero: 701, saldo: 45000, total: 45000, totalPagado: 0, fecha: new Date().toISOString(), factura: null }], metodosPorConfirmar: [] }
const urls: string[] = []
const irAFiados = vi.fn()
function montar() {
  return render(<CobroFiadoDialog cliente={{ id: 'c1', nombre: 'Tienda', pedido: { id: 'p701', numero: 701 } }}
    actorId="u1" visible={false} userRole="ASISTENTE" onClose={vi.fn()} onRegistrado={vi.fn()} onIrAFiados={irAFiados} />)
}
async function llenar(monto: string) {
  await screen.findByLabelText('Medio 1')
  fireEvent.change(screen.getByLabelText('Medio 1'), { target: { value: 'EFECTIVO' } })
  fireEvent.change(screen.getByLabelText('Monto 1'), { target: { value: monto } })
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); urls.length = 0
  global.fetch = vi.fn().mockImplementation(async (url: string) => { urls.push(url)
    return { ok: true, json: async () => url.includes('recientes') ? { resultados: [] } : { preparacion } } }) as unknown as typeof fetch
  mockFetch.mockResolvedValue({ status: 'offline', reason: 'network' })
})
describe('CobroFiadoDialog con un pedido (#597)', () => {
  it('consulta y registra solo ese pedido, y lo dice sin hablar de deuda más antigua', async () => {
    montar(); await llenar('45000')
    expect(screen.getByRole('heading', { name: /Registrar pago · Pedido #701/ })).toBeTruthy()
    expect(screen.getByTestId('cobro-solo-pedido').textContent).toContain('solo a este pedido')
    expect(screen.queryByText(/más antigua/)).toBeNull()
    expect(urls.some(u => u.includes('clienteId=c1') && u.includes('pedidoId=p701'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Revisar reparto' }))
    fireEvent.click(await screen.findByRole('button', { name: /Registrar.*45/ }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    const [url, opciones] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/pedidos/pagar-fiado')
    expect(opciones.body).toMatchObject({ clienteId: 'c1', pedidoId: 'p701', versionDeuda: preparacion.version, pagos: [{ metodo: 'EFECTIVO', monto: 45000 }] })
  })
  it('no deja registrar más que el saldo del pedido (no hay saldo a favor desde un pedido)', async () => {
    montar(); await llenar('50000')
    fireEvent.click(screen.getByRole('button', { name: 'Revisar reparto' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/supera el saldo del pedido/)
    expect(mockFetch).not.toHaveBeenCalled()
  })
  it('si el servidor dice que se cobra en Fiados (p. ej. deuda anterior) lo explica y ofrece ir a Fiados, sin formulario de pago', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => url.includes('recientes')
      ? { ok: true, json: async () => ({ resultados: [] }) }
      : { ok: false, status: 409, json: async () => ({ error: { code: 'CLIENTE_CON_DEUDA_ANTERIOR',
        message: 'Este cliente tiene deuda anterior (la más antigua es el pedido #651). El pago se aplica primero a la más antigua: cóbralo en la pestaña Fiados.' } }) }) as unknown as typeof fetch
    montar()
    expect((await screen.findByTestId('cobro-en-fiados')).textContent).toContain('pedido #651')
    expect(screen.queryByLabelText('Medio 1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Fiados' }))
    expect(irAFiados).toHaveBeenCalledTimes(1)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
