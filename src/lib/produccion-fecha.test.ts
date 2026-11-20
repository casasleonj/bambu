import { describe, expect, it } from 'vitest'
import { DIAS_MAX_PRODUCCION_ATRASADA, motivoFechaProduccionInvalida } from './produccion-fecha'

describe('fecha de producción en cierre atrasado #899', () => {
  const hoy = '2026-11-19'

  it('admite registrar la producción del 7 de noviembre (12 días atrás)', () => {
    expect(motivoFechaProduccionInvalida('2026-11-07', hoy)).toBeNull()
  })

  it('admite hoy y el límite de 30 días anteriores', () => {
    expect(DIAS_MAX_PRODUCCION_ATRASADA).toBe(30)
    expect(motivoFechaProduccionInvalida(hoy, hoy)).toBeNull()
    expect(motivoFechaProduccionInvalida('2026-10-20', hoy)).toBeNull()
  })

  it('rechaza el día 31 y fechas futuras', () => {
    expect(motivoFechaProduccionInvalida('2026-10-19', hoy)).toBe('FECHA_MUY_ANTIGUA')
    expect(motivoFechaProduccionInvalida('2026-11-20', hoy)).toBe('FECHA_FUTURA')
  })

  it('mantiene la validación de formato', () => {
    expect(motivoFechaProduccionInvalida('no-es-fecha', hoy)).toBe('FECHA_MUY_ANTIGUA')
  })
})
