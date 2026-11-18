// @tests totalizarResumen / conteosPorEstado — resumen consolidado de facturas (#758)
import { describe, it, expect } from 'vitest'
import { conteosPorEstado, totalizarResumen, type FacturaParaResumen } from '../resumen-facturas'

const f = (estado: FacturaParaResumen['estado'], total: number, montoPagado: number): FacturaParaResumen => ({
  estado,
  total,
  montoPagado,
  saldo: estado === 'ANULADA' ? 0 : total - montoPagado,
})

describe('totalizarResumen', () => {
  it('suma solo las vigentes; las anuladas van aparte aunque conserven montoPagado histórico', () => {
    const { totales, anuladas } = totalizarResumen([
      f('PAGADA', 120_000, 120_000),
      f('PARCIAL', 85_000, 40_000),
      f('EMITIDA', 60_000, 0),
      f('ANULADA', 50_000, 20_000),
    ])
    expect(totales).toEqual({ total: 265_000, totalPagado: 160_000, saldo: 105_000, count: 3 })
    expect(anuladas).toEqual({ count: 1, totalHistorico: 50_000 })
  })

  it('con solo anuladas los totales vigentes quedan en cero', () => {
    const { totales, anuladas } = totalizarResumen([f('ANULADA', 50_000, 0), f('ANULADA', 10_000, 10_000)])
    expect(totales).toEqual({ total: 0, totalPagado: 0, saldo: 0, count: 0 })
    expect(anuladas).toEqual({ count: 2, totalHistorico: 60_000 })
  })

  it('sin facturas devuelve ceros', () => {
    const { totales, anuladas } = totalizarResumen([])
    expect(totales.count).toBe(0)
    expect(anuladas.count).toBe(0)
  })

  it('el saldo de cada factura es el que viene, no se recalcula (el saldo manda)', () => {
    const { totales } = totalizarResumen([{ estado: 'PARCIAL', total: 100, montoPagado: 30, saldo: 70 }])
    expect(totales.saldo).toBe(70)
  })
})

describe('conteosPorEstado', () => {
  it('completa con 0 los estados ausentes', () => {
    expect(conteosPorEstado([{ estado: 'PAGADA', count: 3 }])).toEqual({
      EMITIDA: 0,
      PARCIAL: 0,
      PAGADA: 3,
      ANULADA: 0,
    })
  })
})
