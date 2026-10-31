// @tests #451 / ADR-REDUCCION-COMERCIAL-001 — reducción comercial: reglas puras.
import { describe, it, expect } from 'vitest'
import {
  calcularReduccion,
  decidirAplicacionReduccion,
  pedidoReducible,
  puedeAutorizarReduccion,
  puedeSolicitarReduccion,
  repartirReduccionBotellon,
} from '../reduccion-comercial.service'

const base = { total: 50000, totalPagado: 0, cantPedido: 20, cantEntrega: 15, precio: 2500, cantidadReducida: 5, unidadesOtrasLineas: 0 }

describe('calcularReduccion', () => {
  it('el pedido pidió 20, recibió 15 y ya no quiere 5: baja total y saldo por 5 × precio', () => {
    expect(calcularReduccion(base)).toEqual({ monto: 12500, cantPedidoNueva: 15, totalNuevo: 37500, saldoNuevo: 37500 })
  })
  it('con prepago parcial baja el saldo, no lo pagado', () => {
    expect(calcularReduccion({ ...base, totalPagado: 20000 })).toMatchObject({ totalNuevo: 37500, saldoNuevo: 17500 })
  })
  it('un pago que cubre exacto el nuevo total deja saldo 0', () => {
    expect(calcularReduccion({ ...base, totalPagado: 37500 })).toMatchObject({ saldoNuevo: 0 })
  })
  it('pago mayor al nuevo total → REDUCCION_GENERARIA_SOBREPAGO', () => {
    expect(() => calcularReduccion({ ...base, totalPagado: 37500.01 })).toThrow('REDUCCION_GENERARIA_SOBREPAGO')
  })
  it('no baja de lo entregado', () => {
    expect(() => calcularReduccion({ ...base, cantidadReducida: 6 })).toThrow('REDUCCION_SOBRE_ENTREGADO')
  })
  it('no deja el pedido sin unidades, pero sí si otra línea conserva unidades', () => {
    const vacio = { ...base, cantEntrega: 0, cantidadReducida: 20 }
    expect(() => calcularReduccion(vacio)).toThrow('REDUCCION_TOTAL')
    expect(calcularReduccion({ ...vacio, unidadesOtrasLineas: 3, total: 56000 })).toMatchObject({ cantPedidoNueva: 0, totalNuevo: 6000 })
  })
  it.each([0, -1, 1.5, Number.NaN])('rechaza la cantidad %s', (cantidadReducida) => {
    expect(() => calcularReduccion({ ...base, cantidadReducida })).toThrow('CANTIDAD_INVALIDA')
  })
  it.each([0, -5, Number.NaN])('rechaza el precio %s', (precio) => {
    expect(() => calcularReduccion({ ...base, precio })).toThrow('PRECIO_INVALIDO')
  })
  it('no acumula error de punto flotante: 3 × $0,10 queda en $0,30 exactos', () => {
    const r = calcularReduccion({ total: 10, totalPagado: 0, cantPedido: 5, cantEntrega: 2, precio: 0.1, cantidadReducida: 3, unidadesOtrasLineas: 0 })
    expect(r).toEqual({ monto: 0.3, cantPedidoNueva: 2, totalNuevo: 9.7, saldoNuevo: 9.7 })
  })
  it('precios con centavos suman en centavos enteros', () => {
    const r = calcularReduccion({ total: 33.33, totalPagado: 0, cantPedido: 3, cantEntrega: 0, precio: 11.11, cantidadReducida: 2, unidadesOtrasLineas: 0 })
    expect(r).toEqual({ monto: 22.22, cantPedidoNueva: 1, totalNuevo: 11.11, saldoNuevo: 11.11 })
  })
})

describe('permisos', () => {
  const u = (rol: string, activo = true, permiso = true) => ({ rol, activo, puedeAutorizarReduccionComercial: permiso })
  it('registran ADMIN y ASISTENTE', () => {
    expect(puedeSolicitarReduccion('ADMIN')).toBe(true)
    expect(puedeSolicitarReduccion('ASISTENTE')).toBe(true)
    for (const rol of ['CONTADOR', 'REPARTIDOR', 'SELLADOR']) expect(puedeSolicitarReduccion(rol)).toBe(false)
  })
  it('autoriza solo con el permiso explícito: ser ADMIN no basta', () => {
    expect(puedeAutorizarReduccion(u('ADMIN', true, false))).toBe(false)
    expect(puedeAutorizarReduccion(u('ADMIN'))).toBe(true)
    expect(puedeAutorizarReduccion(u('ASISTENTE'))).toBe(true)
  })
  it('el permiso no sirve inactivo ni en un rol sin pedidos', () => {
    expect(puedeAutorizarReduccion(u('ADMIN', false))).toBe(false)
    expect(puedeAutorizarReduccion(u('REPARTIDOR'))).toBe(false)
    expect(puedeAutorizarReduccion(u('CONTADOR'))).toBe(false)
  })
  it('quien registra se aplica en el acto solo si puede autorizar', () => {
    expect(decidirAplicacionReduccion(u('ADMIN'))).toBe('APLICAR')
    expect(decidirAplicacionReduccion(u('ADMIN', true, false))).toBe('SOLICITAR')
    expect(decidirAplicacionReduccion(u('ASISTENTE', true, false))).toBe('SOLICITAR')
  })
})

describe('pedidoReducible', () => {
  it('cancelado o anulado no', () => {
    expect(pedidoReducible('CANCELADO', 'CANCELADO')).toBe(false)
    expect(pedidoReducible('ENTREGADO', 'ANULADO')).toBe(false)
    expect(pedidoReducible('ENTREGADO', 'ENTREGADO')).toBe(true)
    expect(pedidoReducible('PENDIENTE', 'PENDIENTE')).toBe(true)
  })
})

describe('repartirReduccionBotellon', () => {
  const p = { fabPed: 4, fabEnt: 3, domPed: 6, domEnt: 4 }
  it('quita primero lo pendiente a domicilio, luego en fábrica', () => {
    expect(repartirReduccionBotellon(p, 2)).toEqual({ fabPed: 4, domPed: 4 })
    expect(repartirReduccionBotellon(p, 3)).toEqual({ fabPed: 3, domPed: 4 })
  })
  it('nunca baja de lo entregado', () => {
    expect(() => repartirReduccionBotellon(p, 4)).toThrow('REDUCCION_SOBRE_ENTREGADO')
  })
})
