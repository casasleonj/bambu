// @tests unit/pedido-table
// Bug reportado: mismo patrón que "Aponte" en clientes, pero para pedidos —
// un pedido creado offline no dejaba ningún rastro visible en la lista
// hasta sincronizar. Estos tests cubren el render de las filas pendientes/
// fallidas que agrega el fix, y la regresión en el conteo "Sin horario"
// (antes calculaba pedidos.length - pinned.length, que se rompe cuando
// pedidos.length incluye filas pendientes que no participan del split).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { PedidoTable } from '../pedido-table'
import type { Pedido } from '../types'

vi.mock('@/components/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}))
vi.mock('@/components/money-display', () => ({
  MoneyDisplay: ({ value }: { value: number }) => <span>{value}</span>,
}))
vi.mock('@/components/pedido-cliente-display', () => ({
  PedidoClienteDisplay: ({ nombreCli }: { nombreCli: string }) => <span>{nombreCli}</span>,
}))
vi.mock('@/modules/pedidos/presentation/visual-states', () => ({
  calcularEstadoPagoVisual: () => ({ key: 'PENDIENTE', label: 'Pendiente', color: 'gray' }),
}))

const rowProps = {
  updatingId: null,
  hasActiveFilters: false,
  userRole: 'ADMIN',
  renderOrigenBadge: () => null,
  renderEstadoEntregaBadge: () => null,
  renderEstadoPagoBadge: () => null,
  getAlertasPedido: () => [],
  tieneFiado: () => false,
  onDetail: vi.fn(),
  onCambiarEstado: vi.fn(),
  onCreateClick: vi.fn(),
}

function makeRealPedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id: 'p1',
    numero: 1,
    clienteId: 'c1',
    nombreCli: 'Juan',
    telefonoCli: '3001234567',
    zonaCli: '',
    barrioCli: '',
    tipo: 'ENVIO',
    canal: 'DOMICILIO',
    estado: 'ACTIVO',
    origen: 'PEDIDO',
    estadoEntrega: 'PENDIENTE',
    estadoPago: 'PENDIENTE',
    items: [],
    cPacaAguaPed: 0, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
    cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
    precioPacaAgua: 0, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
    totalPagado: 0,
    total: 10000,
    saldo: 10000,
    fecha: new Date().toISOString(),
    ...overrides,
  }
}

function makePendingPedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    ...makeRealPedido(),
    id: 'offline-abc',
    numero: 0,
    nombreCli: 'Yenifer Aponte',
    items: [{ producto: 'PACA_AGUA', cantPedido: 2, cantEntrega: 0, precio: 0, subtotal: 0 }],
    _pendingSync: true,
    _pendingOfflineId: 'abc',
    ...overrides,
  }
}

// El componente renderiza vista desktop y mobile simultáneamente en jsdom
// (ambas viven en el DOM, la visibilidad es solo CSS) — se escopea a
// data-testid="pedidos-desktop" para evitar falsos "multiple elements
// found", mismo patrón que usan los E2E del repo (ver AGENTS.md #24).
function desktopScope() {
  return within(screen.getByTestId('pedidos-desktop'))
}

describe('PedidoTable — filas pendientes offline', () => {
  it('muestra una fila "Sincronizando…" para un pedido pendiente, sin reemplazar la lista real', () => {
    render(
      <PedidoTable
        pedidos={[makePendingPedido(), makeRealPedido()]}
        {...rowProps}
      />,
    )
    const desktop = desktopScope()
    expect(desktop.getByText('Yenifer Aponte')).toBeTruthy()
    expect(desktop.getByText(/Sin conexión/)).toBeTruthy()
    expect(desktop.getByText('Juan')).toBeTruthy()
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })

  it('un pedido pendiente solo (sin pedidos reales aún) NO dispara el empty state', () => {
    render(<PedidoTable pedidos={[makePendingPedido()]} {...rowProps} />)
    expect(screen.queryByTestId('empty-state')).toBeNull()
    expect(desktopScope().getByText(/Sin conexión/)).toBeTruthy()
  })

  it('muestra el motivo del rechazo y un botón Descartar para un pedido fallido (ej. límite de fiado)', () => {
    const onDiscardFailed = vi.fn()
    render(
      <PedidoTable
        pedidos={[makePendingPedido({ _pendingFailed: true, _pendingFailReason: 'El cliente ya debe 3 pedidos fiados' })]}
        onDiscardFailed={onDiscardFailed}
        {...rowProps}
      />,
    )
    const desktop = desktopScope()
    expect(desktop.getByText(/El cliente ya debe 3 pedidos fiados/)).toBeTruthy()
    fireEvent.click(desktop.getByText('Descartar'))
    expect(onDiscardFailed).toHaveBeenCalledWith('abc')
  })

  it('el conteo "Sin horario" no cuenta las filas pendientes (regresión pedidos.length - pinned.length)', () => {
    // 1 pendiente + 1 real sin horario + 1 real CON horario preferido.
    // Antes del fix, "Sin horario" se calculaba como pedidos.length (3) -
    // pinned.length (1) = 2, cuando el número correcto de reales sin
    // horario es 1 (el pendiente no debe contarse ahí).
    render(
      <PedidoTable
        pedidos={[
          makePendingPedido(),
          makeRealPedido({ id: 'p-sin-horario', horaPreferida: undefined }),
          makeRealPedido({ id: 'p-con-horario', horaPreferida: '10:00' }),
        ]}
        {...rowProps}
      />,
    )
    const desktop = desktopScope()
    expect(desktop.getByText('Sin horario (1)')).toBeTruthy()
    expect(desktop.getByText('Con horario preferido (1)')).toBeTruthy()
  })
})
