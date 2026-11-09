// @tests #617 — reglas puras de la corrección de la fecha efectiva de un pago
import { describe, expect, it } from 'vitest'
import {
  CorreccionFechaPagoError,
  cobroAnteriorAlPedido,
  esDiaValido,
  puedeCorregirFechaPago,
  resolverCorreccionFecha,
} from '@/lib/pago-fecha-correccion'

// Registrado el sábado 8 nov 2026 a las 09:12 en Bogotá (14:12 UTC).
const registro = new Date('2026-11-08T14:12:00Z')
const codigo = (f: () => unknown): string | null => {
  try { f(); return null } catch (e) { return e instanceof CorreccionFechaPagoError ? e.code : 'OTRO' }
}

describe('puedeCorregirFechaPago', () => {
  it('solo el ADMIN', () => {
    expect(puedeCorregirFechaPago('ADMIN')).toBe(true)
    for (const r of ['ASISTENTE', 'CONTADOR', 'REPARTIDOR', '', null, undefined]) expect(puedeCorregirFechaPago(r)).toBe(false)
  })
})

describe('esDiaValido', () => {
  it('acepta fechas reales y rechaza formato y días imposibles', () => {
    expect(esDiaValido('2026-11-07')).toBe(true)
    expect(esDiaValido('2026-02-30')).toBe(false)
    expect(esDiaValido('07/11/2026')).toBe(false)
    expect(esDiaValido('2026-13-01')).toBe(false)
    expect(esDiaValido('')).toBe(false)
  })
})

describe('resolverCorreccionFecha', () => {
  it('a un día anterior al registro: guarda el mediodía de Bogotá de ese día y nunca pasa del registro', () => {
    const r = resolverCorreccionFecha({ createdAt: registro, ocurridoAt: null }, '2026-11-07')
    expect(r.ocurridoAt?.toISOString()).toBe('2026-11-07T17:00:00.000Z') // 12:00 Bogotá
    expect(r.ocurridoAt!.getTime()).toBeLessThanOrEqual(registro.getTime())
    expect(r.diaAnterior).toBe('2026-11-08')
    expect(r.diaNuevo).toBe('2026-11-07')
    expect(r.fechaAnterior).toEqual(registro)
  })

  it('al mismo día del registro: la fecha efectiva vuelve a ser el registro (ocurridoAt null)', () => {
    const pago = { createdAt: registro, ocurridoAt: new Date('2026-11-07T17:00:00Z') }
    const r = resolverCorreccionFecha(pago, '2026-11-08')
    expect(r.ocurridoAt).toBeNull()
    expect(r.fechaNueva).toEqual(registro)
    expect(r.fechaAnterior).toEqual(pago.ocurridoAt)
  })

  it('no admite un día posterior al registro, un formato malo ni dejar la misma fecha', () => {
    const pago = { createdAt: registro, ocurridoAt: new Date('2026-11-07T17:00:00Z') }
    expect(codigo(() => resolverCorreccionFecha(pago, '2026-11-09'))).toBe('FECHA_POSTERIOR_AL_REGISTRO')
    expect(codigo(() => resolverCorreccionFecha(pago, '2026-02-30'))).toBe('FECHA_INVALIDA')
    expect(codigo(() => resolverCorreccionFecha(pago, 'ayer'))).toBe('FECHA_INVALIDA')
    expect(codigo(() => resolverCorreccionFecha(pago, '2026-11-07'))).toBe('SIN_CAMBIO')
    expect(codigo(() => resolverCorreccionFecha({ createdAt: registro, ocurridoAt: null }, '2026-11-08'))).toBe('SIN_CAMBIO')
  })

  it('usa el día de Bogotá, no el de UTC (21:30 Bogotá ya es el día siguiente en UTC)', () => {
    const tarde = new Date('2026-11-09T02:30:00Z') // 21:30 del 8 nov en Bogotá
    // El 8 en Bogotá (no el 9 de UTC): ya es el día de ese cobro, no hay nada que corregir.
    expect(codigo(() => resolverCorreccionFecha({ createdAt: tarde, ocurridoAt: null }, '2026-11-08'))).toBe('SIN_CAMBIO')
    expect(resolverCorreccionFecha({ createdAt: tarde, ocurridoAt: null }, '2026-11-07').diaAnterior).toBe('2026-11-08')
  })
})

describe('cobroAnteriorAlPedido', () => {
  it('avisa si el cobro es de un día anterior a la creación del pedido y no si es del mismo día o posterior', () => {
    const pedido = new Date('2026-11-08T15:00:00Z')
    expect(cobroAnteriorAlPedido(new Date('2026-11-07T17:00:00Z'), pedido)).toBe(true)
    expect(cobroAnteriorAlPedido(new Date('2026-11-08T13:00:00Z'), pedido)).toBe(false)
    expect(cobroAnteriorAlPedido(new Date('2026-11-09T13:00:00Z'), pedido)).toBe(false)
  })
})
