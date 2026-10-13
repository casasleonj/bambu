import { describe, it, expect } from 'vitest'
import {
  estadoEntregaAlCrear,
  dejaEntregaPendiente,
  requiereEntregaSuficiente,
  ubicacionEntregaValida,
  destinoEfectivoCambia,
} from '../entrega-politica.service'

describe('estadoEntregaAlCrear — autoridad única para Preview y Crear', () => {
  it('PEDIDO sin canal PUNTO nunca nace entregado, aunque llegue entregado:true', () => {
    expect(estadoEntregaAlCrear({ origen: 'PEDIDO', entregado: true })).toBe('PENDIENTE')
    expect(estadoEntregaAlCrear({ origen: 'PEDIDO', canal: 'DOMICILIO', entregado: true })).toBe('PENDIENTE')
    expect(estadoEntregaAlCrear({ origen: 'PEDIDO' })).toBe('PENDIENTE')
  })
  it('venta de PUNTO con entregado:true EXPLÍCITO nace ENTREGADA aunque tenga cliente (origen PEDIDO)', () => {
    expect(estadoEntregaAlCrear({ origen: 'PEDIDO', canal: 'PUNTO', entregado: true })).toBe('ENTREGADO')
  })
  it('un pedido de PUNTO sin entregado explícito, o con entregado:false, sigue PENDIENTE ("para recoger"/entrega posterior)', () => {
    expect(estadoEntregaAlCrear({ origen: 'PEDIDO', canal: 'PUNTO' })).toBe('PENDIENTE')
    expect(estadoEntregaAlCrear({ origen: 'PEDIDO', canal: 'PUNTO', entregado: null })).toBe('PENDIENTE')
    expect(estadoEntregaAlCrear({ origen: 'PEDIDO', canal: 'PUNTO', entregado: false })).toBe('PENDIENTE')
  })
  it('VENTA_RAPIDA nace ENTREGADO salvo que se pida entrega posterior (entregado:false)', () => {
    expect(estadoEntregaAlCrear({ origen: 'VENTA_RAPIDA' })).toBe('ENTREGADO')
    expect(estadoEntregaAlCrear({ origen: 'VENTA_RAPIDA', entregado: true })).toBe('ENTREGADO')
    expect(estadoEntregaAlCrear({ origen: 'VENTA_RAPIDA', entregado: false })).toBe('PENDIENTE')
  })
  it('RECURRENTE y VENTA_LIBRE por este camino nacen PENDIENTE', () => {
    expect(estadoEntregaAlCrear({ origen: 'RECURRENTE' })).toBe('PENDIENTE')
  })
})

describe('dejaEntregaPendiente', () => {
  it.each([
    ['PENDIENTE', true],
    ['EN_RUTA', true],
    ['NO_ENTREGADO', true],
    ['ENTREGADO', false],
    ['CANCELADO', false],
    ['ANULADO', false],
  ])('%s → %s', (estado, esperado) => {
    expect(dejaEntregaPendiente(estado)).toBe(esperado)
  })
})

describe('requiereEntregaSuficiente — el carácter anónimo NO es excepción', () => {
  it('DOMICILIO con entrega pendiente la exige (cliente real o CONSUMIDOR_FINAL)', () => {
    expect(requiereEntregaSuficiente({ canal: 'DOMICILIO', estadoEntrega: 'PENDIENTE' })).toBe(true)
  })
  it('DOMICILIO ya entregado físicamente no exige una dirección futura', () => {
    expect(requiereEntregaSuficiente({ canal: 'DOMICILIO', estadoEntrega: 'ENTREGADO' })).toBe(false)
  })
  it('PUNTO nunca la exige', () => {
    expect(requiereEntregaSuficiente({ canal: 'PUNTO', estadoEntrega: 'PENDIENTE' })).toBe(false)
  })
  it('un pedido cerrado (cancelado/anulado) no la exige', () => {
    expect(requiereEntregaSuficiente({ canal: 'DOMICILIO', estadoEntrega: 'CANCELADO' })).toBe(false)
  })
})

describe('ubicacionEntregaValida — nunca se persiste un destino que resolverEntrega rechazaría', () => {
  it('acepta un par finito, en rango y distinto de (0,0)', () => {
    expect(ubicacionEntregaValida(4.711, -74.0721)).toEqual({ lat: 4.711, lng: -74.0721 })
    expect(ubicacionEntregaValida('4.711', '-74.0721')).toEqual({ lat: 4.711, lng: -74.0721 })
  })
  it.each([
    [null, -74], [4.7, null], [undefined, undefined],
    [0, 0], [NaN, -74], [Infinity, 0.1],
    [91, 10], [-91, 10], [10, 181], [10, -181],
    ['abc', 1],
  ])('rechaza (%s, %s)', (lat, lng) => {
    expect(ubicacionEntregaValida(lat, lng)).toBeNull()
  })
})

describe('destinoEfectivoCambia — ediciones independientes no revalidan', () => {
  const base = { direccion: 'Cra 7 # 10-20', barrio: 'Centro', lat: 4.711, lng: -74.0721 }
  it('idéntico → no cambia (aunque se reenvíe)', () => {
    expect(destinoEfectivoCambia(base, { ...base })).toBe(false)
  })
  it('espacios y diferencias < 1e-6 no cuentan', () => {
    expect(destinoEfectivoCambia(base, { ...base, direccion: '  Cra 7 # 10-20 ', lat: 4.7110004 })).toBe(false)
  })
  it.each([
    ['dirección', { direccion: 'Cll 1' }],
    ['barrio', { barrio: 'Chapinero' }],
    ['latitud', { lat: 4.8 }],
    ['longitud', { lng: -74.2 }],
    ['quitar coords', { lat: null, lng: null }],
  ])('cambia al modificar %s', (_n, parche) => {
    expect(destinoEfectivoCambia(base, { ...base, ...parche })).toBe(true)
  })
})
