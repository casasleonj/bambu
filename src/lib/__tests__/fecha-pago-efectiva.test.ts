// @tests #673 — reglas puras de la fecha efectiva de un pago al personal.
import { describe, it, expect } from 'vitest'
import { FechaPagoError, instanteDelDia, resolverFechaPago } from '@/lib/fecha-pago-efectiva'

const HOY = '2026-11-16'

describe('resolverFechaPago', () => {
  it('sin fecha o con la de hoy es el pago normal: no guarda instante ni pide motivo', () => {
    expect(resolverFechaPago({ hoy: HOY })).toEqual({ esHoy: true, dia: HOY, instante: null, motivo: null })
    expect(resolverFechaPago({ fecha: HOY, hoy: HOY }).esHoy).toBe(true)
    expect(resolverFechaPago({ fecha: '  ', hoy: HOY }).esHoy).toBe(true)
  })

  it('una fecha pasada con motivo guarda el mediodía de Bogotá de ese día', () => {
    const r = resolverFechaPago({ fecha: '2026-11-13', motivo: '  Se pagó ese día ', hoy: HOY })
    expect(r.esHoy).toBe(false)
    expect(r.motivo).toBe('Se pagó ese día')
    expect(r.instante?.toISOString()).toBe('2026-11-13T17:00:00.000Z')
    expect(instanteDelDia('2026-11-13').toISOString()).toBe('2026-11-13T17:00:00.000Z')
  })

  it('una fecha pasada sin motivo (o con menos de 3 letras) se rechaza', () => {
    for (const motivo of [undefined, null, '', '  ', 'ab']) {
      expect(() => resolverFechaPago({ fecha: '2026-11-13', motivo, hoy: HOY })).toThrowError(FechaPagoError)
    }
    try { resolverFechaPago({ fecha: '2026-11-13', hoy: HOY }) } catch (e) {
      expect(e).toMatchObject({ code: 'MOTIVO_FECHA_REQUERIDO', status: 422 })
    }
  })

  it('una fecha futura o inválida se rechaza', () => {
    expect(() => resolverFechaPago({ fecha: '2026-11-17', motivo: 'prueba', hoy: HOY })).toThrowError(/no ha llegado/)
    try { resolverFechaPago({ fecha: '2026-11-17', motivo: 'prueba', hoy: HOY }) } catch (e) {
      expect(e).toMatchObject({ code: 'FECHA_PAGO_FUTURA' })
    }
    for (const fecha of ['16/11/2026', '2026-02-30', 'ayer']) {
      try { resolverFechaPago({ fecha, motivo: 'prueba', hoy: HOY }); expect.unreachable() } catch (e) {
        expect(e).toMatchObject({ code: 'FECHA_PAGO_INVALIDA' })
      }
    }
  })
})
