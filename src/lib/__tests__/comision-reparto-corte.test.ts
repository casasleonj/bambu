import { describe, expect, it } from 'vitest'
import { planificarVentanasReparto as plan } from '../comision-reparto-corte'

describe('#1010 F2B.2B.1 — ventanas de simulación sin liquidación', () => {
  it('separa el día anterior del día exacto del corte, inclusivo', () => {
    expect(plan('2026-11-01', '2026-11-30', '2026-11-15')).toEqual({
      modo: 'SIMULACION_NO_LIQUIDABLE', corte: '2026-11-15',
      previo: { desde: '2026-11-01', hasta: '2026-11-14' },
      ventanas: [{ desde: '2026-11-15', hasta: '2026-11-30' }], liquidable: false,
    })
  })
  it('no envía jornadas anteriores al diagnóstico versionado', () => {
    expect(plan('2026-11-01', '2026-11-30', '2026-12-01')).toMatchObject({
      previo: { desde: '2026-11-01', hasta: '2026-11-30' }, ventanas: [], liquidable: false,
    })
  })
  it('incluye una única jornada en el corte, sin segmento anterior', () => {
    expect(plan('2026-12-01', '2026-12-01', '2026-12-01')).toMatchObject({
      previo: null, ventanas: [{ desde: '2026-12-01', hasta: '2026-12-01' }],
    })
  })
  it('divide 63 jornadas entre años sin huecos ni solapamientos', () => {
    expect(plan('2026-12-01', '2027-02-01', '2026-11-01').ventanas).toEqual([
      { desde: '2026-12-01', hasta: '2026-12-31' },
      { desde: '2027-01-01', hasta: '2027-01-31' },
      { desde: '2027-02-01', hasta: '2027-02-01' },
    ])
  })
  it('conserva el 29 de febrero como jornada independiente', () => {
    expect(plan('2028-02-28', '2028-03-01', '2028-02-29')).toMatchObject({
      previo: { desde: '2028-02-28', hasta: '2028-02-28' },
      ventanas: [{ desde: '2028-02-29', hasta: '2028-03-01' }],
    })
  })
  it.each([
    ['2026-02-30', '2026-03-01', '2026-03-01'],
    ['2026-11-02', '2026-11-01', '2026-11-01'],
    ['2026-11-01', '2026-11-02', ' 2026-11-01'],
    ['2026-11-01', '2026-11-02', ''],
  ])('rechaza fechas inválidas o períodos invertidos: %s, %s, %s', (desde, hasta, corte) => {
    expect(() => plan(desde, hasta, corte)).toThrow()
  })
  it('no desborda la representación al terminar el año 9999', () => {
    expect(plan('9999-12-31', '9999-12-31', '9999-12-31').ventanas).toEqual([
      { desde: '9999-12-31', hasta: '9999-12-31' },
    ])
  })
})
