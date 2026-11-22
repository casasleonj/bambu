import { describe, expect, it } from 'vitest'
import { rangoHistorico } from '@/lib/rangos-historicos'

describe('#816 · Gastos solo consulta días reales, no pronósticos', () => {
  it('Hoy consulta únicamente el día actual de Bogotá', () => {
    expect(rangoHistorico('HOY', '2026-11-21')).toEqual({
      desde: '2026-11-21', hasta: '2026-11-21',
    })
  })
  it('Ayer cruza correctamente fin de mes y fin de año', () => {
    expect(rangoHistorico('AYER', '2027-01-01')).toEqual({
      desde: '2026-12-31', hasta: '2026-12-31',
    })
  })
  it('Esta semana cubre lunes hasta hoy, sin consultar el sábado futuro', () => {
    expect(rangoHistorico('SEMANA', '2026-11-18')).toEqual({
      desde: '2026-11-16', hasta: '2026-11-18',
    })
  })
  it('lunes y domingo delimitan la semana actual correctamente', () => {
    expect(rangoHistorico('SEMANA', '2026-11-16')).toEqual({
      desde: '2026-11-16', hasta: '2026-11-16',
    })
    expect(rangoHistorico('SEMANA', '2026-11-22')).toEqual({
      desde: '2026-11-16', hasta: '2026-11-22',
    })
  })
  it('no acepta entradas que desplacen el calendario contable', () => {
    expect(() => rangoHistorico('SEMANA', '2026-11-32')).toThrow()
    expect(() => rangoHistorico('HOY', '2026/11/21')).toThrow()
  })
})
