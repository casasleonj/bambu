// @tests #836 F2b: de fecha/hora tecleadas a lo que se guarda al crear un pedido.
import { describe, it, expect } from 'vitest'
import { resolverProgramacion } from '../programar-entrega'

const HOY = '2026-11-18'
describe('resolverProgramacion', () => {
  it('sin nada o «hoy» sin hora → no se guarda nada (sin ruido para quien no programa)', () => {
    expect(resolverProgramacion('', '', HOY)).toEqual({})
    expect(resolverProgramacion(HOY, '', HOY)).toEqual({})
  })
  it('hora sin fecha → hoy con esa hora', () => {
    expect(resolverProgramacion('', '16:00', HOY)).toEqual({ fechaEntrega: '2026-11-18T17:00:00.000Z', entregaNoAntesDe: '16:00' })
  })
  it('otro día sin hora → solo fecha, a mediodía de Bogotá', () => {
    expect(resolverProgramacion('2026-11-21', '', HOY)).toEqual({ fechaEntrega: '2026-11-21T17:00:00.000Z' })
  })
  it('otro día con hora', () => {
    expect(resolverProgramacion('2026-11-21', '06:00', HOY)).toEqual({ fechaEntrega: '2026-11-21T17:00:00.000Z', entregaNoAntesDe: '06:00' })
  })
  it('fecha pasada → error, incluso con hora', () => {
    expect(resolverProgramacion('2026-11-10', '06:00', HOY).error).toMatch(/ya pasó/)
  })
  it('hora o fecha mal formadas → error', () => {
    expect(resolverProgramacion('', '25:00', HOY).error).toMatch(/HH:MM/)
    expect(resolverProgramacion('21/11/2026', '', HOY).error).toMatch(/fecha válida/)
  })
})
