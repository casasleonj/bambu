import { describe, expect, it } from 'vitest'
import { calcularPorFuentes } from '../comision-repartidor-calculo'
import { construirEvidenciaComision, evidenciaProduccion, evidenciaReparto, interpretarEvidenciaComision } from '../comision-evidencia'

const base = { trabajadorId: 't1', fechaTrabajo: '2026-11-23', fechaPagoRealDeclarada: '2026-11-24',
  registradoAt: '2026-11-24T20:00:00.000Z', totalCentavos: 150000, pagadoAntesCentavos: 0, desembolsoCentavos: 150000 }
const pago = { trabajadorId: 't1', fechaTrabajo: base.fechaTrabajo, concepto: 'REPARTO', monto: 1500, registradoAt: base.registradoAt }
const detalle = () => evidenciaReparto(calcularPorFuentes([
  { id: 'p1', origen: 'SIN_EMBARQUE', href: '/pedidos/p1', unidades: { agua: 5, hielo: 0, botellon: 0 } },
], { agua: 300, hielo: 250, botellon: 500 }))

describe('#1010 F2A evidencia del registro', () => {
  it('captura tarifa, fuente e importe en centavos; no afirma vigencia al trabajar', () => {
    const e = construirEvidenciaComision(base, detalle())
    expect(e).toMatchObject({ version: 1, alcance: 'JORNADA_ACUMULADA', desgloseCuadra: true,
      detalle: { tarifasCentavos: { agua: 30000 }, unidades: { agua: 5 }, importesCentavos: { agua: 150000 } } })
    expect(interpretarEvidenciaComision(e, pago).estado).toBe('REGISTRADA')
    expect(JSON.stringify(e)).not.toContain('/pedidos/')
  })
  it('preserva versiones desconocidas, legado y vínculo incorrecto sin inventar evidencia', () => {
    const e = construirEvidenciaComision(base, detalle())
    expect(interpretarEvidenciaComision(null, pago).estado).toBe('NO_VERIFICADA')
    expect(interpretarEvidenciaComision({ ...e, version: 2 }, pago).estado).toBe('NO_INTERPRETABLE')
    expect(interpretarEvidenciaComision(e, { ...pago, monto: 1501 }).estado).toBe('NO_INTERPRETABLE')
    expect(interpretarEvidenciaComision(e, { ...pago, trabajadorId: 'otro' }).estado).toBe('NO_INTERPRETABLE')
  })
  it('el desglose inconsistente no reescribe dinero ni se certifica', () => {
    const e = construirEvidenciaComision({ ...base, totalCentavos: 160000 }, detalle())
    expect(e.desgloseCuadra).toBe(false)
    expect(e.desembolsoCentavos).toBe(150000)
    expect(interpretarEvidenciaComision({ ...e, desgloseCuadra: true }, pago).estado).toBe('REGISTRADA_CON_DIFERENCIAS')
  })
  it('producción conserva cada registro; tarifa implícita solo con división exacta y unidades positivas', () => {
    const d = evidenciaProduccion([{ id: 'prod', turno: 'JORNADA', comSellTotal: 900.01, items: [
      { id: 'a', producto: 'PACA_AGUA', producido: 2, comSellador: 600 },
      { id: 'b', producto: 'PACA_HIELO', producido: 2, comSellador: 300.01 },
      { id: 'c', producto: 'BOTELLON', producido: 0, comSellador: 0 },
    ] }])
    expect(d.registros[0].items.map(i => i.tarifaImplicitaCentavos)).toEqual([30000, null, null])
    expect(construirEvidenciaComision({ ...base, totalCentavos: 90001, desembolsoCentavos: 90001 }, d).desgloseCuadra).toBe(true)
  })
})
