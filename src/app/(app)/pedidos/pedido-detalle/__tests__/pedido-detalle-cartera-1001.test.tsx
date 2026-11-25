// @tests #1001 — el cobro de lo entregado depende de si el CLIENTE ya figura en Fiados.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PedidoDetalle } from '../pedido-detalle'
import type { Pedido } from '../../pedidos-client/types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('@/components/correccion-precio/correccion-precio-panel', () => ({ CorreccionPrecioPanel: () => null }))
vi.mock('@/components/reduccion-comercial/reduccion-comercial-panel', () => ({ ReduccionComercialPanel: () => null }))
vi.mock('@/components/saldo-favor/saldo-favor-historial', () => ({ SaldoFavorHistorial: () => null }))
vi.mock('@/components/pedido-cliente-display', () => ({ PedidoClienteDisplay: () => null }))

/** Pedido parcial: 4 de 6 entregadas ($8.000 entregados de $12.000), sin pagos. */
const parcial = {
  id: 'ped1', numero: 3, clienteId: 'c1', nombreCli: 'Cliente C', telefonoCli: '300', zonaCli: 'Z', barrioCli: 'B',
  tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'PENDIENTE', origen: 'PEDIDO', estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE',
  total: 12000, totalPagado: 0, saldo: 12000, exigible: 8000, fecha: '2026-11-24T15:00:00Z', createdAt: '2026-11-24T15:00:00Z',
  items: [{ producto: 'PACA_AGUA', cantPedido: 6, cantEntrega: 4, precio: 2000, subtotal: 12000 }], pagosDetalle: [],
} as unknown as Pedido
const entregadoConSaldo = { ...parcial, estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', items: [{ producto: 'PACA_AGUA', cantPedido: 6, cantEntrega: 6, precio: 2000, subtotal: 12000 }], saldo: 12000, exigible: 12000 } as unknown as Pedido

const props = (pedido: Pedido, cartera?: 'con' | 'sin' | 'desconocida') => ({
  pedido, preciosActuales: {}, updatingId: null, userRole: 'ADMIN', estadoBadge: null, canalBadge: null, onClose: vi.fn(), onAccion: vi.fn(), ...(cartera ? { cartera } : {}),
})

describe('PedidoDetalle — cobro según la cartera del cliente (#1001)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-24T18:00:00Z')) // mediodía de Bogotá: «hoy» es el 24
  })
  afterEach(() => vi.useRealTimers())

  it('parcial sin cartera: «Registrar pago» abre el cobro y no manda a Fiados', () => {
    const p = props(parcial, 'sin')
    render(<PedidoDetalle {...p} />)
    const boton = screen.getByTestId('detalle-registrar-pago')
    expect(boton.textContent).toBe('Registrar pago')
    expect(screen.queryByText('Consultar y cobrar en Fiados')).toBeNull()
    fireEvent.click(boton)
    expect(p.onAccion).toHaveBeenCalledWith('registrar-pago')
  })

  it('parcial sin cartera y con promesa de pago: también «Registrar pago» (el servidor ya lo acepta, #1001)', () => {
    render(<PedidoDetalle {...props({ ...parcial, promesaPagoFecha: '2026-11-30T05:00:00.000Z' } as unknown as Pedido, 'sin')} />)
    expect(screen.getByTestId('detalle-registrar-pago').textContent).toBe('Registrar pago')
    expect(screen.queryByText('Consultar y cobrar en Fiados')).toBeNull()
  })

  it.each(['con', 'desconocida', undefined] as const)('parcial con cartera o sin saber (%s): enlace a Fiados, nunca «no debe»', (cartera) => {
    render(<PedidoDetalle {...props(parcial, cartera)} />)
    expect(screen.getByText('Consultar y cobrar en Fiados').getAttribute('href')).toBe('/pedidos?tab=fiados&clienteId=c1')
    expect(screen.queryByTestId('detalle-registrar-pago')).toBeNull()
  })

  it('entregado con saldo: sin cartera «Registrar pago»; con cartera «Ver cartera del cliente»', () => {
    const sin = render(<PedidoDetalle {...props(entregadoConSaldo, 'sin')} />)
    expect(screen.getByTestId('detalle-registrar-pago-entregado').textContent).toContain('Registrar pago')
    expect(screen.queryByText(/Ver cartera del cliente/)).toBeNull()
    sin.unmount()
    render(<PedidoDetalle {...props(entregadoConSaldo, 'con')} />)
    expect(screen.getByText(/Ver cartera del cliente/).getAttribute('href')).toBe('/pedidos?tab=fiados&clienteId=c1')
    expect(screen.queryByTestId('detalle-registrar-pago-entregado')).toBeNull()
  })

  it('donde el servidor rechazaría el cobro no se ofrece «Registrar pago»: enlace a Fiados como antes', () => {
    const casos: Array<[string, Pedido, string]> = [
      ['consumidor final', { ...entregadoConSaldo, clienteId: 'CONSUMIDOR_FINAL' } as unknown as Pedido, 'ADMIN'],
      ['entregado otro día', { ...parcial, entregadoAt: '2026-11-23T15:00:00Z', fecha: '2026-11-23T15:00:00Z' } as unknown as Pedido, 'ADMIN'],
      ['rol que no cobra', parcial, 'VENDEDOR'],
    ]
    for (const [, pedido, userRole] of casos) {
      const { unmount } = render(<PedidoDetalle {...props(pedido, 'sin')} userRole={userRole} />)
      expect(screen.queryByTestId('detalle-registrar-pago')).toBeNull()
      expect(screen.queryByTestId('detalle-registrar-pago-entregado')).toBeNull()
      unmount()
    }
  })

  it('el día de entrega manda sobre el de creación: creado ayer y entregado hoy sí se cobra aquí', () => {
    render(<PedidoDetalle {...props({ ...parcial, fecha: '2026-11-23T15:00:00Z', entregadoAt: '2026-11-24T15:00:00Z' } as unknown as Pedido, 'sin')} />)
    expect(screen.getByTestId('detalle-registrar-pago')).toBeTruthy()
  })
})
