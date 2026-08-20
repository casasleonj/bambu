import { describe, it, expect } from 'vitest'
import { getDiasAtraso, formatFechaPedido } from '../pedido-table'

describe('getDiasAtraso', () => {
  it('null si el pedido no está PENDIENTE', () => {
    expect(getDiasAtraso('2020-01-01T00:00:00-05:00', 'ENTREGADO')).toBeNull()
  })

  it('null si la fecha es de hoy', () => {
    const hoy = new Date().toISOString()
    expect(getDiasAtraso(hoy, 'PENDIENTE')).toBeNull()
  })

  it('null si la fecha es futura', () => {
    const manana = new Date(Date.now() + 2 * 86_400_000).toISOString()
    expect(getDiasAtraso(manana, 'PENDIENTE')).toBeNull()
  })

  it('calcula días de atraso para un PENDIENTE de días anteriores', () => {
    const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const hoy = new Date(`${hoyStr}T00:00:00-05:00`)
    const hace3Dias = new Date(hoy.getTime() - 3 * 86_400_000)
    expect(getDiasAtraso(hace3Dias.toISOString(), 'PENDIENTE')).toBe(3)
  })

  it('null si la fecha es inválida', () => {
    expect(getDiasAtraso('no-es-fecha', 'PENDIENTE')).toBeNull()
  })
})

// @tests formatFechaPedido: reemplaza toLocaleString con hour:'2-digit' para
// evitar un hydration mismatch reproducible (ICU inserta un espacio distinto
// antes de "a. m."/"p. m." según la versión de Node/motor del navegador).
// Estos casos fijan el contrato de salida exacto que debe preservarse.
describe('formatFechaPedido', () => {
  it('mañana: hora de un dígito con padding y "a. m."', () => {
    expect(formatFechaPedido('2026-08-20T13:11:00Z')).toBe('20 de ago, 08:11 a. m.')
  })

  it('tarde: hora "p. m."', () => {
    expect(formatFechaPedido('2026-08-20T20:05:00Z')).toBe('20 de ago, 03:05 p. m.')
  })

  it('medianoche (00:00 Bogotá) se muestra como 12:00 a. m.', () => {
    expect(formatFechaPedido('2026-08-20T05:00:00Z')).toBe('20 de ago, 12:00 a. m.')
  })

  it('mediodía (12:00 Bogotá) se muestra como 12:00 p. m.', () => {
    expect(formatFechaPedido('2026-08-20T17:00:00Z')).toBe('20 de ago, 12:00 p. m.')
  })

  it('día de un dígito sin padding (contrato de toLocaleDateString)', () => {
    expect(formatFechaPedido('2026-01-05T02:03:00Z')).toBe('4 de ene, 09:03 p. m.')
  })

  it('cadena vacía si la fecha es inválida', () => {
    expect(formatFechaPedido('no-es-fecha')).toBe('')
  })
})
