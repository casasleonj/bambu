import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { OperacionList } from '../operacion-list'
import type { Pedido } from '../../pedidos-client/types'

const p = (over: Partial<Pedido>): Pedido => ({
  id: 'p1', numero: 101, clienteId: 'c1', nombreCli: 'Tienda La Esquina', telefonoCli: '300',
  zonaCli: '', barrioCli: '', tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'EN_RUTA',
  origen: 'PEDIDO', estadoEntrega: 'EN_RUTA', estadoPago: 'PENDIENTE',
  items: [{ producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 0, precio: 2300, subtotal: 46000 }],
  cPacaAguaPed: 20, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 2300, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  totalPagado: 0, total: 46000, saldo: 46000, fecha: '2026-09-07T08:00:00.000Z', ...over,
})

const common = { hoyBogota: '2026-09-07', onAccion: vi.fn(), onOpen: vi.fn() }

describe('OperacionList', () => {
  it('desktop: tabla con microcopy de estado (no badges apilados) + acción destacada', () => {
    render(<OperacionList pedidos={[p({})]} viewport="desktop" {...common} />)
    const tabla = screen.getByTestId('pedido-hub-desktop')
    expect(within(tabla).getByText('En ruta')).toBeInTheDocument()
    expect(within(tabla).getByRole('button', { name: 'Registrar entrega' })).toBeInTheDocument()
    expect(within(tabla).queryByText('PEDIDO')).not.toBeInTheDocument()
  })

  it('origen ≠ PEDIDO muestra chip discreto', () => {
    render(<OperacionList pedidos={[p({ origen: 'VENTA_RAPIDA' })]} viewport="desktop" {...common} />)
    expect(screen.getByText(/Venta R[aá]pida/i)).toBeInTheDocument()
  })

  it('mobile: tarjetas (sin <table>), data-testid pedido-hub-mobile', () => {
    render(<OperacionList pedidos={[p({})]} viewport="mobile" {...common} />)
    expect(screen.getByTestId('pedido-hub-mobile')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('clic en la acción destacada llama onAccion(pedido, key)', () => {
    const onAccion = vi.fn()
    render(<OperacionList pedidos={[p({})]} viewport="desktop" {...common} onAccion={onAccion} />)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrega' }))
    expect(onAccion).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'registrar-entrega')
  })

  it('clic en la fila llama onOpen(pedido) (no dispara la acción)', () => {
    const onOpen = vi.fn()
    const onAccion = vi.fn()
    render(<OperacionList pedidos={[p({})]} viewport="desktop" {...common} onOpen={onOpen} onAccion={onAccion} />)
    fireEvent.click(screen.getByTestId('operacion-row-p1'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
    expect(onAccion).not.toHaveBeenCalled()
  })

  it('empty state cuando no hay pedidos', () => {
    render(<OperacionList pedidos={[]} viewport="desktop" {...common} />)
    expect(screen.getByText(/[Nn]o hay operaciones/)).toBeInTheDocument()
  })

  it('resumen de items visible (columna "Qué")', () => {
    render(<OperacionList pedidos={[p({})]} viewport="desktop" {...common} />)
    expect(screen.getByText(/20 /)).toBeInTheDocument()
  })
})
