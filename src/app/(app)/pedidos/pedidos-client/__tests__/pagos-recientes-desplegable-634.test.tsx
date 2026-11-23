// #634 — «Pagos recientes» es un desplegable; lo que exige acción (pendiente/revisión) y los
// errores de consulta nunca se ocultan detrás de él.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CobroFiadoDialog } from '../cobro-fiado-dialog'
const mockGestion = vi.fn(), mockFetch = vi.fn()
vi.mock('@/hooks/use-gestion-admin', () => ({ useGestionAdmin: (esAdmin: boolean) => mockGestion(esAdmin) }))
vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: (...a: unknown[]) => mockFetch(...a) }))
vi.mock('@/lib/db/offline', () => ({ offlineDb: {} }))
vi.mock('@/lib/db/sync', () => ({ syncWithServer: vi.fn(), SYNC_ITEM_DONE_EVENT: 'sync-item-done' }))

const preparacion = { clienteId: 'c1', clienteNombre: 'Tienda', version: 'c'.repeat(64), deudaTotal: 60000,
  pedidos: [{ id: 'p1', numero: 351, saldo: 60000, total: 60000, totalPagado: 0, fecha: new Date().toISOString(), factura: null }], metodosPorConfirmar: [] }
const reciente = (nombre: string, monto: number, referencia: string) => ({
  referencia, clienteId: 'c1', clienteNombre: nombre, registradoAt: '2026-11-20T15:00:00.000Z',
  pagosAplicados: [{ pedidoId: 'p1', numero: 351, montoAplicado: monto, saldoRestante: 0 }],
  montoRecibido: monto, montoAplicado: monto, montoSobrante: 0, saldoFavorAcreditado: 0,
  medios: [{ metodo: 'EFECTIVO', monto, montoAplicado: monto, saldoFavor: 0, confirmacion: 'CONFIRMADO' }],
})
const RECIENTES = [reciente('Panadería Doña Luz', 12500, 'r1'), reciente('Tienda El Portal', 8000, 'r2'), reciente('Minimercado San José', 24500.5, 'r3')]

function montar() {
  return render(<CobroFiadoDialog cliente={{ id: 'c1', nombre: 'Tienda' }} actorId="u1" visible userRole="ADMIN" onClose={vi.fn()} onRegistrado={vi.fn()} />)
}
/** Borrador local pendiente de sincronizar: ocupa la cola offline del actor. */
function sembrarPendiente(etapa: 'pendiente' | 'revisar-cambio', nombre: string) {
  const borradores = [{ cliente: { id: 'c9', nombre }, referencia: `local-${etapa}`, lineas: [{ metodo: 'EFECTIVO', monto: '5000' }],
    cobro: { fecha: '2026-11-20', quien: 'OFICINA' }, etapa }]
  sessionStorage.setItem('bambu:fiados:borradores:u1', JSON.stringify(borradores))
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear()
  mockGestion.mockReturnValue({ activa: false, repartidores: [] })
  global.fetch = vi.fn().mockImplementation(async (url: string) => ({ ok: true,
    json: async () => url.includes('recientes') ? { resultados: RECIENTES } : { preparacion } })) as unknown as typeof fetch
})

describe('#634 — «Pagos recientes» desplegable', () => {
  it('el histórico viene cerrado y el encabezado muestra cuántos son y cuánto suman', async () => {
    montar()
    const det = await screen.findByTestId('pagos-recientes')
    expect(det.tagName).toBe('DETAILS')
    expect(det.hasAttribute('open')).toBe(false)
    // 12.500 + 8.000 + 24.500,50 = 45.000,50 exacto en centavos (no 45.000,49999)
    expect(det.querySelector('summary')!.textContent!.replace(/\u00a0/g, ' ')).toContain('3 pagos · $ 45.000,50')
    // las filas existen y se pueden abrir: no se pierde acceso ni información
    expect(screen.getByText(/Panadería Doña Luz/)).toBeTruthy()
    fireEvent.click(det.querySelector('summary')!)
    await waitFor(() => expect(screen.getByTestId('pagos-recientes').hasAttribute('open')).toBe(true))
    expect(screen.getByText(/Minimercado San José/)).toBeTruthy()
  })

  it('abrir una fila del histórico sigue llevando al resultado con sus documentos', async () => {
    montar()
    await screen.findByTestId('pagos-recientes')
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver resultado y documentos' })[1])
    expect(await screen.findByText('Pago registrado')).toBeTruthy()
    // el resultado del pago elegido, no otro: la referencia r2 (8.000), no r1
    expect(screen.getByText(/Referencia: r2/)).toBeTruthy()
    expect(screen.getByText('Registrado')).toBeTruthy()
  })

  it('un cobro pendiente de sincronizar queda visible fuera del desplegable, aunque esté cerrado', async () => {
    sembrarPendiente('pendiente', 'Tienda La Esquina')
    montar()
    const pendientes = await screen.findByTestId('cobros-por-verificar')
    expect(pendientes.textContent).toContain('Tienda La Esquina')
    // lo que exige acción no vive dentro del <details>: cerrar el histórico no puede ocultarlo
    expect(screen.getByTestId('pagos-recientes').contains(pendientes)).toBe(false)
    expect(pendientes.contains(document.querySelector('[data-testid="pagos-recientes"]'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Ver estado del cobro' }))
    expect(await screen.findByText(/Estado del registro por verificar/)).toBeTruthy()
  })

  it('«requiere revisión» también se cuenta y se mantiene a la vista', async () => {
    sembrarPendiente('revisar-cambio', 'Tienda Doña Ana')
    montar()
    const pendientes = await screen.findByTestId('cobros-por-verificar')
    expect(pendientes.textContent).toContain('Requiere revisión')
    expect(pendientes.textContent).toContain('1 cobro por verificar o sincronizar')
  })

  it('si falla la consulta, el aviso y el reintento quedan fuera del desplegable', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => url.includes('recientes')
      ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => ({ preparacion }) }) as unknown as typeof fetch
    montar()
    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('Conservamos los datos anteriores')
    expect(screen.queryByTestId('pagos-recientes')).toBeNull() // sin datos no hay nada que plegar
    expect(alerta.querySelector('button')!.textContent).toBe('Reintentar consulta de pagos')
  })

  it('sin pagos recientes ni pendientes no se dibuja la sección (no aparece ruido vacío)', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => ({ ok: true,
      json: async () => url.includes('recientes') ? { resultados: [] } : { preparacion } })) as unknown as typeof fetch
    montar()
    await screen.findByLabelText('Medio 1')
    expect(screen.queryByTestId('pagos-recientes')).toBeNull()
    expect(screen.queryByTestId('cobros-por-verificar')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Estado de cobros' })).toBeNull()
  })
})
