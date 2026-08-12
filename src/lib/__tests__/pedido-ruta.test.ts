// @tests pedido-ruta — regla única de ruta efectiva de un pedido.
// Mismo contrato que pickCoords: negocio gana, cliente es fallback.

import { describe, it, expect } from 'vitest'
import { pickRutaId } from '../pedido-ruta'

describe('pickRutaId', () => {
  it('negocio gana cuando tiene rutaId', () => {
    const r = pickRutaId({
      cliente: { rutaId: 'ruta-cliente' },
      negocio: { rutaId: 'ruta-negocio' },
    })
    expect(r).toBe('ruta-negocio')
  })

  it('cae a cliente si negocio no tiene rutaId', () => {
    const r = pickRutaId({
      cliente: { rutaId: 'ruta-cliente' },
      negocio: { rutaId: null },
    })
    expect(r).toBe('ruta-cliente')
  })

  it('cae a cliente si no hay negocio', () => {
    const r = pickRutaId({ cliente: { rutaId: 'ruta-cliente' }, negocio: null })
    expect(r).toBe('ruta-cliente')
  })

  it('null si ninguna fuente tiene ruta', () => {
    expect(pickRutaId({ cliente: { rutaId: null }, negocio: { rutaId: null } })).toBeNull()
    expect(pickRutaId({})).toBeNull()
    expect(pickRutaId({ cliente: null, negocio: null })).toBeNull()
  })
})
