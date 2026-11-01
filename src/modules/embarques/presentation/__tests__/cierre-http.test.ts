import { describe, it, expect } from 'vitest'
import { mapCierreError } from '../cierre-http'

describe('mapCierreError — estado del embarque (#550)', () => {
  it('un embarque CERRADO responde «ya está cerrado»', () => {
    expect(mapCierreError('EMBARQUE_YA_CERRADO')).toEqual({ status: 400, message: 'El embarque ya esta cerrado' })
    expect(mapCierreError('Transicion invalida: CERRADO -> CERRADO. Permitidas: ninguna (estado terminal)')).toEqual({
      status: 400,
      message: 'El embarque ya esta cerrado',
    })
  })

  it('cerrar un embarque ABIERTO NO dice «ya está cerrado»: pide despacharlo primero', () => {
    const r = mapCierreError('Transicion invalida: ABIERTO -> CERRADO. Permitidas: EN_RUTA, CANCELADO')
    expect(r?.status).toBe(400)
    expect(r?.message).not.toMatch(/ya esta cerrado/i)
    expect(r?.message).toMatch(/aún no salió a ruta/)
    expect(r?.message).toMatch(/despácha/i)
  })

  it('cerrar un embarque CANCELADO dice que está cancelado', () => {
    const r = mapCierreError('Transicion invalida: CANCELADO -> CERRADO. Permitidas: ninguna (estado terminal)')
    expect(r?.status).toBe(400)
    expect(r?.message).toMatch(/cancelado/)
    expect(r?.message).not.toMatch(/ya esta cerrado/i)
  })

  it('cualquier otra transición inválida dice los estados, sin inventar que está cerrado', () => {
    const r = mapCierreError('Transicion invalida: EN_RUTA -> ABIERTO. Permitidas: CERRADO')
    expect(r?.status).toBe(400)
    expect(r?.message).toContain('EN_RUTA')
    expect(r?.message).toContain('ABIERTO')
    expect(r?.message).not.toMatch(/ya esta cerrado/i)
  })

  it('el resto de los mapeos no cambia', () => {
    expect(mapCierreError('EMBARQUE_NOT_FOUND')).toEqual({ status: 404, message: 'Embarque no encontrado' })
    expect(mapCierreError('PAGOS_EXCEDIDOS: el cobro excede el saldo')).toEqual({ status: 400, message: 'el cobro excede el saldo' })
    expect(mapCierreError('algo desconocido')).toBeNull()
  })
})
