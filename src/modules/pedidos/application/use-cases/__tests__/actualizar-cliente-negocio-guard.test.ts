// @tests Guard de seguridad: actualizarCliente NUNCA debe aplicarse cuando el
// pedido tiene un negocio/sucursal como destino.
//
// Bug encontrado: pedido-form-unified computaba actualizarCliente comparando
// la dirección visible (que al elegir un negocio es la del NEGOCIO) contra
// la dirección guardada del CLIENTE. Al diferir, se enviaba actualizarCliente
// con la dirección del negocio, y CrearPedidoUseCase/ActualizarPedidoUseCase
// la persistían sin condición en Cliente.direccion/barrio — corrompiendo
// silenciosamente la dirección propia del cliente cada vez que se despachaba
// a una sucursal. El fix agrega un guard explícito en ambos use cases
// (defensa en profundidad, además del fix en el cliente).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('CrearPedidoUseCase: no actualiza dirección del cliente si el pedido va a un negocio', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/modules/pedidos/application/use-cases/CrearPedidoUseCase.ts'),
    'utf-8',
  )

  it('el guard de actualizarCliente incluye !input.negocioId', () => {
    const idx = source.indexOf('if (input.actualizarCliente')
    expect(idx).toBeGreaterThan(-1)
    const guardLine = source.slice(idx, source.indexOf('{', idx))
    expect(guardLine).toContain('!input.negocioId')
  })
})

describe('ActualizarPedidoUseCase: no actualiza dirección del cliente si el pedido va a un negocio', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/modules/pedidos/application/use-cases/ActualizarPedidoUseCase.ts'),
    'utf-8',
  )

  it('el guard de actualizarCliente incluye !saved.negocioId', () => {
    const idx = source.indexOf('if (input.actualizarCliente')
    expect(idx).toBeGreaterThan(-1)
    const guardLine = source.slice(idx, source.indexOf('{', idx))
    expect(guardLine).toContain('!saved.negocioId')
  })
})
