import { describe, expect, it } from 'vitest'
import { dateRangeForDay } from '../date-helpers'
import { diagnosticarArrastre, type DatosArrastre } from '../stock-arrastre-diagnostico'
import { compararArrastreBackend, type MovimientoObservado } from '../comparar-arrastre-backend'

const base: DatosArrastre = {
  diaObjetivo: '2026-08-03',
  cierre: { fecha: dateRangeForDay('2026-08-01').gte, stock: { PACA_AGUA: 100, PACA_HIELO: 0, BOTELLON: null } },
  producciones: [{ id: 'p', fecha: dateRangeForDay('2026-08-02').gte,
    registradaEn: dateRangeForDay('2026-08-02').gte,
    items: [{ producto: 'PACA_AGUA', producido: 40, rotas: 2, filtradas: 1, consumoInterno: 1, stockFinFisico: 105 }] }],
  entregas: { PACA_AGUA: 30, PACA_HIELO: 0, BOTELLON: 0 },
  entregasAproximadas: 0,
}
const actual = { stockIniAgua: 100, stockIniHielo: 0, stockIniBotellon: 8 }
const mov = (c: Partial<MovimientoObservado> = {}): MovimientoObservado => ({
  id: 'm', producto: 'PACA_AGUA', tipo: 'CARGA', cantidad: 20, origen: 'ALMACEN',
  destino: 'VEHICULO', sustitucion: false, ...c,
})
const comparar = (c: Partial<DatosArrastre> = {}, movimientos: MovimientoObservado[] = [], pendiente: boolean | null = false) =>
  compararArrastreBackend(diagnosticarArrastre({ ...base, ...c }), actual, pendiente, movimientos)
describe('F2-B comparación backend sin promover saldo parcial', () => {
  it('detecta arrastre viejo: 100 + 36 - 30 = 106, sin certificarlo', () => {
    expect(comparar().productos[0]).toMatchObject({ anterior: 100, esperadoParcial: 106,
      diferenciaConActual: 6, calidad: 'NO_CERTIFICADO', motivos: ['COBERTURA_DE_MOVIMIENTOS_NO_CERTIFICADA'] })
  })
  it('carga y entrega no se descuentan dos veces', () => {
    const p = comparar({}, [mov(), mov({ id: 'e', tipo: 'ENTREGA', origen: 'VEHICULO', destino: 'CLIENTE' })]).productos[0]
    expect(p.esperadoParcial).toBe(106)
    expect(p.evidencia.map(e => e.clasificacion)).toEqual(['TRANSFERENCIA_INTERNA_GLOBAL', 'REQUIERE_CONCILIACION'])
  })
  it.each(['RETORNO', 'DESCARTE', 'REEMPAQUE', 'AJUSTE_AUTORIZADO'])('no aplica %s sin corte y perímetro demostrados', tipo => {
    const p = comparar({}, [mov({ tipo })]).productos[0]
    expect(p.esperadoParcial).toBe(106)
    expect(p.motivos).toContain('MOVIMIENTOS_POR_CONCILIAR')
  })
  it('no trata sustitución ni custodia sin origen como transferencia interna certificada', () => {
    const p = comparar({}, [mov({ sustitucion: true }), mov({ id: 'n', origen: null })]).productos[0]
    expect(p.evidencia.every(e => e.clasificacion === 'REQUIERE_CONCILIACION')).toBe(true)
  })
  it('cierre inmediato sin reconstrucción: cero válido, botellón desconocido', () => {
    const res = comparar({ diaObjetivo: '2026-08-02', producciones: [],
      entregas: { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0 } })
    expect(res.productos[1]).toMatchObject({ esperadoParcial: 0, calidad: 'CIERRE_PREVIO_VALIDADO' })
    expect(res.productos[2]).toMatchObject({ esperadoParcial: null, diferenciaConActual: null, calidad: 'NO_CERTIFICADO' })
  })
  it('no certifica cierre importado pendiente ni entregas aproximadas', () => {
    const p = comparar({ entregasAproximadas: 1 }, [], true).productos[0]
    expect(p.motivos).toContain('CIERRE_PENDIENTE_VALIDACION')
    expect(p.motivos).toContain('ENTREGAS_APROXIMADAS')
  })
  it('sin ancla no inventa stock desde Config', () => {
    expect(comparar({ cierre: null, producciones: [] }, [], null).productos[0]).toMatchObject({
      esperadoParcial: null, diferenciaConActual: null, calidad: 'NO_CERTIFICADO' })
  })
  it('detecta ids duplicados y cantidades inválidas', () => {
    expect(() => comparar({}, [mov(), mov()])).toThrow('MOVIMIENTO_DUPLICADO_EN_LECTURA')
    expect(() => comparar({}, [mov({ cantidad: -1 })])).toThrow('CANTIDAD_MOVIMIENTO_INVALIDA')
  })
})
