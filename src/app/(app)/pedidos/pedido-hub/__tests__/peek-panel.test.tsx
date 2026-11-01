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
    expect(within(screen.getByTestId('peek-importes')).getByText(/23\.000/)).toBeInTheDocument()
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
    // Fase 5-i: el stub `peek-rel-pendiente-n2` fue reemplazado por PedidoExceptionPanel.
    expect(screen.getByTestId('pedido-exception-panel')).toBeInTheDocument()
  })

  it('distingue saldo de la operación de la cartera del cliente', () => {
    render(<PeekPanel pedido={pedido()} layer2={layer2()} loadingLayer2={false} errorLayer2={false} {...common} />)
    const rel = screen.getByTestId('peek-relaciones')
    expect(within(rel).getByText('Saldo de esta operación')).toBeInTheDocument()
    expect(within(rel).getByText('Cartera del cliente')).toBeInTheDocument()
  })

  it('#538 los productos salen una sola vez y para todos los roles, sin esperar a la capa 2', () => {
    render(<PeekPanel pedido={pedido()} layer2={null} loadingLayer2 errorLayer2={false} {...common} userRole="REPARTIDOR" />)
    const prod = screen.getByTestId('peek-productos')
    expect(within(prod).getAllByTestId('peek-producto-linea')).toHaveLength(1)
    expect(within(prod).getByTestId('peek-producto-linea')).toHaveTextContent('10 pedidas y entregadas')
    // «Qué» y «Productos» sueltos ya no existen (repetían lo mismo)
    expect(screen.queryByText('Qué')).not.toBeInTheDocument()
    expect(screen.queryByTestId('peek-items-desglose')).not.toBeInTheDocument()
  })

  it('#538 entrega parcial: la misma frase que la consulta, dentro de la tarjeta de productos', () => {
    const p = pedido({
      estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE', totalPagado: 0, saldo: 23000,
      items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 6, precio: 2300, subtotal: 23000 }],
      cPacaAguaEnt: 6,
    })
    render(<PeekPanel pedido={p} layer2={null} loadingLayer2 errorLayer2={false} {...common} />)
    expect(screen.getByTestId('peek-producto-linea')).toHaveTextContent('10 pedidas · 6 entregadas · 4 por entregar')
    expect(within(screen.getByTestId('peek-pills')).getByText('◐ Entrega parcial')).toBeInTheDocument()
  })

  it('#538 anulado: sin pago por confirmar, sin acción principal y con «pedido anulado»', () => {
    const p = pedido({ estadoEntrega: 'ANULADO', estado: 'ANULADO', pagoReportadoPendiente: true, saldo: 0, totalPagado: 0 })
    render(<PeekPanel pedido={p} layer2={null} loadingLayer2 errorLayer2={false} {...common} />)
    expect(screen.getByTestId('peek-producto-linea')).toHaveTextContent('pedido anulado')
    expect(screen.queryByText('Pago por confirmar')).not.toBeInTheDocument()
  })

  it('#538 mismo diseño que la consulta: canal, pago, creador y «Ver pedido #N»', () => {
    render(<PeekPanel pedido={pedido({ creadoPor: 'Yamile' })} layer2={null} loadingLayer2 errorLayer2={false} {...common} />)
    const pills = screen.getByTestId('peek-pills')
    expect(within(pills).getByText('🚚 Domicilio')).toBeInTheDocument()
    expect(within(pills).getByText('✓ Entregado')).toBeInTheDocument()
    expect(within(pills).getByText('Pago parcial')).toBeInTheDocument()
    expect(screen.getByTestId('peek-creacion')).toHaveTextContent('Creado por Yamile')
    expect(screen.getByTestId('peek-ver-detalle-completo')).toHaveTextContent('Ver pedido #55')
  })

  it('#538 «Ver factura» solo con acciones de consulta y permiso', () => {
    const p = pedido({ factura: { id: 'f1', numero: 'F-1', estado: 'PENDIENTE' } })
    const acciones = { userRole: 'ADMIN', gestionDirecta: false, volver: '/pedidos', onVerPedido: vi.fn(), onVerFactura: vi.fn() }
    const { rerender } = render(<PeekPanel pedido={p} layer2={null} loadingLayer2 errorLayer2={false} {...common} />)
    expect(screen.queryByTestId('peek-ver-factura')).not.toBeInTheDocument()
    rerender(<PeekPanel pedido={p} layer2={null} loadingLayer2 errorLayer2={false} {...common} acciones={acciones} />)
    fireEvent.click(screen.getByTestId('peek-ver-factura'))
    expect(acciones.onVerFactura).toHaveBeenCalledWith(p)
    rerender(<PeekPanel pedido={p} layer2={null} loadingLayer2 errorLayer2={false} {...common} acciones={{ ...acciones, userRole: 'REPARTIDOR' }} />)
    expect(screen.queryByTestId('peek-ver-factura')).not.toBeInTheDocument()
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
    // en móvil no hay ↑/↓ (solo el ✕)
    expect(screen.queryByLabelText('Anterior')).not.toBeInTheDocument()
  })

  it('#538 mobile: tocar el fondo o deslizar hacia abajo cierra; un toque corto no', () => {
    const onClose = vi.fn()
    render(<PeekPanel pedido={pedido()} layer2={layer2()} loadingLayer2={false} errorLayer2={false} {...common} viewport="mobile" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('peek-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
    const grab = screen.getByTestId('peek-grab')
    fireEvent.touchStart(grab, { touches: [{ clientY: 100 }] })
    fireEvent.touchEnd(grab, { changedTouches: [{ clientY: 120 }] })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.touchStart(grab, { touches: [{ clientY: 100 }] })
    fireEvent.touchEnd(grab, { changedTouches: [{ clientY: 200 }] })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('#538 desktop: no hay fondo atenuado ni asa', () => {
    render(<PeekPanel pedido={pedido()} layer2={layer2()} loadingLayer2={false} errorLayer2={false} {...common} />)
    expect(screen.queryByTestId('peek-backdrop')).not.toBeInTheDocument()
    expect(screen.queryByTestId('peek-grab')).not.toBeInTheDocument()
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
