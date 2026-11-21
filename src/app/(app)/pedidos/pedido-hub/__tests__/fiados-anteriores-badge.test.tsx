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
  fiadosAnteriores: { total: 27000, propio: 0, totalCliente: 27000, pedidos: 2, pagoPorConfirmar: false,
    origenes: [{ numero: 150, negocio: 'Tienda A', importe: 20000 }, { numero: 151, negocio: 'Tienda B', importe: 7000 }],
    productos: [{ producto: 'PACA_AGUA', cantidad: 8 }, { producto: 'PACA_HIELO', cantidad: 1 }],
    negocios: ['Tienda A', 'Tienda B'] },
  ...extra,
})

const consulta = { userRole: 'ADMIN', gestionDirecta: true, volver: '/pedidos',
  onVerPedido: vi.fn(), onVerFactura: vi.fn() }

describe('#932 badge de otros cobros pendientes del cliente', () => {
  it.each(['desktop', 'mobile'] as const)('lista General %s: muestra el aviso aunque el pedido actual esté pagado, sin abrirlo al tocar', viewport => {
    const onOpen = vi.fn()
    render(<OperacionList pedidos={[p()]} viewport={viewport} hoyBogota="2026-11-20"
      onOpen={onOpen} onAccion={vi.fn()} consulta={consulta} />)
    const fila = screen.getByTestId('operacion-row-p1')
    const badge = within(fila).getByTestId('fiados-anteriores-p1')
    expect(within(badge).getByText('Cobro pendiente')).toBeInTheDocument()
    expect(badge.textContent).toContain('27.000')
    expect(badge.textContent).toContain('8')
    expect(badge.textContent).toContain('Tienda A')
    expect(badge.textContent).toContain('Tienda B')
    expect(within(badge).getByRole("link", { name: "Ver fiados del cliente", hidden: true }))
      .toHaveAttribute("href", "/pedidos?tab=fiados&fiadosCliente=cliente-a")
    expect(badge.textContent).toContain('no unidades individuales sin pagar')
    fireEvent.click(within(badge).getByText('Cobro pendiente'))
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.keyDown(within(badge).getByText('Cobro pendiente'), { key: 'Enter' })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('distingue importe propio, otros pedidos y total de titular sin duplicar', () => {
    render(<OperacionList pedidos={[p({ fiadosAnteriores: {
      total: 15000, propio: 5000, totalCliente: 20000, pedidos: 1,
      productos: [{ producto: 'PACA_AGUA', cantidad: 5 }],
      negocios: ['Tienda B'], origenes: [{ numero: 150, negocio: 'Tienda B', importe: 15000 }],
      pagoPorConfirmar: true,
    } })]} viewport="mobile" hoyBogota="2026-11-20"
      onOpen={vi.fn()} onAccion={vi.fn()} consulta={consulta} />)
    const badge = screen.getByTestId('fiados-anteriores-p1')
    expect(badge).toHaveTextContent('Cobro pendiente')
    expect(badge).toHaveTextContent('15.000')
    expect(badge).toHaveTextContent('5.000')
    expect(badge).toHaveTextContent('20.000')
    expect(badge).toHaveTextContent('Pedido #150')
    expect(badge).toHaveTextContent('Tienda B')
    expect(badge).toHaveTextContent('reportado por confirmar')
  })

  it('si falla la consulta muestra aviso de verificación, no deuda cero', () => {
    render(<OperacionList pedidos={[p({ fiadosAnteriores: undefined, fiadosConsultaError: true })]}
      viewport="desktop" hoyBogota="2026-11-20" onOpen={vi.fn()}
      onAccion={vi.fn()} consulta={consulta} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cobros sin verificar')
    expect(screen.queryByText('Cobro pendiente')).not.toBeInTheDocument()
  })

  it('no crea un indicador nuevo cuando solo hay fiado propio o no existe otra deuda', () => {
    render(<OperacionList pedidos={[p({ fiadosAnteriores: undefined })]} viewport="desktop"
      hoyBogota="2026-11-20" onOpen={vi.fn()} onAccion={vi.fn()} consulta={consulta} />)
    expect(screen.queryByTestId('fiados-anteriores-p1')).not.toBeInTheDocument()
  })

  it.each(['desktop', 'mobile'] as const)('la vista operativa previa %s conserva el aviso con los mismos datos', viewport => {
    render(<OperacionList pedidos={[p()]} viewport={viewport}
      hoyBogota="2026-11-20" onOpen={vi.fn()} onAccion={vi.fn()} />)
    expect(screen.getByTestId('fiados-anteriores-p1')).toHaveTextContent('Otros pedidos con cobro pendiente')
  })
})
