// @tests Regresión: editar un pedido a negocio prellenaba la dirección del
// CLIENTE en vez de la del negocio (negocioData nunca se inicializaba), y el
// NegocioSelector seguía totalmente interactivo pese a que cambiar el
// destino durante una edición no tiene ningún efecto en el backend
// (ActualizarPedidoInput no tiene negocioId — verificado leyendo
// ActualizarPedidoUseCase.ts, que siempre reusa pedido.negocioId sin
// condición).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(process.cwd(), 'src/components/pedido-form-unified/index.tsx'),
  'utf-8',
)

describe('FIX: negocioData se inicializa correctamente al editar un pedido a negocio', () => {
  it('el efecto de init desde pedidoInicial setea negocioData cuando hay negocioId', () => {
    const start = source.indexOf('if (!pedidoInicial) return')
    const end = source.indexOf('}, [pedidoInicial?.id])')
    const initBlock = source.slice(start, end)
    expect(initBlock).toMatch(/setNegocioSeleccionado\(pedidoInicial\.negocioId/)
    expect(initBlock).toMatch(/setNegocioData\(/)
    expect(initBlock).toMatch(/pedidoInicial\.negocioDireccion/)
  })

  it('NegocioSelector recibe readOnly basado en si es edición (pedidoInicial?.id)', () => {
    const idx = source.indexOf('<NegocioSelector')
    const end = source.indexOf('/>', idx)
    const block = source.slice(idx, end)
    expect(block).toMatch(/readOnly=\{Boolean\(pedidoInicial\?\.id\)\}/)
  })
})
