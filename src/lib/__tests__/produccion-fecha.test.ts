// @tests #645 — fechas permitidas para registrar o corregir producción (cierre atrasado hasta 30 días).
import { describe, it, expect } from 'vitest'
import { motivoFechaProduccionInvalida, DIAS_MAX_PRODUCCION_ATRASADA } from '../produccion-fecha'

describe('#645 — motivoFechaProduccionInvalida', () => {
  const hoy = '2026-11-10'
  it('hoy y los 30 días anteriores sirven', () => {
    expect(DIAS_MAX_PRODUCCION_ATRASADA).toBe(30)
    for (const f of ['2026-11-10', '2026-11-09', '2026-11-03', '2026-10-11']) expect(motivoFechaProduccionInvalida(f, hoy)).toBeNull()
  })
  it('31 días atrás o más es demasiado antigua', () => {
    expect(motivoFechaProduccionInvalida('2026-10-10', hoy)).toBe('FECHA_MUY_ANTIGUA')
    expect(motivoFechaProduccionInvalida('2026-01-01', hoy)).toBe('FECHA_MUY_ANTIGUA')
  })
  it('una fecha futura se rechaza', () => {
    expect(motivoFechaProduccionInvalida('2026-11-11', hoy)).toBe('FECHA_FUTURA')
  })
  it('cruza meses y años sin errores', () => {
    expect(motivoFechaProduccionInvalida('2026-12-28', '2027-01-02')).toBeNull()
    expect(motivoFechaProduccionInvalida('2026-12-03', '2027-01-02')).toBeNull()
    expect(motivoFechaProduccionInvalida('2026-12-02', '2027-01-02')).toBe('FECHA_MUY_ANTIGUA')
  })
  it('un texto que no es fecha se rechaza', () => {
    expect(motivoFechaProduccionInvalida('2026-13-45', hoy)).not.toBeNull()
    expect(motivoFechaProduccionInvalida('mañana', hoy)).not.toBeNull()
  })
})
