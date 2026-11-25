import { describe, expect, it } from 'vitest'
import { dateRangeForDay } from '../date-helpers'
import { diagnosticarArrastre, type DatosArrastre, type ObservacionProduccion } from '../stock-arrastre-diagnostico'

const fecha = (dia: string) => dateRangeForDay(dia).gte
const datos = (cambios: Partial<DatosArrastre> = {}): DatosArrastre => ({
  diaObjetivo: '2026-08-04',
  cierre: { fecha: fecha('2026-08-01'), stock: { PACA_AGUA: 100, PACA_HIELO: 0, BOTELLON: null } },
  producciones: [],
  entregas: { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0 },
  entregasAproximadas: 0,
  ...cambios,
})
function turno(id: string, dia: string, producido: number, stockFinFisico: number, rotas = 0): ObservacionProduccion {
  return { id, fecha: fecha(dia), registradaEn: new Date(+fecha(dia) + 3600_000),
    items: [{ producto: 'PACA_AGUA', producido, stockFinFisico, rotas, filtradas: 0, consumoInterno: 0 }] }
}
const agua = (d: DatosArrastre) => diagnosticarArrastre(d).productos[0]

describe('F2-A diagnóstico de arrastre, no stock operativo', () => {
  it('reproduce el salto de un día sin cierre y distingue subtotal de conteo', () => {
    const res = agua(datos({ diaObjetivo: '2026-08-03', producciones: [turno('a', '2026-08-02', 40, 105)],
      entregas: { PACA_AGUA: 30, PACA_HIELO: 0, BOTELLON: 0 } }))
    expect(res).toMatchObject({ base: 100, saldoParcial: 110, calidad: 'ESTIMADO_INCOMPLETO' })
    expect(res.conteos).toMatchObject([{ cantidad: 105, alcance: 'NO_VERIFICADO' }])
  })
  it('varios turnos: suma producción neta una vez, no suma conteos ni ventas de snapshots', () => {
    const res = agua(datos({ producciones: [turno('a', '2026-08-02', 20, 0, 2), turno('b', '2026-08-02', 20, 105)],
      entregas: { PACA_AGUA: 35, PACA_HIELO: 0, BOTELLON: 0 } }))
    expect(res).toMatchObject({ produccionNeta: 38, saldoParcial: 103 })
    expect(res.conteos.map(c => c.cantidad)).toEqual([0, 105])
  })
  it('incluye entregas de días sin producción y conserva negativos', () => {
    expect(agua(datos({ entregas: { PACA_AGUA: 110, PACA_HIELO: 0, BOTELLON: 0 } })).saldoParcial).toBe(-10)
  })
  it('cero confirmado por cierre inmediato no se confunde con botellón desconocido', () => {
    const res = diagnosticarArrastre(datos({ diaObjetivo: '2026-08-02' }))
    expect(res.diasIntermedios).toBe(0)
    expect(res.productos[1]).toMatchObject({ saldoParcial: 0, calidad: 'CIERRE_PREVIO' })
    expect(res.productos[2]).toMatchObject({ saldoParcial: null, calidad: 'SIN_ANCLA' })
  })
  it('sin ancla fechada no inventa saldo ni declara cero', () => {
    expect(agua(datos({ cierre: null }))).toMatchObject({ saldoParcial: null, calidad: 'SIN_ANCLA' })
  })
  it('no acepta cierre del propio día ni del futuro', () => {
    for (const dia of ['2026-08-04', '2026-08-05']) {
      expect(() => agua(datos({ cierre: { fecha: fecha(dia), stock: { PACA_AGUA: 10, PACA_HIELO: 0, BOTELLON: 0 } } }))).toThrow('ANCLA_NO_ANTERIOR')
    }
  })
  it('excluye producción ya incluida por cierre o del día objetivo', () => {
    for (const dia of ['2026-08-01', '2026-08-04']) {
      expect(() => agua(datos({ producciones: [turno('a', dia, 20, 0)] }))).toThrow('PRODUCCION_FUERA_DEL_INTERVALO')
    }
  })
  it('no acepta el mismo registro de producción dos veces', () => {
    const t = turno('a', '2026-08-02', 20, 0)
    expect(() => agua(datos({ producciones: [t, t] }))).toThrow('PRODUCCION_DUPLICADA_EN_LECTURA')
  })
  it('conserva incertidumbre de entregas aproximadas y cobertura parcial', () => {
    expect(diagnosticarArrastre(datos({ entregasAproximadas: 3 }))).toMatchObject({
      entregasAproximadas: 3, cobertura: 'PRODUCCION_NETA_Y_ENTREGAS', diasIntermedios: 2,
    })
  })
  it('rechaza día imposible', () => {
    expect(() => agua(datos({ diaObjetivo: '2026-02-30' }))).toThrow('DIA_OBJETIVO_INVALIDO')
  })
})
