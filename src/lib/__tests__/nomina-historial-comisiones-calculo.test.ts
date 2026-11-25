import { describe, expect, it } from 'vitest'
import { agruparHistorialComisiones, diaPagoParaConsulta, resumirPagosComision, type PagoHistorialComision } from '../nomina-historial-comisiones-calculo'

function pago(id: string, cambios: Partial<PagoHistorialComision> = {}): PagoHistorialComision {
  return { id, trabajadorId: 't1', nombre: 'Trabajador', concepto: 'REPARTO', fechaTrabajo: '2026-11-23',
    fechaPagoReal: '2026-11-24', registradoAt: '2026-11-24T20:00:00Z', monto: 20000,
    metodo: 'EFECTIVO', registradoPor: null, correccion: null, ...cambios }
}

describe('#1010 F1 agrupación de pagos', () => {
  it('dos pagos de una jornada no duplican el grupo; los conceptos no se mezclan', () => {
    const pagos = [pago('a'), pago('b', { monto: 35500, metodo: 'NEQUI' }),
      pago('c', { concepto: 'PRODUCCION', monto: 133000 })]
    const grupos = agruparHistorialComisiones(pagos)
    expect(grupos).toHaveLength(2)
    const reparto = grupos.find(g => g.concepto === 'REPARTO')
    expect(reparto?.pagos.map(p => p.id)).toEqual(['a', 'b'])
    expect(reparto?.subtotalFiltro).toEqual({ cantidadPagos: 2, monto: 55500, efectivo: 20000, otrosMedios: 35500, sinFechaVerificada: 0 })
    expect(resumirPagosComision(pagos).monto).toBe(188500)
  })

  it('no confunde captura cerca de medianoche Bogotá con desembolso verificado', () => {
    const legado = pago('a', { fechaPagoReal: null, registradoAt: '2026-11-25T04:59:59Z' })
    expect(diaPagoParaConsulta(legado)).toBe('2026-11-24')
    expect(legado.fechaPagoReal).toBeNull()
    expect(resumirPagosComision([legado]).sinFechaVerificada).toBe(1)
  })

  it('centavos exactos y orden estable por jornada, trabajador, concepto e id', () => {
    const filas = [pago('b', { monto: 0.2 }), pago('a', { monto: 0.1 }),
      pago('c', { trabajadorId: 't2', fechaTrabajo: '2026-11-24' })]
    const grupos = agruparHistorialComisiones(filas)
    expect(grupos.map(g => g.trabajadorId)).toEqual(['t2', 't1'])
    expect(grupos[1].subtotalFiltro.monto).toBe(0.3)
    expect(grupos[1].pagos.map(p => p.id)).toEqual(['a', 'b'])
    expect(agruparHistorialComisiones([...filas].reverse())).toEqual(grupos)
  })

  it('rechaza duplicaciones de identidad en lugar de contar dos veces', () => {
    expect(() => agruparHistorialComisiones([pago('a'), pago('a')])).toThrow()
  })
})
