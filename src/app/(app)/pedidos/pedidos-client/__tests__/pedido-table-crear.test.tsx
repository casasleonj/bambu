// B-17 (#434): la lista vacía solo ofrece «Crear Pedido» a quien puede crear.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PedidoTable } from '../pedido-table'

vi.mock('@/components/empty-state', () => ({
  EmptyState: ({ title, actionLabel }: { title: string; actionLabel?: string }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      {actionLabel && <button data-testid="empty-action">{actionLabel}</button>}
    </div>
  ),
}))
vi.mock('@/components/money-display', () => ({ MoneyDisplay: ({ value }: { value: number }) => <span>{value}</span> }))
vi.mock('@/components/pedido-cliente-display', () => ({ PedidoClienteDisplay: ({ nombreCli }: { nombreCli: string }) => <span>{nombreCli}</span> }))

const base = {
  pedidos: [],
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
}

describe('PedidoTable — lista vacía según el rol (B-17)', () => {
  it('quien puede crear ve «+ Crear Pedido»', () => {
    render(<PedidoTable {...base} onCreateClick={vi.fn()} />)
    expect(screen.getAllByTestId('empty-action')[0]).toHaveTextContent('+ Crear Pedido')
  })

  it('quien no puede crear (sin onCreateClick) ve el mensaje pero no el botón', () => {
    render(<PedidoTable {...base} userRole="CONTADOR" />)
    expect(screen.getAllByTestId('empty-state').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('empty-action')).not.toBeInTheDocument()
  })
})
