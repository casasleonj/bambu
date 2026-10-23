// @tests #447 Fase A — tarjeta de pedido del cierre V2: entrega derivada, decisión obligatoria, dinero.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { useState } from 'react'
import { PedidoCuadreV2 } from '../pedido-cuadre-v2'
import { entregaCompleta } from '../cierre-logic'
import type { Pedido, CuadrePedido, PagoItem } from '../types'

vi.mock('@/components/pedido-cliente-display', () => ({
  PedidoClienteDisplay: ({ nombreCli }: { nombreCli: string }) => <span>{nombreCli}</span>,
}))

const pedido: Pedido = {
  id: 'p1', numero: 11, clienteId: 'c1', nombreCli: 'Carlos', apellidoCli: 'Gómez', cliente: { id: 'c1', nombre: 'Carlos', telefono: '300' },
  tipo: 'DOMICILIO',
  cPacaAguaPed: 10, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 2300, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  total: 23000, totalPagado: 3000, saldo: 20000,
}

function Harness({ onCuadre }: { onCuadre?: (c: CuadrePedido) => void }) {
  const [c, setC] = useState<CuadrePedido>({
    pedidoId: 'p1', entregado: 'COMPLETO', productosEntregados: entregaCompleta(pedido),
    preciosReales: { pacaAgua: 2300, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 },
    pagado: 'PARCIAL', pagos: [],
  })
  // Actualizaciones funcionales, igual que el padre real (varias seguidas en un mismo evento).
  const set = (fn: (prev: CuadrePedido) => CuadrePedido) =>
    setC((prev) => {
      const next = fn(prev)
      onCuadre?.(next)
      return next
    })
  return (
    <PedidoCuadreV2
      pedido={pedido}
      cuadre={c}
      embarquesAbiertos={[]}
      onUpdateCuadre={(_, u) => set((p) => ({ ...p, ...u }))}
      onUpdateProductoEntregado={(_, f, v) => set((p) => ({ ...p, productosEntregados: { ...p.productosEntregados, [f]: v } }))}
      onAgregarPago={() => set((p) => ({ ...p, pagos: [...p.pagos, { metodo: 'EFECTIVO', monto: 0 } as PagoItem] }))}
      onEliminarPago={(_, i) => set((p) => ({ ...p, pagos: p.pagos.filter((_x, k) => k !== i) }))}
      onUpdatePago={(_, i, f, v) => set((p) => ({ ...p, pagos: p.pagos.map((x, k) => (k === i ? { ...x, [f]: v } : x)) }))}
    />
  )
}

describe('PedidoCuadreV2', () => {
  it('arranca completo, sin decisión pendiente y con el dinero explicado', () => {
    render(<Harness />)
    expect(screen.getByTestId('estado-derivado')).toHaveTextContent('Completo')
    expect(screen.queryByTestId('decision-pendiente')).toBeNull()
    expect(screen.getByTestId('queda-por-cobrar')).toHaveTextContent(/fiado de Carlos Gómez/)
  })

  it('al bajar la cantidad el estado pasa a Parcial y exige decidir qué pasa con lo que falta', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Entrega ahora Paca de agua'), { target: { value: '5' } })
    expect(screen.getByTestId('estado-derivado')).toHaveTextContent('Parcial · faltan 5')
    const decision = screen.getByTestId('decision-pendiente')
    expect(within(decision).getByText('Elige una opción para continuar.')).toBeInTheDocument()
    expect(decision).toHaveTextContent('Pendiente de autorización en oficina')
    fireEvent.click(within(decision).getByLabelText(/Otra visita/))
    expect(within(screen.getByTestId('decision-pendiente')).queryByText('Elige una opción para continuar.')).toBeNull()
  })

  it('el campo no deja pasar del pendiente (el exceso es venta libre)', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Entrega ahora Paca de agua'), { target: { value: '15' } })
    expect(screen.getByLabelText('Entrega ahora Paca de agua')).toHaveValue(10)
    expect(screen.getByLabelText('Más Paca de agua')).toBeDisabled()
  })

  it('volver a la cantidad completa limpia la decisión', () => {
    const vistos: CuadrePedido[] = []
    render(<Harness onCuadre={(c) => vistos.push(c)} />)
    fireEvent.change(screen.getByLabelText('Entrega ahora Paca de agua'), { target: { value: '5' } })
    fireEvent.click(screen.getByLabelText(/Otra visita/))
    fireEvent.click(screen.getByText('Entregué todo'))
    expect(vistos.at(-1)?.decisionPendiente).toBeUndefined()
    expect(screen.queryByTestId('decision-pendiente')).toBeNull()
  })

  it('«Cobrar el saldo» llena lo que falta y deja «Pagado completo»; un cobro de más avisa', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('cobrar-saldo'))
    expect(screen.getByLabelText('Monto cobrado')).toHaveValue(20000)
    expect(screen.getByTestId('queda-por-cobrar')).toHaveTextContent('Pagado completo')
    fireEvent.change(screen.getByLabelText('Monto cobrado'), { target: { value: '25000' } })
    expect(screen.getByTestId('cobro-excede')).toBeInTheDocument()
  })

  it('«No entregué nada» oculta el panel de dinero', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('No entregué nada'))
    expect(screen.getByTestId('estado-derivado')).toHaveTextContent('No entregado')
    expect(screen.queryByTestId('panel-dinero')).toBeNull()
  })
})
