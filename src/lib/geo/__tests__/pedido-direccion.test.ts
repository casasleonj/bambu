// @tests pedido-direccion — regla única de dirección de texto efectiva
// Gemelo de pedido-coords.test.ts: override (dirección de entrega por
// pedido) → negocio → cliente → ninguna.

import { describe, it, expect } from 'vitest'
import { pickDireccionTexto } from '../pedido-direccion'

describe('pickDireccionTexto', () => {
  it('negocio gana cuando tiene dirección/barrio', () => {
    const r = pickDireccionTexto({
      cliente: { direccion: 'Calle 1', barrio: 'Centro' },
      negocio: { direccion: 'Cra 10 #20-30', barrio: 'Norte' },
    })
    expect(r).toEqual({ direccion: 'Cra 10 #20-30', barrio: 'Norte', fuente: 'negocio' })
  })

  it('cae a cliente si negocio no tiene dirección ni barrio', () => {
    const r = pickDireccionTexto({
      cliente: { direccion: 'Calle 1', barrio: 'Centro' },
      negocio: { direccion: null, barrio: null },
    })
    expect(r).toEqual({ direccion: 'Calle 1', barrio: 'Centro', fuente: 'cliente' })
  })

  it('negocio con solo barrio (sin dirección) sigue ganando', () => {
    const r = pickDireccionTexto({
      cliente: { direccion: 'Calle 1', barrio: 'Centro' },
      negocio: { direccion: null, barrio: 'Norte' },
    })
    expect(r).toEqual({ direccion: '', barrio: 'Norte', fuente: 'negocio' })
  })

  it('ninguna fuente tiene texto → fuente "ninguna"', () => {
    expect(pickDireccionTexto({ cliente: { direccion: null, barrio: null }, negocio: { direccion: null, barrio: null } }))
      .toEqual({ direccion: '', barrio: '', fuente: 'ninguna' })
    expect(pickDireccionTexto({})).toEqual({ direccion: '', barrio: '', fuente: 'ninguna' })
    expect(pickDireccionTexto({ cliente: null, negocio: null })).toEqual({ direccion: '', barrio: '', fuente: 'ninguna' })
  })

  it('strings vacíos o solo espacios se tratan como ausentes', () => {
    const r = pickDireccionTexto({
      cliente: { direccion: 'Calle 1', barrio: 'Centro' },
      negocio: { direccion: '  ', barrio: '' },
    })
    expect(r).toEqual({ direccion: 'Calle 1', barrio: 'Centro', fuente: 'cliente' })
  })

  it('override gana sobre negocio y cliente', () => {
    const r = pickDireccionTexto({
      cliente: { direccion: 'Calle 1', barrio: 'Centro' },
      negocio: { direccion: 'Cra 10 #20-30', barrio: 'Norte' },
      overrideDireccion: 'Entregar en portería edificio X',
      overrideBarrio: 'Chapinero',
    })
    expect(r).toEqual({ direccion: 'Entregar en portería edificio X', barrio: 'Chapinero', fuente: 'override' })
  })

  it('override vacío no gana — cae a negocio', () => {
    const r = pickDireccionTexto({
      cliente: { direccion: 'Calle 1', barrio: 'Centro' },
      negocio: { direccion: 'Cra 10 #20-30', barrio: 'Norte' },
      overrideDireccion: null,
      overrideBarrio: undefined,
    })
    expect(r).toEqual({ direccion: 'Cra 10 #20-30', barrio: 'Norte', fuente: 'negocio' })
  })
})
