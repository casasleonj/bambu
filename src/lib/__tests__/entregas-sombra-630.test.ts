// #630 F1-A. Datos inventados: diagnóstico puro, sin cambiar el cálculo oficial.
import { describe, expect, it } from 'vitest'
import { diagnosticarPedidoEntregasSombra, type PedidoSombra } from '@/lib/entregas-sombra-630'
import type { EntregaConsulta } from '@/lib/entregas-consulta'

const lunes = '2032-04-12'
const martes = '2032-04-13'
const miercoles = '2032-04-14'
const instante = (dia: string, hora = '12:00:00') => new Date(`${dia}T${hora}-05:00`)
const pedido = (cambios: Partial<PedidoSombra> = {}): PedidoSombra => ({
  id: 'pedido-sintetico', numero: 42, fecha: instante(lunes),
  estadoEntrega: 'EN_RUTA', cPacaAguaEnt: 10, cPacaHieloEnt: 0,
  cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0,
  cBolsaHieloEnt: 0, items: [], ...cambios,
})
const evento = (id: string, dia: string, cantidad: number | null, cambios: Partial<EntregaConsulta> = {}): EntregaConsulta => ({
  id, pedidoId: 'pedido-sintetico', fecha: instante(dia), repartidorId: null,
  fuente: 'AUDITORIA', cantidades: cantidad === null ? null : [{ producto: 'PACA_AGUA', cantidad }],
  ...cambios,
})
const agua = (p: PedidoSombra, e: EntregaConsulta[], dia = martes) =>
  diagnosticarPedidoEntregasSombra(p, e, dia).lineas.find(l => l.producto === 'PACA_AGUA')

describe('#630 F1-A — hechos físicos por fecha, sin contabilidad ni escrituras', () => {
  it('F1-01: 4 martes respaldadas y 6 sin fecha; no inventa 10 el lunes', () => {
    const l = agua(pedido(), [evento('a', martes, 4, { incompleto: true })])
    expect(l).toMatchObject({ conEvidenciaEnDia: 4, conEvidenciaOtrosDias: 0,
      residualSinFecha: 6, excesoFrenteAcumulado: 0, estado: 'SIN_FECHA' })
    expect(l?.porDia).toEqual([{ dia: martes, cantidad: 4 }])
  })
  it('F1-02: suma 4 martes y 6 miércoles sin atribuirlas al día del pedido', () => {
    const evidencias = [evento('a', martes, 4), evento('b', miercoles, 6)]
    expect(agua(pedido(), evidencias)).toMatchObject({
      conEvidenciaEnDia: 4, conEvidenciaOtrosDias: 6, residualSinFecha: 0, estado: 'CONCILIADO',
    })
    expect(agua(pedido(), evidencias, miercoles)?.conEvidenciaEnDia).toBe(6)
    expect(agua(pedido(), evidencias, lunes)?.conEvidenciaEnDia).toBe(0)
  })
  it('F1-03: mismo ID reintentado idéntico no duplica', () => {
    const a = evento('replay', martes, 4)
    expect(agua(pedido({ cPacaAguaEnt: 4 }), [a, { ...a }])?.conEvidenciaEnDia).toBe(4)
  })
  it('F1-03 adversarial: reutilizar un ID con payload diferente genera conflicto', () => {
    const l = agua(pedido(), [evento('replay', martes, 4), evento('replay', martes, 6)])
    expect(l?.estado).toBe('CONFLICTO')
    expect(l?.alertas).toContain('IDENTIDAD_REUTILIZADA_CON_OTRO_CONTENIDO')
    expect(l?.conEvidenciaEnDia).toBe(4)
  })
  it('F1-04: venta de mostrador sustentada por HISTORICO cuenta una sola vez', () => {
    expect(agua(pedido(), [
      evento('historico:p', martes, 10, { fuente: 'HISTORICO' }),
    ])?.estado).toBe('CONCILIADO')
  })
  it('F1-05: 60 cobradas + 3 regalos son 63 físicas, no 66', () => {
    const p = pedido({ cPacaAguaEnt: 0,
      items: [{ producto: 'PACA_AGUA', cantEntrega: 60, cantRegaloEntrega: 3 }] })
    const e = evento('regalo', martes, 63, { cantidades: [
      { producto: 'PACA_AGUA', cantidad: 63, cantidadRegalo: 3 },
    ] })
    expect(agua(p, [e])).toMatchObject({ acumuladoActual: 63, conEvidenciaEnDia: 63,
      residualSinFecha: 0, estado: 'CONCILIADO' })
  })
  it('F1-06: sincronización nocturna no cambia la fecha efectiva del evento', () => {
    const e = evento('offline', lunes, 10, { fecha: instante(lunes, '23:59:59') })
    expect(agua(pedido(), [e], martes)?.conEvidenciaEnDia).toBe(0)
    expect(agua(pedido(), [e], lunes)?.conEvidenciaEnDia).toBe(10)
  })
  it('F1-07: anulación posterior exige revisar compensación; conserva evidencia histórica', () => {
    const l = agua(pedido({ estadoEntrega: 'ANULADO' }), [evento('p', martes, 10)])
    expect(l?.conEvidenciaEnDia).toBe(10)
    expect(l?.estado).toBe('REVISAR_ANULACION')
    expect(l?.alertas).toContain('ESTADO_ACTUAL_ANULADO_REVISAR_COMPENSACION')
  })
  it('F1-08: precisión de día es suficiente para un reporte diario', () => {
    const l = agua(pedido(), [evento('a', martes, 10, { precisionDia: true })])
    expect(l?.estado).toBe('CONCILIADO')
    expect(l?.conEvidenciaEnDia).toBe(10)
  })
  it('F1-09: corrección posterior de acumulado no atribuye un residual a fecha inventada', () => {
    const l = agua(pedido({ cPacaAguaEnt: 12 }), [evento('a', martes, 10)])
    expect(l).toMatchObject({ conEvidenciaEnDia: 10, residualSinFecha: 2, estado: 'SIN_FECHA' })
  })
  it('F1-10: eventos mayores que acumulado exigen revisión y no crean merma', () => {
    const l = agua(pedido(), [evento('a', martes, 12)])
    expect(l).toMatchObject({ conEvidenciaEnDia: 12, excesoFrenteAcumulado: 2, estado: 'CONFLICTO' })
    expect(l?.alertas).toContain('EVENTOS_EXCEDEN_ACUMULADO')
  })
  it('F1-10 adicional: hecho sin cantidad mantiene el residual en desconocido', () => {
    const l = agua(pedido(), [evento('sin', martes, null)])
    expect(l).toMatchObject({ conEvidenciaEnDia: 0, residualSinFecha: 10, estado: 'SIN_FECHA' })
    expect(l?.alertas).toContain('EVENTO_SIN_CANTIDADES_VERIFICABLES')
  })
  it('F1-11: línea de producto desconocido no se registra como venta física', () => {
    const l = agua(pedido(), [evento('x', martes, 5, { cantidades: [{ producto: 'OTRO', cantidad: 5 }] })])
    expect(l?.conEvidenciaEnDia).toBe(0)
    expect(l?.estado).toBe('CONFLICTO')
  })
  it('F1-12: dos eventos distintos conservan identidad y cantidades independientes', () => {
    expect(agua(pedido(), [evento('a', martes, 4), evento('b', martes, 6)])?.conEvidenciaEnDia).toBe(10)
  })
  it('unidades negativas en el acumulado no se silencian como cero válido', () => {
    const l = agua(pedido({ cPacaAguaEnt: -2 }), [])
    expect(l?.estado).toBe('CONFLICTO')
    expect(l?.alertas).toContain('ACUMULADO_NEGATIVO')
  })
  it('no modifica el pedido ni los hechos de entrada', () => {
    const p = pedido()
    const e = [evento('x', martes, 4)]
    const previo = JSON.stringify({ p, e })
    diagnosticarPedidoEntregasSombra(p, e, martes)
    expect(JSON.stringify({ p, e })).toBe(previo)
  })
})
