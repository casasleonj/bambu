import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: vi.fn() }))
import { PedidoCambioCantidad } from '../pedido-cambio-cantidad'
import type { Pedido } from '../../pedidos-client/types'

const pedido = (over: Partial<Pedido> = {}): Pedido => ({
  id: 'p1', numero: 5, clienteId: 'c1', nombreCli: 'X', telefonoCli: '', zonaCli: '', barrioCli: '',
  tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'PENDIENTE', origen: 'PEDIDO', estadoEntrega: 'PENDIENTE', estadoPago: 'PARCIAL',
  items: [{ producto: 'PACA_AGUA', cantPedido: 12, cantEntrega: 0, precio: 2000, subtotal: 24000 }],
  cPacaAguaPed: 12, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 2000, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  totalPagado: 5000, total: 24000, saldo: 19000, fecha: '2026-09-08T08:00:00.000Z', ...over,
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, producto: 'PACA_AGUA', cantidadOriginal: 12, cantidadEntregada: 0, cantidadNueva: 12, delta: 0, precioHistorico: 2000, subtotalAntes: 24000, subtotalDespues: 24000, totalAntes: 24000, totalDespues: 24000, totalPagado: 5000, saldoAntes: 19000, saldoDespues: 19000, estadoEntrega: 'PENDIENTE', estadoPagoAntes: 'PARCIAL', estadoPagoDespues: 'PARCIAL', sobrepagoProyectado: 0, bloqueadoPor: null, warnings: [], allowedActions: [], puedeCorregir: false }) })))
})
afterEach(() => vi.unstubAllGlobals())

describe('PedidoCambioCantidad — contenedor G11 (Fase 6-i)', () => {
  it('no renderiza si el pedido no tiene items', () => {
    const { container } = render(<PedidoCambioCantidad pedido={pedido({ items: [] })} onMutado={vi.fn()} onNuevaDemanda={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('abrir → muestra el punto de decisión', () => {
    render(<PedidoCambioCantidad pedido={pedido()} onMutado={vi.fn()} onNuevaDemanda={vi.fn()} />)
    fireEvent.click(screen.getByTestId('cambio-cantidad-abrir'))
    expect(screen.getByTestId('cambio-cantidad-decision')).toBeInTheDocument()
  })

  it('elegir corrección → monta el formulario inline', async () => {
    render(<PedidoCambioCantidad pedido={pedido()} onMutado={vi.fn()} onNuevaDemanda={vi.fn()} />)
    fireEvent.click(screen.getByTestId('cambio-cantidad-abrir'))
    fireEvent.click(screen.getByTestId('cambio-causa-correccion'))
    await waitFor(() => expect(screen.getByTestId('correccion-cantidad-form')).toBeInTheDocument())
  })

  it('elegir nueva demanda → llama onNuevaDemanda y NO monta el formulario de corrección', () => {
    const onNuevaDemanda = vi.fn()
    render(<PedidoCambioCantidad pedido={pedido()} onMutado={vi.fn()} onNuevaDemanda={onNuevaDemanda} />)
    fireEvent.click(screen.getByTestId('cambio-cantidad-abrir'))
    fireEvent.click(screen.getByTestId('cambio-causa-nueva-demanda'))
    expect(onNuevaDemanda).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('correccion-cantidad-form')).not.toBeInTheDocument()
  })

  it('el botón se muestra también para pedidos cerrados (nueva demanda sigue válida; el guard explica la corrección)', () => {
    render(<PedidoCambioCantidad pedido={pedido({ estadoEntrega: 'ENTREGADO' })} onMutado={vi.fn()} onNuevaDemanda={vi.fn()} />)
    expect(screen.getByTestId('cambio-cantidad-abrir')).toBeInTheDocument()
  })
})
