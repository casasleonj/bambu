import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { PeekPanel } from '../peek-panel'
import type { Pedido } from '../../pedidos-client/types'
import type { PeekLayer2 } from '../peek-cache'

const pedido = (over: Partial<Pedido> = {}): Pedido => ({
  id: 'p1', numero: 55, clienteId: 'c1', nombreCli: 'Tienda X', telefonoCli: '',
  zonaCli: '', barrioCli: '', tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'ENTREGADO',
  origen: 'PEDIDO', estadoEntrega: 'ENTREGADO', estadoPago: 'PARCIAL',
  items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 10, precio: 2300, subtotal: 23000 }],
  cPacaAguaPed: 10, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 10, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 2300, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  totalPagado: 10000, total: 23000, saldo: 13000, fecha: '2026-09-05T08:00:00.000Z', ...over,
})

const layer2 = (over: Partial<PeekLayer2> = {}): PeekLayer2 => ({
  pendienteN2: null, embarqueResumen: null, pedidosVinculados: [], casosAbiertos: [], ...over,
} as PeekLayer2)

const common = {
  viewport: 'desktop' as const, userRole: 'ADMIN', hoyBogota: '2026-09-08',
  onClose: vi.fn(), onNav: vi.fn(), onAccion: vi.fn(), onOpenVinculado: vi.fn(),
}

describe('PeekPanel', () => {
  it('capa 1: total, pagado, qué, acción destacada — sin layer2', () => {
    render(<PeekPanel pedido={pedido()} layer2={null} loadingLayer2 errorLayer2={false} {...common} />)
    expect(screen.getByTestId('peek-desktop')).toBeInTheDocument()
    expect(screen.getByText('$23.000')).toBeInTheDocument()
    expect(screen.getByTestId('peek-accion-destacada')).toHaveTextContent('Registrar pago')
    expect(screen.getByTestId('peek-layer2-loading')).toBeInTheDocument()
  })

  it('capa 2: relaciones (embarque/factura/cartera/vinculados/N2)', () => {
    const p = pedido({ factura: { id: 'f1', numero: 'F-1', estado: 'PENDIENTE' } })
    const l2 = layer2({
      embarqueResumen: { id: 'e1', numeroDia: 3, estado: 'EN_RUTA', repartidor: 'Juan' },
      pedidosVinculados: [{ id: 'p9', numero: 99, rol: 'demanda', total: 5000, estadoEntrega: 'PENDIENTE' }],
      pendienteN2: { id: 'o1', producto: 'PACA_AGUA', remanente: 3, estado: 'ABIERTA', actividades: [] },
    })
    render(<PeekPanel pedido={p} layer2={l2} loadingLayer2={false} errorLayer2={false} {...common} />)
    expect(screen.getByTestId('peek-rel-embarque')).toBeInTheDocument()
    expect(screen.getByTestId('peek-rel-factura')).toBeInTheDocument()
    expect(screen.getByTestId('peek-rel-cartera')).toBeInTheDocument()
    expect(screen.getByTestId('peek-rel-vinculado-p9')).toBeInTheDocument()
    expect(screen.getByTestId('peek-rel-pendiente-n2')).toBeInTheDocument()
  })

  it('distingue saldo de la operación de la cartera del cliente', () => {
    render(<PeekPanel pedido={pedido()} layer2={layer2()} loadingLayer2={false} errorLayer2={false} {...common} />)
    const rel = screen.getByTestId('peek-relaciones')
    expect(within(rel).getByText('Saldo de esta operación')).toBeInTheDocument()
    expect(within(rel).getByText('Cartera del cliente')).toBeInTheDocument()
  })

  it('precio-origen / desglose oculto para roles sin permiso', () => {
    const { rerender } = render(<PeekPanel pedido={pedido()} layer2={layer2()} loadingLayer2={false} errorLayer2={false} {...common} userRole="REPARTIDOR" />)
    expect(screen.queryByTestId('peek-items-desglose')).not.toBeInTheDocument()
    rerender(<PeekPanel pedido={pedido()} layer2={layer2()} loadingLayer2={false} errorLayer2={false} {...common} userRole="ADMIN" />)
    expect(screen.getByTestId('peek-items-desglose')).toBeInTheDocument()
  })

  it('Escape cierra; flechas navegan', () => {
    const onClose = vi.fn(); const onNav = vi.fn()
    render(<PeekPanel pedido={pedido()} layer2={layer2()} loadingLayer2={false} errorLayer2={false} {...common} onClose={onClose} onNav={onNav} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(onNav).toHaveBeenCalledWith('next')
  })

  it('mobile: bottom sheet (peek-mobile)', () => {
    render(<PeekPanel pedido={pedido()} layer2={layer2()} loadingLayer2={false} errorLayer2={false} {...common} viewport="mobile" />)
    expect(screen.getByTestId('peek-mobile')).toBeInTheDocument()
  })

  it('deep-link al detalle completo sigue disponible', () => {
    render(<PeekPanel pedido={pedido()} layer2={layer2()} loadingLayer2={false} errorLayer2={false} {...common} />)
    expect(screen.getByTestId('peek-ver-detalle-completo')).toHaveAttribute('href', '/pedidos/p1')
  })

  it('error de capa 2: mensaje, no rompe el peek', () => {
    render(<PeekPanel pedido={pedido()} layer2={null} loadingLayer2={false} errorLayer2 {...common} />)
    expect(screen.getByTestId('peek-layer2-error')).toBeInTheDocument()
    expect(screen.getByTestId('peek-accion-destacada')).toBeInTheDocument()
  })
})
