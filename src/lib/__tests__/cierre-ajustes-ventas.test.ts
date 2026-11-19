import { describe, expect, it } from 'vitest'
import { diasCumplimientoVerificado, esReversaTerminal, importeReconocido } from '@/lib/cierre-ajustes-ventas'
import type { EntregaConsulta } from '@/lib/entregas-consulta'
const evento = (fecha: string, cantidad: number): EntregaConsulta => ({
  id: fecha, pedidoId: 'p', fecha: new Date(fecha), repartidorId: null,
  cantidades: [{ producto: 'PACA_AGUA', cantidad }], fuente: 'AUDITORIA',
})
describe('#885: procedencia de ajustes de venta', () => {
  it('no confunde el motivo de una nota con el hecho terminal', () => {
    expect(esReversaTerminal(JSON.stringify({ motivo: 'ANULAR', notaCredito: true }))).toBe(false)
    expect(esReversaTerminal(JSON.stringify({ modo: 'ANULAR', notaCredito: false }))).toBe(true)
    expect(esReversaTerminal(JSON.stringify({ estado: 'CANCELADO', notaCredito: true }))).toBe(true)
  })
  it('distingue dos días en Bogotá y rechaza acumulados sin evidencia', () => {
    const hechos = [evento('2031-04-11T04:59:59.999Z', 3), evento('2031-04-11T05:00:00Z', 2)]
    expect([...diasCumplimientoVerificado(hechos, { PACA_AGUA: 5 })!]).toEqual(['2031-04-10', '2031-04-11'])
    expect(diasCumplimientoVerificado(hechos, { PACA_AGUA: 6 })).toBeNull()
    expect(diasCumplimientoVerificado([], { PACA_AGUA: 0 })).toEqual(new Set())
  })
  it('solo atribuye la reversa a un valor previamente reconocido y verificable', () => {
    expect(importeReconocido({ totalVentas: 7500 }, 'p')).toBeNull()
    const fila = { pedidoId: 'p', centavos: 750000, valorDeterminado: true, fechaAproximada: false }
    const snapshot = { ventasCriterio: 'ENTREGA_V1', ventasEntregaPorPedido: [fila] }
    expect(importeReconocido(snapshot, 'p')).toBe(750000)
    expect(importeReconocido({ ...snapshot, ventasEntregaPorPedido: [{ ...fila, fechaAproximada: true }] }, 'p')).toBeNull()
    expect(importeReconocido({ ...snapshot, ventasEntregaPorPedido: [fila, fila] }, 'p')).toBeNull()
  })
})
