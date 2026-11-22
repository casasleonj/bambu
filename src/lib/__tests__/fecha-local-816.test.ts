import { describe, expect, it } from 'vitest'
import { interpretarDiaColombia, mostrarDiaColombia, mostrarInstanteBogota } from '@/lib/fecha-local'

describe('#816 formato de fechas Colombia', () => {
  it('presenta un día de API siempre en DD/MM/AAAA', () => {
    expect(mostrarDiaColombia('2026-11-21')).toBe('21/11/2026')
    expect(mostrarDiaColombia('')).toBe('')
  })

  it('interpreta las fechas del usuario sin confundir día con mes', () => {
    expect(interpretarDiaColombia('21/11/2026')).toBe('2026-11-21')
    expect(interpretarDiaColombia('01/12/2026')).toBe('2026-12-01')
  })

  it('rechaza días inexistentes, años no bisiestos y entradas en formato MM/DD', () => {
    expect(interpretarDiaColombia('31/04/2026')).toBeNull()
    expect(interpretarDiaColombia('29/02/2025')).toBeNull()
    expect(interpretarDiaColombia('13/13/2026')).toBeNull()
    expect(interpretarDiaColombia('2026-11-21')).toBeNull()
    expect(interpretarDiaColombia('29/02/2024')).toBe('2024-02-29')
  })

  it('muestra el día real de Bogotá aunque el instante UTC ya sea del día siguiente', () => {
    expect(mostrarInstanteBogota('2026-11-22T02:00:00.000Z')).toBe('21/11/2026')
    expect(mostrarInstanteBogota('2026-11-22T05:01:00.000Z')).toBe('22/11/2026')
  })
})
