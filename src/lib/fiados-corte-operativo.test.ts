import { describe, expect, it } from 'vitest'
import { corteDeEntrega, desglosarDeudaAlCorte, desglosarPedidoConFIFO, cierreEfectivoVerificado } from './fiados-corte-operativo'

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

  it('ignora cierres de otra jornada incluso si el reloj está mal configurado', () => {
    const cierreOtraJornada = fecha('2026-11-24T00:10:00-05:00')
    expect(corteDeEntrega(entrega, cierreOtraJornada))
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

describe('fiados #796: integración pura con FIFO y conciliación', () => {
  const ayer = fecha('2026-11-22T15:00:00-05:00')
  const ahora = fecha('2026-11-23T17:00:00-05:00')
  const entregas = [
    { id: 'vieja', entregadoAt: ayer, valorEntregado: 80000 },
    { id: 'nueva', entregadoAt: entrega, valorEntregado: 46000 },
  ]

  it('asigna el abono primero a la entrega vieja, sin convertir la nueva en fiado', () => {
    expect(desglosarPedidoConFIFO({ entregas, totalPagado: 20000, exigible: 106000,
      cierresPorDia: new Map() }, ahora)).toEqual({
      fiadoCentavos: 6000000, pendienteOperativoCentavos: 4600000, exigibleCentavos: 10600000,
    })
  })

  it('no publica una cifra falsa si el saldo exigible difiere del FIFO', () => {
    expect(desglosarPedidoConFIFO({ entregas, totalPagado: 20000, exigible: 100000,
      cierresPorDia: new Map() }, ahora)).toBeNull()
  })

  it('rechaza entregas duplicadas y fechas futuras para evitar doble conteo', () => {
    expect(desglosarPedidoConFIFO({ entregas: [entregas[0], entregas[0]], totalPagado: 0,
      exigible: 160000, cierresPorDia: new Map() }, ahora)).toBeNull()
    expect(desglosarPedidoConFIFO({ entregas: [{ id: 'futura', entregadoAt: fecha('2026-11-24T15:00:00-05:00'),
      valorEntregado: 100 }], totalPagado: 0, exigible: 100, cierresPorDia: new Map() }, ahora)).toBeNull()
  })

  it('reconoce el cierre anticipado de la jornada de la nueva entrega', () => {
    const cierre = fecha('2026-11-23T16:00:00-05:00')
    expect(desglosarPedidoConFIFO({ entregas, totalPagado: 0, exigible: 126000,
      cierresPorDia: new Map([['2026-11-23', cierre]]) }, ahora)?.fiadoCentavos).toBe(12600000)
  })
})

describe('fiados #796: cierres registrados tardíamente', () => {
  const dia = '2026-11-23'
  const registradoManana = fecha('2026-11-24T09:00:00-05:00')
  it('no confunde la fecha de registro tardío con el cierre efectivo', () => {
    expect(cierreEfectivoVerificado(dia, registradoManana, registradoManana, false)).toBeNull()
    expect(cierreEfectivoVerificado(dia, registradoManana, registradoManana, true)).toBeNull()
  })
  it('admite un cierre efectivo del día anterior solo si está confirmado', () => {
    const efectivo = fecha('2026-11-23T18:00:00-05:00')
    expect(cierreEfectivoVerificado(dia, efectivo, registradoManana, false)).toBeNull()
    expect(cierreEfectivoVerificado(dia, efectivo, registradoManana, true)).toEqual(efectivo)
  })
  it('rechaza una hora efectiva posterior al registro', () => {
    expect(cierreEfectivoVerificado(dia, fecha('2026-11-23T18:00:00-05:00'),
      fecha('2026-11-23T17:00:00-05:00'), true)).toBeNull()
  })
})

describe('fiados #796: ajustes netos y reversión del saldo vigente', () => {
  const ahora = fecha('2026-11-23T17:00:00-05:00')
  const entregas = [
    { id: 'a', entregadoAt: fecha('2026-11-22T15:00:00-05:00'), valorEntregado: 80000 },
    { id: 'b', entregadoAt: entrega, valorEntregado: 46000 },
  ]
  it('restablece ambas porciones cuando el saldo neto refleja una reversión completa', () => {
    const base = { entregas, cierresPorDia: new Map<string, Date>() }
    expect(desglosarPedidoConFIFO({ ...base, totalPagado: 100000, exigible: 26000 }, ahora))
      .toEqual({ fiadoCentavos: 0, pendienteOperativoCentavos: 2600000, exigibleCentavos: 2600000 })
    expect(desglosarPedidoConFIFO({ ...base, totalPagado: 0, exigible: 126000 }, ahora))
      .toEqual({ fiadoCentavos: 8000000, pendienteOperativoCentavos: 4600000, exigibleCentavos: 12600000 })
  })
  it('clasifica un ajuste inequívoco sin inventar una distribución mixta', () => {
    expect(desglosarPedidoConFIFO({ entregas: [entregas[0]], totalPagado: 0, exigible: 60000,
      cierresPorDia: new Map() }, ahora))
      .toEqual({ fiadoCentavos: 6000000, pendienteOperativoCentavos: 0, exigibleCentavos: 6000000 })
    expect(desglosarPedidoConFIFO({ entregas, totalPagado: 0, exigible: 106000,
      cierresPorDia: new Map() }, ahora)).toBeNull()
  })
})

describe('fiados #796: el desglose nunca lanza por datos del pedido', () => {
  const ahora = fecha('2026-11-23T17:00:00-05:00')
  const entregas = [
    { id: 'a', entregadoAt: fecha('2026-11-22T15:00:00-05:00'), valorEntregado: 80000 },
    { id: 'b', entregadoAt: entrega, valorEntregado: 46000 },
  ]
  const base = { entregas, cierresPorDia: new Map<string, Date>() }

  it('sobrepago (anticipo): el FIFO no deja saldos negativos y no lanza', () => {
    expect(() => desglosarPedidoConFIFO({ ...base, totalPagado: 500000, exigible: 0 }, ahora)).not.toThrow()
    expect(desglosarPedidoConFIFO({ ...base, totalPagado: 500000, exigible: 0 }, ahora))
      .toEqual({ fiadoCentavos: 0, pendienteOperativoCentavos: 0, exigibleCentavos: 0 })
  })
  it('sobrepago con exigible incoherente devuelve null (por clasificar), sin lanzar', () => {
    expect(desglosarPedidoConFIFO({ ...base, totalPagado: 500000, exigible: 5000 }, ahora)).toBeNull()
  })
  it('entregas con centavos y valor cero: saldos enteros no negativos', () => {
    const e = [
      { id: 'x', entregadoAt: fecha('2026-11-22T15:00:00-05:00'), valorEntregado: 1000.1 },
      { id: 'y', entregadoAt: entrega, valorEntregado: 0 },
    ]
    expect(desglosarPedidoConFIFO({ entregas: e, cierresPorDia: new Map(), totalPagado: 0.3, exigible: 999.8 }, ahora))
      .toEqual({ fiadoCentavos: 99980, pendienteOperativoCentavos: 0, exigibleCentavos: 99980 })
  })
  it('entrega futura devuelve null en lugar de lanzar ENTREGA_FUTURA_NO_EXIGIBLE', () => {
    expect(desglosarPedidoConFIFO({ entregas: [{ id: 'f', entregadoAt: fecha('2026-11-24T10:00:00-05:00'), valorEntregado: 100 }],
      cierresPorDia: new Map(), totalPagado: 0, exigible: 100 }, ahora)).toBeNull()
  })
})
