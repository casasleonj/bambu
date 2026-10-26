import { describe, it, expect } from 'vitest'
import { camposCobro, datosCobroIniciales, hayErroresCobro, validarCobro, type DatosCobroOficina } from '../logica-cobro'

// 2026-10-26 12:00 en Bogotá (17:00Z).
const AHORA = new Date('2026-10-26T17:00:00.000Z')
const base = (cambios: Partial<DatosCobroOficina> = {}): DatosCobroOficina => ({ ...datosCobroIniciales(AHORA), ...cambios })

describe('#472 — cobro de fiado: quién recibió y cuándo (lógica pura)', () => {
  it('empieza sin elegir quién recibió y con la fecha de hoy', () => {
    expect(datosCobroIniciales(AHORA)).toEqual({ quien: null, repartidorId: '', fecha: '2026-10-26' })
  })

  it('exige decir quién recibió el dinero', () => {
    expect(validarCobro(base(), AHORA).quien).toBe('Indica quién recibió el dinero.')
    expect(hayErroresCobro(validarCobro(base({ quien: 'OFICINA' }), AHORA))).toBe(false)
  })

  it('si lo recibió un repartidor, exige elegirlo', () => {
    expect(validarCobro(base({ quien: 'REPARTIDOR' }), AHORA).repartidor).toBe('Elige qué repartidor recibió el dinero.')
    expect(hayErroresCobro(validarCobro(base({ quien: 'REPARTIDOR', repartidorId: 'r1' }), AHORA))).toBe(false)
  })

  it('acepta de hoy hasta 7 días atrás y rechaza futuro o más antiguo', () => {
    expect(validarCobro(base({ quien: 'OFICINA', fecha: '2026-10-19' }), AHORA).fecha).toBeUndefined()
    expect(validarCobro(base({ quien: 'OFICINA', fecha: '2026-10-18' }), AHORA).fecha).toMatch(/hasta 7 días atrás/)
    expect(validarCobro(base({ quien: 'OFICINA', fecha: '2026-10-27' }), AHORA).fecha).toMatch(/no puede ser futura/)
  })

  it('hoy no envía fecha; otro día envía el mediodía de Bogotá', () => {
    expect(camposCobro(base({ quien: 'OFICINA' }), AHORA)).toEqual({ recibioDinero: 'OFICINA' })
    expect(camposCobro(base({ quien: 'OFICINA', fecha: '2026-10-24' }), AHORA)).toEqual({
      recibioDinero: 'OFICINA',
      fechaRecepcion: '2026-10-24T17:00:00.000Z',
    })
  })

  it('envía el repartidor solo si lo recibió un repartidor', () => {
    expect(camposCobro(base({ quien: 'REPARTIDOR', repartidorId: 'r1' }), AHORA)).toEqual({ recibioDinero: 'REPARTIDOR', repartidorId: 'r1' })
    expect(camposCobro(base({ quien: 'OFICINA', repartidorId: 'r1' }), AHORA)).toEqual({ recibioDinero: 'OFICINA' })
  })
})
