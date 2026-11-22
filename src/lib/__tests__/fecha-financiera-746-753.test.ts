// @tests #746/#753 — fechas de la jornada en Bogotá, rangos semiabiertos y gasto con zona.
import { describe, expect, it } from 'vitest'
import { dateRangeForDay, dayInBogota } from '@/lib/date-helpers'
import { parseFechaGasto } from '@/lib/fecha-gasto'
import { GastoCreateSchema } from '@/lib/validators'

describe('#746 rango semiabierto de la jornada en Bogotá', () => {
  it('incluye 23:59:59.999 y excluye solo 00:00 del día siguiente', () => {
    const rango = dateRangeForDay('2026-11-10')
    const anterior = new Date('2026-11-10T23:59:59.998-05:00')
    const ultimoMs = new Date('2026-11-10T23:59:59.999-05:00')
    const siguiente = new Date('2026-11-11T00:00:00-05:00')
    expect(rango.gte.toISOString()).toBe('2026-11-10T05:00:00.000Z')
    expect(anterior >= rango.gte && anterior < rango.lt).toBe(true)
    expect(ultimoMs >= rango.gte && ultimoMs < rango.lt).toBe(true)
    expect(siguiente < rango.lt).toBe(false)
    expect(rango.lt.toISOString()).toBe(siguiente.toISOString())
  })

  it('conserva intervalos consecutivos al cambiar año y mes', () => {
    const dic = dateRangeForDay('2026-12-31')
    const ene = dateRangeForDay('2027-01-01')
    expect(dic.lt.getTime()).toBe(ene.gte.getTime())
    expect(ene.lt.getTime() - ene.gte.getTime()).toBe(86_400_000)
  })
})

describe('#753 parseo de fechas efectivas de gastos sin ambigüedad UTC', () => {
  it('interpreta YYYY-MM-DD como medianoche Bogotá', () => {
    const fecha = parseFechaGasto('2026-11-09')
    expect(fecha?.toISOString()).toBe('2026-11-09T05:00:00.000Z')
    expect(dayInBogota(fecha!)).toBe('2026-11-09')
    expect(parseFechaGasto('2026-12-31')?.toISOString()).toBe('2026-12-31T05:00:00.000Z')
  })

  it('respeta el instante ISO con zona explícita, incluso corte de día', () => {
    expect(parseFechaGasto('2026-11-09T23:59:59.999-05:00')?.toISOString()).toBe('2026-11-10T04:59:59.999Z')
    expect(parseFechaGasto('2026-11-10T00:00:00.000Z')?.toISOString()).toBe('2026-11-10T00:00:00.000Z')
  })

  it.each(['', '2026-02-30', '2026-13-01', '2026-11-09T23:00:00', '2026/11/09', '2026-11-09T25:00:00-05:00', '2026-11-09T23:00:00+14:30'])(
    'rechaza una fecha ambigua o imposible: %s', (fecha) => {
      expect(parseFechaGasto(fecha)).toBeNull()
      expect(GastoCreateSchema.safeParse({ categoria: 'OTRO', descripcion: 'Ensayo', monto: 100, fecha }).success).toBe(false)
    },
  )

  it('preserva compatibilidad: fecha opcional sigue aceptada', () => {
    expect(GastoCreateSchema.safeParse({ categoria: 'OTRO', descripcion: 'Ensayo', monto: 100 }).success).toBe(true)
  })
})
