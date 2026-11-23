// #630 F1-B0: escenarios sintéticos. La comparación no cambia ningún consumidor.
import { describe, expect, it } from 'vitest'
import { resumirComparacionEntregas630 } from '@/lib/comparacion-entregas-630'
import { diagnosticarPedidoEntregasSombra, type PedidoSombra, type DiagnosticoEntregasSombra } from '@/lib/entregas-sombra-630'
import type { EntregaConsulta } from '@/lib/entregas-consulta'
import type { UnidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'

const dia = (s: string) => new Date(s + 'T12:00:00-05:00')
const lunes = '2032-04-12'
const martes = '2032-04-13'
const miercoles = '2032-04-14'
const pedido = (p: Partial<PedidoSombra> = {}): PedidoSombra => ({
  id: 'sintetico', numero: 77, fecha: dia(lunes), estadoEntrega: 'EN_RUTA',
  cPacaAguaEnt: 10, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0,
  cBolsaAguaEnt: 0, cBolsaHieloEnt: 0, items: [], ...p,
})
const hecho = (id: string, fecha: string, cantidad: number, extra: Partial<EntregaConsulta> = {}): EntregaConsulta => ({
  id, pedidoId: 'sintetico', fecha: dia(fecha), fuente: 'AUDITORIA',
  repartidorId: null, cantidades: [{ producto: 'PACA_AGUA', cantidad }], ...extra,
})
const totales = (agua: number): UnidadesEntregadasDelDia => ({
  agua, hielo: 0, botellon: 0, bolsaAgua: 0, bolsaHielo: 0, aproximados: [],
})
function consulta(fecha: string, p: PedidoSombra, hechos: EntregaConsulta[], oficial: number) {
  const diagnostico: DiagnosticoEntregasSombra = {
    fecha, modo: 'SOLO_LECTURA', pedidosNoEncontrados: 0,
    pedidos: [diagnosticarPedidoEntregasSombra(p, hechos, fecha)],
  }
  return resumirComparacionEntregas630(totales(oficial), diagnostico)
}
const agua = (c: ReturnType<typeof consulta>) => c.porProducto.find(l => l.producto === 'PACA_AGUA')!

describe('#630 F1-B0 · comparación diagnóstica no contable', () => {
  it('mantiene el hecho martes 4 aunque el oficial atribuya 0 por evidencia global incompleta', () => {
    const c = consulta(martes, pedido(), [hecho('e1', martes, 4, { incompleto: true })], 0)
    expect(agua(c)).toMatchObject({
      oficial: 0, conFechaAtribuible: 4, conFechaEnRevision: 0,
      residualSinFecha: 6, diferenciaOficialMenosAtribuible: -4, calidad: 'REQUIERE_REVISION',
    })
    expect(c.diagnostico.pedidos[0].lineas[0].porDia).toEqual([{ dia: martes, cantidad: 4 }])
    expect(c.cobertura).toBe('ACOTADA_NO_CERTIFICADA')
  })

  it('un oficial de 10 en lunes no demuestra que se entregaron 10 el lunes', () => {
    const c = consulta(lunes, pedido(), [hecho('e1', martes, 4, { incompleto: true })], 10)
    expect(agua(c)).toMatchObject({
      oficial: 10, conFechaAtribuible: 0, residualSinFecha: 6, diferenciaOficialMenosAtribuible: 10,
    })
    expect(c.advertencias).toContain('DIFERENCIA_NO_EQUIVALE_A_VENTA_MERMA_O_AJUSTE')
  })

  it('días martes 4 y miércoles 6 completos coinciden sólo numéricamente', () => {
    const es = [hecho('e1', martes, 4), hecho('e2', miercoles, 6)]
    expect(agua(consulta(martes, pedido(), es, 4))).toMatchObject({
      conFechaAtribuible: 4, residualSinFecha: 0, calidad: 'COINCIDENCIA_NUMERICA_NO_CERTIFICADA',
    })
    expect(agua(consulta(miercoles, pedido(), es, 6))).toMatchObject({
      conFechaAtribuible: 6, residualSinFecha: 0, calidad: 'COINCIDENCIA_NUMERICA_NO_CERTIFICADA',
    })
  })

  it('regalos 60+3 son 63 unidades, no se duplican por precio o comisión', () => {
    const p = pedido({ cPacaAguaEnt: 0, items: [
      { producto: 'PACA_AGUA', cantEntrega: 60, cantRegaloEntrega: 3 },
    ] })
    const e = hecho('regalos', martes, 63, { cantidades: [
      { producto: 'PACA_AGUA', cantidad: 63, cantidadRegalo: 3 },
    ] })
    expect(agua(consulta(martes, p, [e], 63))).toMatchObject({
      oficial: 63, conFechaAtribuible: 63, residualSinFecha: 0,
    })
  })

  it('anulado después de entrega conserva evidencia pero nunca la certifica como vendido', () => {
    const p = pedido({ estadoEntrega: 'ANULADO' })
    const c = consulta(martes, p, [hecho('anulado', martes, 10)], 0)
    expect(agua(c)).toMatchObject({
      oficial: 0, conFechaAtribuible: 0, conFechaEnRevision: 10,
      calidad: 'REQUIERE_REVISION',
    })
  })

  it('exceso 12 frente a 10 se mantiene en revisión y no se vuelve stock negativo', () => {
    const c = consulta(martes, pedido(), [hecho('extra', martes, 12)], 0)
    expect(agua(c)).toMatchObject({
      conFechaAtribuible: 0, conFechaEnRevision: 12, calidad: 'REQUIERE_REVISION',
    })
    expect(c.diagnostico.pedidos[0].lineas[0].excesoFrenteAcumulado).toBe(2)
  })

  it('precisión día es aceptable en comparación diaria, no se extrapola a horas', () => {
    const c = consulta(martes, pedido(), [hecho('mostrador', martes, 10, { precisionDia: true })], 10)
    expect(agua(c).conFechaAtribuible).toBe(10)
    expect(c.modo).toBe('SOLO_LECTURA')
  })

  it('alerta sin productos no desaparece, tampoco agrega una venta inexistente', () => {
    const p = pedido({ cPacaAguaEnt: 0 })
    const e = hecho('raro', martes, 3, { cantidades: [{ producto: 'PRODUCTO_RARO', cantidad: 3 }] })
    const c = consulta(martes, p, [e], 0)
    expect(agua(c).conFechaAtribuible).toBe(0)
    expect(c.pedidosConAlertas).toBe(1)
  })

  it('exceso de cobertura conocida no se interpreta como comparación completa', () => {
    const c = consulta(martes, pedido(), [hecho('completo', martes, 10)], 10)
    const d = { ...c.diagnostico, pedidosNoEncontrados: 1 }
    const r = resumirComparacionEntregas630(totales(10), d)
    expect(r.pedidosNoEncontrados).toBe(1)
    expect(r.porProducto[0].calidad).toBe('REQUIERE_REVISION')
  })

  it('no modifica ni la evidencia ni los valores oficiales', () => {
    const p = pedido()
    const e = [hecho('e', martes, 4)]
    const d: DiagnosticoEntregasSombra = { fecha: martes, modo: 'SOLO_LECTURA',
      pedidosNoEncontrados: 0, pedidos: [diagnosticarPedidoEntregasSombra(p, e, martes)] }
    const original = totales(10)
    const antes = JSON.stringify({ d, original })
    resumirComparacionEntregas630(original, d)
    expect(JSON.stringify({ d, original })).toBe(antes)
  })
})
