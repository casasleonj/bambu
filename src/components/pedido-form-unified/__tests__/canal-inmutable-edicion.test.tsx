// @tests PR-1 (incidente Pedidos/edición): el form legacy ofrecía el toggle
// Punto/Domicilio al EDITAR, pero el PUT no guarda `canal` (inmutable,
// ADR-PEDIDO-ORIGEN-CANAL-001) → «Pedido actualizado» sin aplicar el cambio.
// Render real del componente (no regex sobre el fuente).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PedidoFormUnified } from '../index'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) }))
})

const base = {
  clientes: [],
  onSubmit: vi.fn(),
}

describe('PedidoFormUnified — canal en edición', () => {
  it('EDITANDO un pedido PUNTO: no hay toggle de canal; se muestra el canal registrado y cómo corregirlo', () => {
    render(
      <PedidoFormUnified
        {...base}
        contexto="PUNTO"
        pedidoInicial={{ id: 'ped_1', canal: 'PUNTO', cliente: null, items: [{ producto: 'PACA_AGUA', cantidad: 1 }] }}
      />,
    )
    expect(screen.queryByRole('button', { name: /Domicilio/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Punto de Venta/ })).toBeNull()
    const fijo = screen.getByTestId('canal-fijo-edicion')
    expect(fijo).toHaveTextContent('Punto de Venta')
    expect(fijo).toHaveTextContent(/corrección formal/)
  })

  it('CREANDO una venta en punto el toggle sigue disponible', () => {
    render(<PedidoFormUnified {...base} contexto="PUNTO" />)
    expect(screen.getByRole('button', { name: /Domicilio/ })).toBeInTheDocument()
    expect(screen.queryByTestId('canal-fijo-edicion')).toBeNull()
  })
})
