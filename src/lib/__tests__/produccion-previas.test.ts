// @tests #645 — el stock inicial de una producción incluye lo neto de las anteriores del mismo día.
import { describe, it, expect } from 'vitest'
import { netoPrevioDelDia } from '../produccion-previas'

const item = (producto: string, producido: number, p = { rotas: 0, filtradas: 0, consumoInterno: 0 }) => ({ producto, producido, ...p })

describe('#645 — netoPrevioDelDia', () => {
  it('sin producciones previas es 0', () => expect(netoPrevioDelDia([], 'PACA_AGUA')).toBe(0))
  it('suma lo producido y resta las pérdidas, solo del producto pedido', () => {
    const previas = [
      { items: [item('PACA_AGUA', 20, { rotas: 2, filtradas: 1, consumoInterno: 1 }), item('PACA_HIELO', 10)] },
      { items: [item('PACA_AGUA', 15), item('BOTELLON', 8)] },
    ]
    expect(netoPrevioDelDia(previas, 'PACA_AGUA')).toBe(16 + 15)
    expect(netoPrevioDelDia(previas, 'PACA_HIELO')).toBe(10)
    expect(netoPrevioDelDia(previas, 'NADA')).toBe(0)
  })
})
