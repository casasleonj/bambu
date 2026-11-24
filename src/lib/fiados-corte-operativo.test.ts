import { describe, expect, it } from 'vitest'
import { corteDeEntrega, desglosarDeudaAlCorte } from './fiados-corte-operativo'

const fecha = (s: string) => new Date(s)
const entrega = fecha('2026-11-23T15:00:00-05:00')
const sinCierre = null

describe('fiados #796: corte operativo', () => {
  it('no convierte la deuda de hoy antes de medianoche sin cierre', () => {
    const r = desglosarDeudaAlCorte([{ entregadoAt: entrega, saldoCentavos: 4600000, cierreDeJornadaAt: sinCierre }],
      fecha('2026-11-23T23:59:59-05:00'))
    expect(r).toEqual({ fiadoCentavos: 0, pendienteOperativoCentavos: 4600000, exigibleCentavos: 4600000 })
  })

  it('convierte exactamente a medianoche de Bogotá sin cierre', () => {
    const r = desglosarDeudaAlCorte([{ entregadoAt: entrega, saldoCentavos: 4600000, cierreDeJornadaAt: sinCierre }],
      fecha('2026-11-24T00:00:00-05:00'))
    expect(r.fiadoCentavos).toBe(4600000)
    expect(r.pendienteOperativoCentavos).toBe(0)
  })

  it('convierte al cierre real de la jornada aunque aún sea el mismo día', () => {
    const cierre = fecha('2026-11-23T18:00:00-05:00')
    expect(corteDeEntrega(entrega, cierre)).toEqual(cierre)
    const porcion = [{ entregadoAt: entrega, saldoCentavos: 4600000, cierreDeJornadaAt: cierre }]
    expect(desglosarDeudaAlCorte(porcion, fecha('2026-11-23T17:59:59-05:00')).fiadoCentavos).toBe(0)
    expect(desglosarDeudaAlCorte(porcion, cierre).fiadoCentavos).toBe(4600000)
  })

  it('separa deuda vieja consolidada y deuda nueva sin corte del mismo cliente', () => {
    const r = desglosarDeudaAlCorte([
      { entregadoAt: fecha('2026-11-22T15:00:00-05:00'), saldoCentavos: 8000000, cierreDeJornadaAt: null },
      { entregadoAt: entrega, saldoCentavos: 4600000, cierreDeJornadaAt: null },
    ], fecha('2026-11-23T17:00:00-05:00'))
    expect(r).toEqual({ fiadoCentavos: 8000000, pendienteOperativoCentavos: 4600000, exigibleCentavos: 12600000 })
  })

  it('no aplica a entregas posteriores un cierre previo de la jornada', () => {
    expect(corteDeEntrega(entrega, fecha('2026-11-23T14:00:00-05:00')))
      .toEqual(fecha('2026-11-24T00:00:00-05:00'))
  })

  it('no acepta saldos negativos ni entregas futuras', () => {
    expect(() => desglosarDeudaAlCorte([
      { entregadoAt: entrega, saldoCentavos: -1, cierreDeJornadaAt: null },
    ], fecha('2026-11-23T18:00:00-05:00'))).toThrow('SALDO_PORCION_INVALIDO')
    expect(() => desglosarDeudaAlCorte([
      { entregadoAt: entrega, saldoCentavos: 100, cierreDeJornadaAt: null },
    ], fecha('2026-11-23T14:00:00-05:00'))).toThrow('ENTREGA_FUTURA_NO_EXIGIBLE')
  })
})
