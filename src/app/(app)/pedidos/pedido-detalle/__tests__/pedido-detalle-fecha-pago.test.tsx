// @tests #617 — el detalle del pedido muestra la fecha efectiva de cada cobro, el aviso y el historial; solo el ADMIN corrige
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { PedidoDetalle } from '../pedido-detalle'
import type { Pedido, PagoDetalle } from '../../pedidos-client/types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('@/components/correccion-precio/correccion-precio-panel', () => ({ CorreccionPrecioPanel: () => null }))
vi.mock('@/components/reduccion-comercial/reduccion-comercial-panel', () => ({ ReduccionComercialPanel: () => null }))
vi.mock('@/components/saldo-favor/saldo-favor-historial', () => ({ SaldoFavorHistorial: () => null }))
vi.mock('@/components/pedido-cliente-display', () => ({ PedidoClienteDisplay: () => null }))

function pedidoCon(pagos: PagoDetalle[], extra: Record<string, unknown> = {}): Pedido {
  return {
    id: 'ped1', numero: 1042, clienteId: 'c1', nombreCli: 'Marta', telefonoCli: '300', zonaCli: 'Z', barrioCli: 'B',
    tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'ENTREGADO', origen: 'PEDIDO', estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO',
    total: 50000, totalPagado: 50000, saldo: 0, fecha: '2026-11-08T15:00:00Z', createdAt: '2026-11-08T15:00:00Z',
    items: [], pagosDetalle: pagos, ...extra,
  } as unknown as Pedido
}
// Registrado el 8 nov (09:12 Bogotá). Cobrado el 7 nov: es anterior a la creación del pedido (8 nov 10:00 Bogotá).
const pagoCorregible: PagoDetalle = { id: 'pg1', metodo: 'NEQUI', monto: 50000, fecha: '2026-11-08T14:12:00Z', confirmacion: 'CONFIRMADO', ocurridoAt: '2026-11-07T17:00:00Z', regularizado: false, correccionesFecha: [] }

const props = (pedido: Pedido, userRole: string) => ({
  pedido, preciosActuales: {}, updatingId: null, userRole, estadoBadge: null, canalBadge: null, onClose: vi.fn(), onAccion: vi.fn(),
})

describe('PedidoDetalle — fecha efectiva del cobro (#617)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('muestra cuándo se cobró y cuándo se registró, y avisa (sin bloquear) que es anterior a la creación del pedido', () => {
    render(<PedidoDetalle {...props(pedidoCon([pagoCorregible]), 'ADMIN')} />)
    const pago = screen.getByTestId('detalle-pago')
    expect(within(pago).getByTestId('detalle-pago-fechas').textContent).toMatch(/Se cobró .* · registrado /)
    expect(within(pago).getByTestId('detalle-pago-anterior-pedido').textContent).toMatch(/Fecha anterior a la creación del pedido/)
  })

  it('un cobro normal (sin fecha efectiva distinta) se ve como siempre y sin aviso', () => {
    const normal: PagoDetalle = { ...pagoCorregible, ocurridoAt: null }
    render(<PedidoDetalle {...props(pedidoCon([normal]), 'ADMIN')} />)
    expect(screen.queryByTestId('detalle-pago-fechas')).toBeNull()
    expect(screen.queryByTestId('detalle-pago-anterior-pedido')).toBeNull()
  })

  it('solo el ADMIN ve «Corregir fecha»; ASISTENTE y CONTADOR no', () => {
    for (const rol of ['ASISTENTE', 'CONTADOR', 'REPARTIDOR']) {
      const { unmount } = render(<PedidoDetalle {...props(pedidoCon([pagoCorregible]), rol)} />)
      expect(screen.queryByTestId('pago-corregir-fecha-abrir'), rol).toBeNull()
      unmount()
    }
    render(<PedidoDetalle {...props(pedidoCon([pagoCorregible]), 'ADMIN')} />)
    expect(screen.getByTestId('pago-corregir-fecha-abrir')).toBeTruthy()
  })

  it('un cobro de una regularización formal o de un pedido anulado no se corrige desde aquí', () => {
    const { unmount } = render(<PedidoDetalle {...props(pedidoCon([{ ...pagoCorregible, regularizado: true }]), 'ADMIN')} />)
    expect(screen.queryByTestId('pago-corregir-fecha-abrir')).toBeNull()
    unmount()
    render(<PedidoDetalle {...props(pedidoCon([pagoCorregible], { estadoEntrega: 'ANULADO' }), 'ADMIN')} />)
    expect(screen.queryByTestId('pago-corregir-fecha-abrir')).toBeNull()
  })

  it('el historial de correcciones lo ve cualquier rol: de qué fecha a cuál, quién, cuándo y por qué', () => {
    const conHistorial: PagoDetalle = {
      ...pagoCorregible,
      correccionesFecha: [{ id: 'c1', fechaAnterior: '2026-11-07T17:00:00Z', fechaNueva: '2026-11-08T14:12:00Z', motivo: 'Error de digitación', corregidoAt: '2026-11-08T16:03:00Z', corregidoPor: 'Admin' }],
    }
    render(<PedidoDetalle {...props(pedidoCon([conHistorial]), 'ASISTENTE')} />)
    const h = screen.getByTestId('detalle-pago-correcciones').textContent ?? ''
    expect(h).toMatch(/Corrección de fecha/)
    expect(h).toMatch(/Admin/)
    expect(h).toMatch(/Error de digitación/)
    expect(screen.queryByTestId('pago-corregir-fecha-abrir')).toBeNull()
  })

  it('tras corregir, el detalle vuelve a leer los pagos y muestra la fecha nueva y el historial', async () => {
    const corregido: PagoDetalle = {
      ...pagoCorregible, ocurridoAt: null,
      correccionesFecha: [{ id: 'c1', fechaAnterior: '2026-11-07T17:00:00Z', fechaNueva: '2026-11-08T14:12:00Z', motivo: 'Error de digitación', corregidoAt: '2026-11-08T16:03:00Z', corregidoPor: 'Admin' }],
    }
    global.fetch = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      if (String(u).includes('/corregir-fecha')) return new Response(JSON.stringify({ success: true }), { status: 201 })
      if (init?.method === undefined || init.method === 'GET') return new Response(JSON.stringify({ success: true, pedido: { pagosDetalle: [corregido] } }), { status: 200 })
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    render(<PedidoDetalle {...props(pedidoCon([pagoCorregible]), 'ADMIN')} />)
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-abrir'))
    fireEvent.change(screen.getByTestId('pago-corregir-fecha-dia'), { target: { value: '2026-11-08' } })
    fireEvent.change(screen.getByTestId('pago-corregir-fecha-motivo'), { target: { value: 'Error de digitación' } })
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-revisar'))
    fireEvent.click(screen.getByTestId('pago-corregir-fecha-confirmar'))
    await waitFor(() => expect(screen.getByTestId('detalle-pago-correcciones')).toBeTruthy())
    expect(screen.queryByTestId('detalle-pago-fechas')).toBeNull() // ya no hay fecha efectiva distinta: vuelve a ser la del registro
    expect(screen.getByTestId('detalle-pago-correcciones').textContent).toMatch(/Error de digitación/)
  })
})
