import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PeekRelaciones } from '../peek-relaciones'
import type { Pedido } from '../../pedidos-client/types'
import type { PeekLayer2 } from '../peek-cache'

const pedido = (over: Partial<Pedido> = {}): Pedido => ({
  id: 'p1', numero: 98, clienteId: 'c1', nombreCli: 'X', telefonoCli: '', zonaCli: '', barrioCli: '',
  tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'PENDIENTE', origen: 'PEDIDO', estadoEntrega: 'PENDIENTE', estadoPago: 'PARCIAL',
  items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 0, precio: 2000, subtotal: 20000 }],
  cPacaAguaPed: 10, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 2000, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  totalPagado: 5000, total: 20000, saldo: 15000, fecha: '2026-09-08T08:00:00.000Z', ...over,
})

const layer2 = (over: Partial<PeekLayer2> = {}): PeekLayer2 => ({
  pendienteN2: null, embarqueResumen: null, pedidosVinculados: [], casosAbiertos: [], ...over,
} as PeekLayer2)

describe('PeekRelaciones — vínculo G11 (Fase 6-iii)', () => {
  it('desde el pedido ORIGINAL: muestra la nueva demanda con rol "demanda"', () => {
    render(<PeekRelaciones pedido={pedido()} data={layer2({
      pedidosVinculados: [{ id: 'p2', numero: 124, rol: 'demanda', total: 10000, estadoEntrega: 'PENDIENTE' }],
    })} onOpenVinculado={vi.fn()} />)
    const link = screen.getByTestId('peek-rel-vinculado-p2')
    expect(link).toHaveTextContent('Nueva demanda: #124')
  })

  it('desde la NUEVA DEMANDA: muestra el pedido origen con rol "origen"', () => {
    render(<PeekRelaciones pedido={pedido({ id: 'p2', numero: 124 })} data={layer2({
      pedidosVinculados: [{ id: 'p1', numero: 98, rol: 'origen', total: 20000, estadoEntrega: 'PENDIENTE' }],
    })} onOpenVinculado={vi.fn()} />)
    expect(screen.getByTestId('peek-rel-vinculado-p1')).toHaveTextContent('Origen: #98')
  })

  it('click en un vinculado → onOpenVinculado con su id (acceso, no fusión)', () => {
    const onOpenVinculado = vi.fn()
    render(<PeekRelaciones pedido={pedido()} data={layer2({
      pedidosVinculados: [{ id: 'p2', numero: 124, rol: 'demanda', total: 10000, estadoEntrega: 'PENDIENTE' }],
    })} onOpenVinculado={onOpenVinculado} />)
    fireEvent.click(screen.getByTestId('peek-rel-vinculado-p2'))
    expect(onOpenVinculado).toHaveBeenCalledWith('p2')
  })

  it('"Cambiar cantidades" (G11) sólo si puedeAjustar + onMutadoN2 + onAccionN2', () => {
    const { rerender } = render(<PeekRelaciones pedido={pedido()} data={layer2()} onOpenVinculado={vi.fn()} />)
    expect(screen.queryByTestId('pedido-cambio-cantidad')).not.toBeInTheDocument()
    rerender(<PeekRelaciones pedido={pedido()} data={layer2()} onOpenVinculado={vi.fn()} puedeAjustar onMutadoN2={vi.fn()} onAccionN2={vi.fn()} />)
    expect(screen.getByTestId('pedido-cambio-cantidad')).toBeInTheDocument()
  })
})
