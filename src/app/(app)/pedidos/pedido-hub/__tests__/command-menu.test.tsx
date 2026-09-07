import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PedidoCommandMenu } from '../command-menu'
import type { Pedido } from '../../pedidos-client/types'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const pedido = (): Pedido => ({
  id: 'p1', numero: 7, clienteId: 'c1', nombreCli: 'X', telefonoCli: '',
  zonaCli: '', barrioCli: '', tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'EN_RUTA',
  origen: 'PEDIDO', estadoEntrega: 'EN_RUTA', estadoPago: 'PENDIENTE', items: [],
  cPacaAguaPed: 0, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 0, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  totalPagado: 0, total: 100, saldo: 100, fecha: '2026-09-07T08:00:00.000Z',
})

const common = {
  hoyBogota: '2026-09-08', onNuevaOperacion: vi.fn(), onBuscarCliente: vi.fn(), onAccion: vi.fn(),
}

describe('PedidoCommandMenu', () => {
  it('cerrado por defecto; ⌘K lo abre', () => {
    render(<PedidoCommandMenu selected={null} {...common} />)
    expect(screen.queryByTestId('command-menu')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByTestId('command-menu')).toBeInTheDocument()
  })

  it('sin selección: comandos globales, "planificación" NAVEGA (href), no ejecuta', () => {
    render(<PedidoCommandMenu selected={null} {...common} />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.click(screen.getByTestId('command-planificacion'))
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/rutas\?fecha=/))
  })

  it('con selección: comando contextual dispara onAccion (abre el flujo, no muta)', () => {
    const onAccion = vi.fn()
    render(<PedidoCommandMenu selected={pedido()} {...common} onAccion={onAccion} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.click(screen.getByTestId('command-accion-registrar-entrega'))
    expect(onAccion).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'registrar-entrega')
  })

  it('navegación por teclado: ↓ mueve el cursor, Enter activa', () => {
    render(<PedidoCommandMenu selected={null} {...common} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = screen.getByTestId('command-menu-input')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // segundo item global = "Buscar cliente…"
    expect(common.onBuscarCliente).toHaveBeenCalled()
  })

  it('filtra por texto', () => {
    render(<PedidoCommandMenu selected={null} {...common} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.change(screen.getByTestId('command-menu-input'), { target: { value: 'cartera' } })
    expect(screen.getByTestId('command-cartera')).toBeInTheDocument()
    expect(screen.queryByTestId('command-nueva')).not.toBeInTheDocument()
  })

  it('Escape cierra', () => {
    render(<PedidoCommandMenu selected={null} {...common} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('command-menu')).not.toBeInTheDocument()
  })
})
