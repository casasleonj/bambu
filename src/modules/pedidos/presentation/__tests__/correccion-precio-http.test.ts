// @tests ADR-MONETARIO-002 §1 (Fase D) — traducción de errores de la corrección de precio a HTTP.
import { describe, it, expect } from 'vitest'
import { mapCorreccionPrecioError } from '../correccion-precio-http'

describe('mapCorreccionPrecioError', () => {
  it.each([
    ['FORBIDDEN: solo ADMIN', 403],
    ['PEDIDO_NOT_FOUND', 404],
    ['LINEA_NO_ENCONTRADA: x', 404],
    ['PRECIO_INVALIDO: x', 400],
    ['MOTIVO_REQUERIDO: x', 400],
    ['PEDIDO_NO_CORREGIBLE: x', 409],
    ['CORRECCION_PENDIENTE: x', 409],
    ['CORRECCION_OBSOLETA: x', 409],
    ['PRECIO_GENERARIA_SOBREPAGO: x', 422],
  ])('%s → %i', (msg, status) => {
    expect(mapCorreccionPrecioError(msg)?.status).toBe(status)
  })

  it('devuelve el código y el texto sin el prefijo', () => {
    expect(mapCorreccionPrecioError('PRECIO_GENERARIA_SOBREPAGO: ya pagó de más')).toEqual({
      status: 422,
      message: 'ya pagó de más',
      code: 'PRECIO_GENERARIA_SOBREPAGO',
    })
  })

  it('un error desconocido no se traduce', () => {
    expect(mapCorreccionPrecioError('boom')).toBeNull()
  })
})
