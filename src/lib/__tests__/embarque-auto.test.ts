// @tests embarque-auto — helpers puros de auto-generación (A.10 #4)
// Cubre el chunking por capacidad que hoy solo se cubre vía E2E contra DB.
import { describe, it, expect } from 'vitest'
import { unidadesPedido, pesoPedido, splitPedidosByCapacity, type PedidoCantidades } from '@/lib/embarque-auto'

function p(partial: PedidoCantidades): PedidoCantidades {
  return { ...partial }
}

describe('unidadesPedido', () => {
  it('suma todas las cantidades', () => {
    expect(unidadesPedido({ cPacaAguaPed: 2, cPacaHieloPed: 1, cBotellonFabPed: 3, cBotellonDomPed: 1, cBolsaAguaPed: 5, cBolsaHieloPed: 4 })).toBe(16)
  })

  it('campos ausentes cuentan como 0', () => {
    expect(unidadesPedido({})).toBe(0)
    expect(unidadesPedido({ cPacaAguaPed: null })).toBe(0)
  })
})

describe('pesoPedido', () => {
  it('usa los pesos reales por unidad', () => {
    // 1 paca agua (10kg) + 2 botellones (20kg c/u) = 50kg
    expect(pesoPedido({ cPacaAguaPed: 1, cBotellonDomPed: 2 })).toBe(50)
  })

  it('pedido vacío pesa 0', () => {
    expect(pesoPedido({})).toBe(0)
  })
})

describe('splitPedidosByCapacity — chunking greedy', () => {
  it('lista vacía → []', () => {
    expect(splitPedidosByCapacity([], 70)).toEqual([])
  })

  it('todos caben en un chunk → un solo chunk', () => {
    const pedidos = [p({ cPacaAguaPed: 10 }), p({ cPacaAguaPed: 20 }), p({ cPacaAguaPed: 30 })]
    const chunks = splitPedidosByCapacity(pedidos, 70)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(3)
  })

  it('divide en chunks cuando excede maxUnidades', () => {
    const pedidos = [
      p({ cPacaAguaPed: 40 }),
      p({ cPacaAguaPed: 40 }), // 40+40=80 > 70 → cada 40 va en su propio chunk
      p({ cPacaAguaPed: 40 }),
    ]
    const chunks = splitPedidosByCapacity(pedidos, 70)
    expect(chunks).toHaveLength(3)
    expect(chunks.every((c) => c.length === 1)).toBe(true)
  })

  it('un pedido individual > maxUnidades va solo en su propio chunk', () => {
    const pedidos = [
      p({ cPacaAguaPed: 100 }), // > 70 → solo
      p({ cPacaAguaPed: 10 }),
      p({ cPacaAguaPed: 10 }),
    ]
    const chunks = splitPedidosByCapacity(pedidos, 70)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(1)
    expect(chunks[1]).toHaveLength(2)
  })

  it('preserva el orden de entrada', () => {
    const pedidos = [
      p({ cPacaAguaPed: 30 }),
      p({ cPacaAguaPed: 30 }),
      p({ cPacaAguaPed: 30 }),
      p({ cPacaAguaPed: 30 }),
    ]
    // max 70: chunk1 = [30,30], chunk2 = [30,30]
    const chunks = splitPedidosByCapacity(pedidos, 70)
    expect(chunks.map((c) => c.map((x) => x.cPacaAguaPed))).toEqual([[30, 30], [30, 30]])
  })

  it('llenado exacto sin exceder (suma == maxUnidades)', () => {
    const pedidos = [p({ cPacaAguaPed: 35 }), p({ cPacaAguaPed: 35 }), p({ cPacaAguaPed: 35 })]
    const chunks = splitPedidosByCapacity(pedidos, 70)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(2)
    expect(chunks[1]).toHaveLength(1)
  })
})
