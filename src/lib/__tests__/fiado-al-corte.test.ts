import { describe, it, expect } from 'vitest'
import { calcularFiadoAlCorte, corteFinDelDiaBogota, totalAlCorte, type PedidoParaFiadoAlCorte } from '../fiado-al-corte'

const d = (iso: string): Date => new Date(iso)
const CORTE = d('2026-11-05T05:00:00Z') // fin del 4-nov en Bogotá

const pedido = (o: Partial<PedidoParaFiadoAlCorte> = {}): PedidoParaFiadoAlCorte => ({
  id: 'p1', creadoAt: d('2026-11-04T14:00:00Z'), totalCentavos: 2_300_000, estadoEntrega: 'ENTREGADO', entregadoAt: d('2026-11-04T15:00:00Z'),
  anuladoAt: null, cambiosDeTotal: [], hechosDeEntrega: [], pagos: [], reversiones: [], ...o,
})

describe('#796 fase 2 · fiado al corte (función pura)', () => {
  it('entregado antes del corte y sin pagar: todo el total es fiado', () => {
    const r = calcularFiadoAlCorte(pedido(), CORTE)
    expect(r).toMatchObject({ existia: true, entregadoCentavos: 2_300_000, pagadoNetoCentavos: 0, exigibleCentavos: 2_300_000, aproximado: false })
  })

  it('un pago DESPUÉS del corte no baja el fiado de ese día (el caso del issue)', () => {
    const r = calcularFiadoAlCorte(pedido({ pagos: [{ fecha: d('2026-11-05T14:00:00Z'), centavos: 2_300_000 }] }), CORTE)
    expect(r.exigibleCentavos).toBe(2_300_000)
  })

  it('un pago ANTES del corte sí lo baja; pagado el mismo día = sin fiado', () => {
    expect(calcularFiadoAlCorte(pedido({ pagos: [{ fecha: d('2026-11-04T20:00:00Z'), centavos: 2_300_000 }] }), CORTE).exigibleCentavos).toBe(0)
    expect(calcularFiadoAlCorte(pedido({ pagos: [{ fecha: d('2026-11-04T20:00:00Z'), centavos: 1_000_000 }] }), CORTE).exigibleCentavos).toBe(1_300_000)
  })

  it('el pago exactamente en el corte cuenta como del día siguiente', () => {
    expect(calcularFiadoAlCorte(pedido({ pagos: [{ fecha: CORTE, centavos: 2_300_000 }] }), CORTE).exigibleCentavos).toBe(2_300_000)
  })

  it('una rebaja comercial aplicada DESPUÉS del corte no cambia el fiado de ese día', () => {
    const p = pedido({ totalCentavos: 1_840_000, cambiosDeTotal: [{ fecha: d('2026-11-07T03:00:00Z'), antesCentavos: 2_300_000, despuesCentavos: 1_840_000 }] })
    expect(calcularFiadoAlCorte(p, CORTE)).toMatchObject({ totalAlCorteCentavos: 2_300_000, exigibleCentavos: 2_300_000 })
    expect(calcularFiadoAlCorte(p, d('2026-11-09T05:00:00Z')).exigibleCentavos).toBe(1_840_000)
  })

  it('con dos cambios posteriores gana el valor anterior al primero', () => {
    const p = pedido({ totalCentavos: 1_000_000, cambiosDeTotal: [
      { fecha: d('2026-11-08T00:00:00Z'), antesCentavos: 1_500_000, despuesCentavos: 1_000_000 },
      { fecha: d('2026-11-06T00:00:00Z'), antesCentavos: 2_000_000, despuesCentavos: 1_500_000 },
    ] })
    expect(totalAlCorte(p, CORTE)).toBe(2_000_000)
  })

  it('un pedido entregado DESPUÉS del corte todavía no era fiado', () => {
    const r = calcularFiadoAlCorte(pedido({ entregadoAt: d('2026-11-06T22:00:00Z') }), CORTE)
    expect(r).toMatchObject({ existia: true, entregadoCentavos: 0, exigibleCentavos: 0 })
  })

  it('un pedido creado después del corte no existía', () => {
    expect(calcularFiadoAlCorte(pedido({ creadoAt: d('2026-11-05T12:00:00Z') }), CORTE)).toMatchObject({ existia: false, exigibleCentavos: 0 })
  })

  it('anulado DESPUÉS del corte: en el corte existía y era fiado; las reversiones de la anulación no cuentan', () => {
    const p = pedido({ estadoEntrega: 'ANULADO', anuladoAt: d('2026-11-06T15:00:00Z'), reversiones: [{ fecha: d('2026-11-06T15:00:00Z'), centavos: 2_300_000 }] })
    expect(calcularFiadoAlCorte(p, CORTE)).toMatchObject({ existia: true, exigibleCentavos: 2_300_000, aproximado: false })
  })

  it('anulado ANTES del corte: no existía; sin fecha de anulación: no se inventa y se marca aproximado', () => {
    expect(calcularFiadoAlCorte(pedido({ estadoEntrega: 'ANULADO', anuladoAt: d('2026-11-04T18:00:00Z') }), CORTE)).toMatchObject({ existia: false, exigibleCentavos: 0 })
    const sinFecha = calcularFiadoAlCorte(pedido({ estadoEntrega: 'CANCELADO', anuladoAt: null }), CORTE)
    expect(sinFecha).toMatchObject({ existia: false, aproximado: true, motivosAproximado: ['SIN_FECHA_DE_ANULACION'] })
  })

  it('una reversión DESPUÉS del corte no cambia el día; una ANTES sí devuelve la deuda', () => {
    const pago = { fecha: d('2026-11-04T16:00:00Z'), centavos: 2_300_000 }
    expect(calcularFiadoAlCorte(pedido({ pagos: [pago], reversiones: [{ fecha: d('2026-11-06T16:00:00Z'), centavos: 2_300_000 }] }), CORTE).exigibleCentavos).toBe(0)
    expect(calcularFiadoAlCorte(pedido({ pagos: [pago], reversiones: [{ fecha: d('2026-11-04T17:00:00Z'), centavos: 800_000 }] }), CORTE).exigibleCentavos).toBe(800_000)
  })

  it('entrega parcial: solo cuentan los hechos anteriores al corte', () => {
    const p = pedido({ entregadoAt: null, estadoEntrega: 'EN_RUTA', hechosDeEntrega: [
      { entregadoAt: d('2026-11-04T16:00:00Z'), valorCentavos: 1_000_000 }, { entregadoAt: d('2026-11-05T16:00:00Z'), valorCentavos: 1_300_000 },
    ] })
    expect(calcularFiadoAlCorte(p, CORTE)).toMatchObject({ entregadoCentavos: 1_000_000, exigibleCentavos: 1_000_000 })
    expect(calcularFiadoAlCorte(p, d('2026-11-06T05:00:00Z')).exigibleCentavos).toBe(2_300_000)
  })

  it('un anticipo (pago antes de entregar) baja el fiado apenas se entrega; el sobrante no es fiado negativo', () => {
    const p = pedido({ pagos: [{ fecha: d('2026-11-03T12:00:00Z'), centavos: 3_000_000 }] })
    expect(calcularFiadoAlCorte(p, CORTE)).toMatchObject({ exigibleCentavos: 0, pagadoNetoCentavos: 3_000_000 })
  })

  it('un pago de oficina registrado tarde pero con fecha retroactiva cuenta en su día', () => {
    const p = pedido({ pagos: [{ fecha: d('2026-11-04T19:00:00Z'), centavos: 2_300_000 }] }) // `ocurridoAt`, aunque se haya creado el 9-nov
    expect(calcularFiadoAlCorte(p, CORTE).exigibleCentavos).toBe(0)
  })

  it('un ajuste de cantidad se declara aproximado en vez de ignorarse en silencio', () => {
    const r = calcularFiadoAlCorte(pedido({ tieneAjusteDeCantidad: true }), CORTE)
    expect(r.aproximado).toBe(true); expect(r.motivosAproximado).toContain('AJUSTE_DE_CANTIDAD_NO_SOPORTADO')
  })

  it('consistencia: con un corte en el futuro el resultado es el saldo actual del pedido', () => {
    const p = pedido({ totalCentavos: 1_840_000, cambiosDeTotal: [{ fecha: d('2026-11-07T03:00:00Z'), antesCentavos: 2_300_000, despuesCentavos: 1_840_000 }],
      pagos: [{ fecha: d('2026-11-08T12:00:00Z'), centavos: 500_000 }, { fecha: d('2026-11-09T12:00:00Z'), centavos: 200_000 }],
      reversiones: [{ fecha: d('2026-11-10T12:00:00Z'), centavos: 200_000 }] })
    expect(calcularFiadoAlCorte(p, d('2027-01-01T00:00:00Z')).exigibleCentavos).toBe(1_840_000 - (700_000 - 200_000))
  })

  describe('corteFinDelDiaBogota', () => {
    it('es el inicio del día siguiente en Bogotá (UTC−5, sin horario de verano)', () => {
      expect(corteFinDelDiaBogota('2026-11-04').toISOString()).toBe('2026-11-05T05:00:00.000Z')
      expect(corteFinDelDiaBogota('2026-11-30').toISOString()).toBe('2026-12-01T05:00:00.000Z')
      expect(corteFinDelDiaBogota('2026-12-31').toISOString()).toBe('2027-01-01T05:00:00.000Z')
      expect(corteFinDelDiaBogota('2028-02-28').toISOString()).toBe('2028-02-29T05:00:00.000Z')
    })
    it('rechaza fechas inválidas', () => {
      for (const malo of ['2026-13-01', '2026-02-30', 'hoy', '', '2026-1-5']) expect(() => corteFinDelDiaBogota(malo)).toThrow('DIA_INVALIDO')
    })
  })
})
