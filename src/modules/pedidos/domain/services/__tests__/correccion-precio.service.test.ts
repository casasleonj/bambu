// @tests ADR-MONETARIO-002 §1 (Fase D) — corrección de precio: reglas puras.
import { describe, it, expect } from 'vitest'
import {
  calcularCorreccion,
  decidirAplicacion,
  esPrecioRaro,
  pedidoCorregible,
  puedeResolverCorreccion,
  puedeSolicitarCorreccion,
} from '../correccion-precio.service'

const base = { total: 25000, totalPagado: 0, cantidad: 10, precioAnterior: 2500, precioNuevo: 2300 }

describe('calcularCorreccion', () => {
  it('baja el precio: recalcula total y saldo para toda la cantidad pedida', () => {
    expect(calcularCorreccion(base)).toEqual({ delta: -2000, totalNuevo: 23000, saldoNuevo: 23000, excedente: 0, totalPagadoNuevo: 0 })
  })
  it('sube el precio', () => {
    expect(calcularCorreccion({ ...base, precioNuevo: 2600 })).toEqual({ delta: 1000, totalNuevo: 26000, saldoNuevo: 26000, excedente: 0, totalPagadoNuevo: 0 })
  })
  it('con abono parcial el saldo descuenta lo pagado', () => {
    expect(calcularCorreccion({ ...base, totalPagado: 10000 }).saldoNuevo).toBe(13000)
  })
  it('pagado exacto al nuevo total: saldo 0, permitido', () => {
    expect(calcularCorreccion({ ...base, totalPagado: 23000 }).saldoNuevo).toBe(0)
  })
  it('pagó de más: el pedido queda pagado por su nuevo total y el resto es excedente (va a saldo a favor)', () => {
    expect(calcularCorreccion({ ...base, totalPagado: 25000 })).toEqual({
      delta: -2000, totalNuevo: 23000, saldoNuevo: 0, excedente: 2000, totalPagadoNuevo: 23000,
    })
  })
  it('un centavo de más ya es excedente', () => {
    expect(calcularCorreccion({ ...base, totalPagado: 23000.01 })).toMatchObject({ excedente: 0.01, totalPagadoNuevo: 23000, saldoNuevo: 0 })
  })
  it('subir el precio nunca genera excedente: el pedido queda debiendo la diferencia', () => {
    expect(calcularCorreccion({ ...base, totalPagado: 25000, precioNuevo: 2600 })).toMatchObject({ excedente: 0, totalPagadoNuevo: 25000, saldoNuevo: 1000 })
  })
  it('invariante: totalPagadoNuevo + saldoNuevo = totalNuevo y totalPagadoNuevo + excedente = totalPagado', () => {
    for (const totalPagado of [0, 0.01, 10000, 22999.99, 23000, 23000.01, 24999.99, 25000]) {
      for (const precioNuevo of [2000, 2300, 2499.99, 2600]) {
        const r = calcularCorreccion({ ...base, totalPagado, precioNuevo })
        expect(Math.round((r.totalPagadoNuevo + r.saldoNuevo) * 100)).toBe(Math.round(r.totalNuevo * 100))
        expect(Math.round((r.totalPagadoNuevo + r.excedente) * 100)).toBe(Math.round(totalPagado * 100))
      }
    }
  })
  it('precio vacío, 0, negativo o NaN no es una corrección', () => {
    for (const p of [0, -5, Number.NaN]) {
      expect(() => calcularCorreccion({ ...base, precioNuevo: p })).toThrow(/^PRECIO_INVALIDO/)
    }
  })
  it('mismo precio: sin cambio', () => {
    expect(() => calcularCorreccion({ ...base, precioNuevo: 2500 })).toThrow(/^PRECIO_SIN_CAMBIO/)
  })
  it('línea sin cantidad', () => {
    expect(() => calcularCorreccion({ ...base, cantidad: 0 })).toThrow(/^LINEA_SIN_CANTIDAD/)
  })
  it('redondea a centavos', () => {
    expect(calcularCorreccion({ ...base, cantidad: 3, precioAnterior: 1000.1, precioNuevo: 1000.2 }).delta).toBe(0.3)
  })
})

describe('esPrecioRaro', () => {
  it('pacas por debajo de $2.000', () => {
    expect(esPrecioRaro('PACA_AGUA', 1999)).toBe(true)
    expect(esPrecioRaro('PACA_AGUA', 2000)).toBe(false)
    expect(esPrecioRaro('PACA_HIELO', 1500)).toBe(true)
  })
  it('botellón por debajo de $7.500', () => {
    expect(esPrecioRaro('BOTELLON', 7499)).toBe(true)
    expect(esPrecioRaro('BOTELLON', 7500)).toBe(false)
  })
  it('bolsas no tienen umbral definido', () => {
    expect(esPrecioRaro('BOLSA_AGUA', 1)).toBe(false)
  })
})

describe('permisos', () => {
  it('ADMIN aplica; ASISTENTE solo solicita', () => {
    expect(decidirAplicacion('ADMIN')).toBe('APLICAR')
    expect(decidirAplicacion('ASISTENTE')).toBe('SOLICITAR')
  })
  it('solicitan ADMIN y ASISTENTE; no REPARTIDOR ni CONTADOR', () => {
    expect(puedeSolicitarCorreccion('ADMIN')).toBe(true)
    expect(puedeSolicitarCorreccion('ASISTENTE')).toBe(true)
    expect(puedeSolicitarCorreccion('REPARTIDOR')).toBe(false)
    expect(puedeSolicitarCorreccion('CONTADOR')).toBe(false)
  })
  it('solo ADMIN resuelve', () => {
    expect(puedeResolverCorreccion('ADMIN')).toBe(true)
    expect(puedeResolverCorreccion('ASISTENTE')).toBe(false)
  })
})

describe('pedidoCorregible', () => {
  it('no se corrige un pedido cancelado o anulado', () => {
    expect(pedidoCorregible('CANCELADO', 'CANCELADO')).toBe(false)
    expect(pedidoCorregible('ENTREGADO', 'ANULADO')).toBe(false)
    expect(pedidoCorregible('EN_RUTA', 'EN_RUTA')).toBe(true)
  })
})
