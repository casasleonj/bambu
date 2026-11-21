// @tests #517 — un pedido anulado o cancelado no ofrece confirmar pagos: ni el
// aviso «por confirmar» de la ficha ni el badge de la lista de pagos.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PedidoDetalle } from '../pedido-detalle'
import type { Pedido, PagoDetalle } from '../../pedidos-client/types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('@/components/correccion-precio/correccion-precio-panel', () => ({ CorreccionPrecioPanel: () => null }))
vi.mock('@/components/reduccion-comercial/reduccion-comercial-panel', () => ({ ReduccionComercialPanel: () => null }))
vi.mock('@/components/saldo-favor/saldo-favor-historial', () => ({ SaldoFavorHistorial: () => null }))
vi.mock('@/components/pedido-cliente-display', () => ({ PedidoClienteDisplay: () => null }))

const pagoPorConfirmar: PagoDetalle = {
  id: 'pg1', metodo: 'NEQUI', monto: 50000, fecha: '2026-11-08T14:12:00Z',
  confirmacion: 'REPORTADO', ocurridoAt: null, regularizado: false, correccionesFecha: [],
}

function pedidoCon(extra: Record<string, unknown> = {}): Pedido {
  return {
    id: 'ped1', numero: 1042, clienteId: 'c1', nombreCli: 'Marta', telefonoCli: '300',
    zonaCli: 'Z', barrioCli: 'B', tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'ENTREGADO',
    origen: 'PEDIDO', estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO',
    total: 50000, totalPagado: 50000, saldo: 0,
    fecha: '2026-11-08T15:00:00Z', createdAt: '2026-11-08T15:00:00Z',
    items: [], pagosDetalle: [pagoPorConfirmar],
    pagoReportadoPendiente: true,
    ...extra,
  } as unknown as Pedido
}

const props = (pedido: Pedido) => ({
  pedido, preciosActuales: {}, updatingId: null, userRole: 'ADMIN',
  estadoBadge: null, canalBadge: null, onClose: vi.fn(), onAccion: vi.fn(),
})

describe('PedidoDetalle — pago por confirmar según el estado del pedido (#517)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('un pedido vigente SÍ muestra el aviso «por confirmar» y el badge del pago', () => {
    render(<PedidoDetalle {...props(pedidoCon())} />)
    expect(screen.getByTestId('detalle-alerta-pago').textContent).toMatch(/por confirmar/i)
    const pago = screen.getByTestId('detalle-pago')
    expect(within(pago).getByText(/por confirmar/i)).toBeTruthy()
  })

  it('un pedido ANULADO no muestra el aviso ni el badge: ya no se confirma', () => {
    render(<PedidoDetalle {...props(pedidoCon({ estadoEntrega: 'ANULADO' }))} />)
    expect(screen.queryByTestId('detalle-alerta-pago')).toBeNull()
    const pago = screen.getByTestId('detalle-pago')
    expect(within(pago).queryByText(/por confirmar/i)).toBeNull()
  })

  it('un pedido CANCELADO tampoco los muestra', () => {
    render(<PedidoDetalle {...props(pedidoCon({ estadoEntrega: 'CANCELADO' }))} />)
    expect(screen.queryByTestId('detalle-alerta-pago')).toBeNull()
  })
})
