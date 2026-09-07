// @tests Fase 3c del rediseño de Pedidos (docs/pedidos/00-plan-frontend-rediseno-integral.md):
// tercera y última extracción planeada del monolito pedido-form-unified/index.tsx
// hacia un componente ALS (PedidoItemEditor, §5). Es la pieza de mayor
// riesgo del conjunto (cada cambio de cantidad dispara el debounce+fetch de
// `resolverPrecios` en el padre) — por eso, igual que PedidoContextPanel
// (3b), se mantiene "lift state up": este componente recibe items YA
// resueltos + callbacks, cero fetch/timers propios. Estos tests verifican
// que el editor renderiza los valores recibidos y delega cada acción al
// callback correcto — nunca que gestiona debounce o resuelve precios (no
// lo hace, por diseño).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PedidoItemEditor, type PedidoItemEditorItem } from '../pedido-item-editor'

function makeItem(overrides: Partial<PedidoItemEditorItem> = {}): PedidoItemEditorItem {
  return {
    prodId: 'pacaAgua',
    cantidad: 0,
    precio: 10000,
    precioBase: 10000,
    precioManual: undefined,
    precioOrigen: 'base',
    tiers: [],
    precioBajoConfirmado: false,
    ...overrides,
  }
}

function baseProps(items: PedidoItemEditorItem[] = [makeItem()]) {
  return {
    items,
    preciosLoading: false,
    onIncrement: vi.fn(),
    onDecrement: vi.fn(),
    onCantidadChange: vi.fn(),
    onPrecioManualChange: vi.fn(),
    onConfirmarPrecioBajo: vi.fn(),
  }
}

describe('PedidoItemEditor', () => {
  it('renderiza un producto por cada item recibido', () => {
    render(<PedidoItemEditor {...baseProps([makeItem({ prodId: 'pacaAgua' }), makeItem({ prodId: 'pacaHielo' })])} />)
    expect(screen.getByText('Paca de Agua (40u 300ml)')).toBeInTheDocument()
    expect(screen.getByText('Paca de Hielo (20u 600ml)')).toBeInTheDocument()
  })

  it('llama a onIncrement/onDecrement con el prodId correcto (nunca muta cantidad por sí mismo)', () => {
    const props = baseProps([makeItem({ prodId: 'pacaAgua', cantidad: 2 })])
    render(<PedidoItemEditor {...props} />)
    const buttons = screen.getAllByRole('button')
    // decrement es el primer botón, increment el segundo, dentro de la
    // fila de cantidad (no hay más botones para este item sin precio manual).
    fireEvent.click(buttons[0])
    expect(props.onDecrement).toHaveBeenCalledWith('pacaAgua')
    fireEvent.click(buttons[1])
    expect(props.onIncrement).toHaveBeenCalledWith('pacaAgua')
  })

  it('el botón de decrementar se deshabilita en cantidad 0', () => {
    render(<PedidoItemEditor {...baseProps([makeItem({ cantidad: 0 })])} />)
    const decrementBtn = screen.getAllByRole('button')[0]
    expect(decrementBtn).toBeDisabled()
  })

  it('muestra precio tachado + precio manual cuando hay override, y el badge "Especial" cuando el origen es cliente', () => {
    render(
      <PedidoItemEditor
        {...baseProps([
          makeItem({ cantidad: 1, precio: 8000, precioBase: 10000, precioManual: 8000, precioOrigen: 'cliente' }),
        ])}
      />,
    )
    expect(screen.getByText('$10,000')).toBeInTheDocument() // tachado (base)
    // "$8,000" aparece dos veces (precio manual en el header + total = cant*precio) — ambos correctos.
    expect(screen.getAllByText('$8,000').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Especial')).toBeInTheDocument()
  })

  it('input de cantidad invoca onCantidadChange con el prodId y el valor tecleado', () => {
    const props = baseProps([makeItem({ prodId: 'pacaAgua', cantidad: 1 })])
    render(<PedidoItemEditor {...props} />)
    const cantidadInput = screen.getByDisplayValue('1')
    fireEvent.change(cantidadInput, { target: { value: '5' } })
    expect(props.onCantidadChange).toHaveBeenCalledWith('pacaAgua', '5')
  })

  it('warning de precio bajo (>50% de descuento) solo aparece sin confirmar, y "Confirmar" invoca onConfirmarPrecioBajo con el código canónico', () => {
    const props = baseProps([
      makeItem({ cantidad: 1, precioBase: 10000, precioManual: 4000, precioBajoConfirmado: false }),
    ])
    render(<PedidoItemEditor {...props} />)
    expect(screen.getByText(/% bajo/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Confirmar'))
    expect(props.onConfirmarPrecioBajo).toHaveBeenCalledWith('PACA_AGUA')
  })

  it('el warning de precio bajo desaparece cuando ya está confirmado', () => {
    render(
      <PedidoItemEditor
        {...baseProps([makeItem({ cantidad: 1, precioBase: 10000, precioManual: 4000, precioBajoConfirmado: true })])}
      />,
    )
    expect(screen.queryByText(/% bajo/)).not.toBeInTheDocument()
  })

  it('muestra los tiers de volumen solo cuando cantidad > 0 y hay tiers', () => {
    const tiers = [{ cantMin: 1, cantMax: 4, precio: 10000 }, { cantMin: 5, cantMax: null, precio: 9000 }]
    const { rerender } = render(<PedidoItemEditor {...baseProps([makeItem({ cantidad: 0, tiers })])} />)
    expect(screen.queryByText('1-4: $10,000')).not.toBeInTheDocument()

    rerender(<PedidoItemEditor {...baseProps([makeItem({ cantidad: 2, tiers })])} />)
    expect(screen.getByText('1-4: $10,000')).toBeInTheDocument()
    expect(screen.getByText('5+: $9,000')).toBeInTheDocument()
  })

  it('muestra el spinner de carga junto al precio cuando preciosLoading=true', () => {
    const { container } = render(
      <PedidoItemEditor {...baseProps()} preciosLoading={true} />,
    )
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })
})
