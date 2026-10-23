// @tests #326 — el aviso de corrección de precio en el cierre dice la verdad:
// nuevo total y saldo, motivo obligatorio y bloqueo claro si el cliente ya pagó de más.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/hooks/use-productos-domicilio', () => ({
  useProductosDomicilio: () => ({
    productos: [{ codigo: 'PACA_AGUA' }, { codigo: 'PACA_HIELO' }, { codigo: 'BOTELLON' }, { codigo: 'BOLSA_AGUA' }, { codigo: 'BOLSA_HIELO' }],
  }),
}))
vi.mock('@/components/pedido-cliente-display', () => ({ PedidoClienteDisplay: () => <span>cliente</span> }))

import { PedidoCuadre } from '../pedido-cuadre'
import type { CuadrePedido, Pedido } from '../types'

const pedido = (over: Partial<Pedido> = {}): Pedido => ({
  id: 'p1', numero: 7, clienteId: 'c1', nombreCli: 'Marta', cliente: {} as Pedido['cliente'], tipo: 'ENVIO',
  cPacaAguaPed: 10, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 1000, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  total: 10000, totalPagado: 0, saldo: 10000,
  ...over,
} as Pedido)

const cuadre = (precioPaca: number, over: Partial<CuadrePedido> = {}): CuadrePedido => ({
  pedidoId: 'p1', entregado: 'COMPLETO',
  productosEntregados: { cPacaAguaEnt: 10, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
  preciosReales: { pacaAgua: precioPaca, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 },
  pagado: 'NO_PAGADO', pagos: [],
  ...over,
})

const texto = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, '') // formatCurrency usa un espacio tras el $

function montar(p: Pedido, c: CuadrePedido, isAdmin = true) {
  const onUpdateCuadre = vi.fn()
  render(
    <PedidoCuadre
      pedido={p} cuadre={c} embarquesAbiertos={[]} isAdmin={isAdmin}
      onUpdateCuadre={onUpdateCuadre} onUpdateProductoEntregado={vi.fn()} onUpdatePrecioReal={vi.fn()}
      onAgregarPago={vi.fn()} onEliminarPago={vi.fn()} onUpdatePago={vi.fn()}
    />,
  )
  return { onUpdateCuadre }
}

describe('PedidoCuadre — corrección de precio (#326)', () => {
  it('sin cambio de precio no hay aviso', () => {
    montar(pedido(), cuadre(1000))
    expect(screen.queryByTestId('correccion-precio-aviso')).toBeNull()
  })

  it('precio vacío (0) no cuenta como corrección', () => {
    montar(pedido(), cuadre(0))
    expect(screen.queryByTestId('correccion-precio-aviso')).toBeNull()
  })

  it('al subir el precio muestra el nuevo total y saldo, y pide el motivo', () => {
    const { onUpdateCuadre } = montar(pedido(), cuadre(1100))
    const aviso = screen.getByTestId('correccion-precio-aviso')
    expect(texto(aviso)).toContain('$10.000')
    expect(texto(aviso)).toContain('$11.000')
    const motivo = screen.getByTestId('motivo-precio-p1')
    fireEvent.change(motivo, { target: { value: 'Acuerdo en la puerta' } })
    expect(onUpdateCuadre).toHaveBeenCalledWith('p1', { motivoPrecio: 'Acuerdo en la puerta' })
  })

  it('el saldo nuevo descuenta lo ya pagado', () => {
    montar(pedido({ totalPagado: 4000, saldo: 6000 }), cuadre(900))
    const aviso = screen.getByTestId('correccion-precio-aviso')
    expect(texto(aviso)).toContain('$9.000')
    expect(texto(aviso)).toContain('$5.000')
  })

  it('si el cliente ya pagó más que el nuevo total, lo dice y no ofrece el motivo', () => {
    montar(pedido({ totalPagado: 10000, saldo: 0 }), cuadre(900))
    expect(screen.getByTestId('correccion-precio-aviso').textContent).toContain('No se puede cerrar así')
    expect(screen.queryByTestId('motivo-precio-p1')).toBeNull()
  })

  it('quien no es ADMIN no ve el aviso', () => {
    montar(pedido(), cuadre(1100), false)
    expect(screen.queryByTestId('correccion-precio-aviso')).toBeNull()
  })
})
