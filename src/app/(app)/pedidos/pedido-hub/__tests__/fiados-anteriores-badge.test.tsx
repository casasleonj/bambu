import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { OperacionList } from '../operacion-list'
import type { Pedido } from '../../pedidos-client/types'

const p = (extra: Partial<Pedido> = {}): Pedido => ({
  id: 'p1', numero: 932, clienteId: 'cliente-a', nombreCli: 'Cliente de prueba', telefonoCli: '300',
  zonaCli: '', barrioCli: 'San José', tipo: 'DOMICILIO', canal: 'DOMICILIO',
  estado: 'PENDIENTE', origen: 'PEDIDO', estadoEntrega: 'PENDIENTE', estadoPago: 'PAGADO',
  items: [{ producto: 'PACA_AGUA', cantPedido: 3, cantEntrega: 0, precio: 3000, subtotal: 9000 }],
  cPacaAguaPed: 3, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0,
  cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0,
  cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 3000, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0,
  precioBolsaAgua: 0, precioBolsaHielo: 0,
  total: 9000, totalPagado: 9000, saldo: 0, fecha: '2026-11-20T16:00:00Z',
  fiadosAnteriores: { total: 27000, pedidos: 2,
    productos: [{ producto: 'PACA_AGUA', cantidad: 8 }, { producto: 'PACA_HIELO', cantidad: 1 }],
    negocios: ['Tienda A', 'Tienda B'] },
  ...extra,
})

const consulta = { userRole: 'ADMIN', gestionDirecta: true, volver: '/pedidos',
  onVerPedido: vi.fn(), onVerFactura: vi.fn() }

describe('#932 badge de fiados anteriores del cliente', () => {
  it.each(['desktop', 'mobile'] as const)('lista General %s: muestra el aviso aunque el pedido actual esté pagado, sin abrirlo al tocar', viewport => {
    const onOpen = vi.fn()
    render(<OperacionList pedidos={[p()]} viewport={viewport} hoyBogota="2026-11-20"
      onOpen={onOpen} onAccion={vi.fn()} consulta={consulta} />)
    const fila = screen.getByTestId('operacion-row-p1')
    const badge = within(fila).getByTestId('fiados-anteriores-p1')
    expect(within(badge).getByText('Fiados anteriores')).toBeInTheDocument()
    expect(badge.textContent).toContain('27.000')
    expect(badge.textContent).toContain('8')
    expect(badge.textContent).toContain('Tienda A')
    expect(badge.textContent).toContain('Tienda B')
    expect(within(badge).getByRole("link", { name: "Ver fiados del cliente" }))
      .toHaveAttribute("href", "/pedidos?tab=fiados&fiadosCliente=cliente-a")
    expect(badge.textContent).toContain('no unidades individuales sin pagar')
    fireEvent.click(within(badge).getByText('Fiados anteriores'))
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.keyDown(within(badge).getByText('Fiados anteriores'), { key: 'Enter' })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('no crea un indicador nuevo cuando solo hay fiado propio o no existe deuda anterior', () => {
    render(<OperacionList pedidos={[p({ fiadosAnteriores: undefined })]} viewport="desktop"
      hoyBogota="2026-11-20" onOpen={vi.fn()} onAccion={vi.fn()} consulta={consulta} />)
    expect(screen.queryByTestId('fiados-anteriores-p1')).not.toBeInTheDocument()
  })

  it.each(['desktop', 'mobile'] as const)('la vista operativa previa %s conserva el aviso con los mismos datos', viewport => {
    render(<OperacionList pedidos={[p()]} viewport={viewport}
      hoyBogota="2026-11-20" onOpen={vi.fn()} onAccion={vi.fn()} />)
    expect(screen.getByTestId('fiados-anteriores-p1')).toHaveTextContent('Cobro de pedidos anteriores')
  })
})
